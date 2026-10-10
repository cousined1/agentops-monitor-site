import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two migration homes exist in this repo. `migrations/` is canonical;
// `supabase/migrations/` is a legacy location that predates the move to
// InsForge and now holds only 2 of the 13 migrations.
//
// This is not hypothetical: DATA-003 (2026-09-15) was exactly this bug. A
// migration that had been applied to production existed ONLY under
// supabase/migrations/, leaving a gap in the canonical replay chain - the
// replay chain looked complete and was not. It has already bitten this repo
// once.
//
// The hazard today: anyone (or any agent) applying from the legacy home gets
// 2 migrations instead of 13, and one of those two has already silently
// DIVERGED from its canonical counterpart - same intent, different bytes
// (1182 vs 879, the canonical copy carrying restored explanatory comments).
// Two copies of one migration is two answers to "what does this do", which is
// the same class of defect as two copies of one contract.
//
// Nothing is deleted here. This guard makes the split visible and keeps it
// from getting worse; consolidating to one home is an operator decision.

const CANONICAL = join(process.cwd(), "migrations");
const LEGACY = join(process.cwd(), "supabase", "migrations");

function listSql(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name)
    .sort();
}

// supabase used `20260903100000_stripe_billing_fields.sql` where the canonical
// home uses `20260903100000_stripe-billing-fields.sql`: the timestamp separator
// stays an underscore, only the descriptive suffix changes.
function canonicalName(name) {
  const base = name.replace(/\.sql$/, "");
  const ts = base.slice(0, 15);
  return `${ts}${base.slice(15).replace(/_/g, "-")}.sql`;
}

describe("migration homes do not silently diverge", () => {
  it("migrations/ is a real canonical chain, not an empty or partial directory", () => {
    const canonical = listSql(CANONICAL);

    // Every migration referenced by the application must be replayable in
    // order. Guard the shape, not an exact count, so adding one is fine.
    expect(canonical.length).toBeGreaterThanOrEqual(10);

    const first = canonical[0];
    const last = canonical[canonical.length - 1];
    // Lexicographic order == chronological order for these timestamps, so the
    // chain replays in the order it was written.
    expect(first < last, `chain out of order: ${first} .. ${last}`).toBe(true);
  });

  it("the ingest quota migration lives in the canonical chain", () => {
    // This is the file whose absence would silently leave free ingest
    // unlimited while the route's 402 branch sits inert.
    expect(listSql(CANONICAL)).toContain("20261009120000_free-tier-run-quota.sql");
  });

  it("no legacy copy diverges from its canonical counterpart", () => {
    const legacy = listSql(LEGACY);
    if (legacy.length === 0) return; // already consolidated

    const divergent = [];
    const orphaned = [];

    for (const name of legacy) {
      const candidate = join(CANONICAL, canonicalName(name));
      if (!existsSync(candidate)) {
        orphaned.push(name);
        continue;
      }
      const legacyBody = readFileSync(join(LEGACY, name), "utf8").replace(/\r\n/g, "\n");
      const canonicalBody = readFileSync(candidate, "utf8").replace(/\r\n/g, "\n");
      if (legacyBody !== canonicalBody) {
        divergent.push(`${name} <-> ${canonicalName(name)}`);
      }
    }

    // An orphaned legacy file is the DATA-003 shape: a migration that exists
    // outside the replay chain. Divergence is two answers to one question.
    expect(
      orphaned,
      `migrations exist only under supabase/migrations/ and would be skipped by a canonical replay: ${orphaned.join(", ")}`,
    ).toEqual([]);
    expect(
      divergent,
      `legacy copies have drifted from migrations/ - one migration, two definitions: ${divergent.join(", ")}`,
    ).toEqual([]);
  });

  it("does not accumulate new files in the legacy home", () => {
    // The legacy home is frozen at its historical two files. If this fails,
    // a new migration was written to the wrong place and never joined the
    // canonical chain.
    expect(listSql(LEGACY).length).toBeLessThanOrEqual(2);
  });

  it("canonical migrations are non-empty SQL, not placeholders", () => {
    const empties = listSql(CANONICAL).filter((name) => {
      const full = join(CANONICAL, name);
      return statSync(full).size === 0 || !/\b(create|alter|insert|update|drop)\b/i.test(readFileSync(full, "utf8"));
    });

    expect(empties, `migrations with no SQL statements: ${empties.join(", ")}`).toEqual([]);
  });
});