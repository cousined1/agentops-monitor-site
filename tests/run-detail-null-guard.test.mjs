import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatCost,
  formatDate,
  formatNumber,
  formatTime,
  formatTokens,
  formatUsd,
} from "../src/lib/format.ts";

// Run detail originally rendered `${run.cost_usd}` raw and called
// `new Date(run.started_at).toLocaleString()` unguarded, so a run with a null
// cost showed the literal "$null" and a null timestamp showed "Invalid Date".
//
// The helpers were then module-private inside runs/[id]/page.tsx, so the guard
// could only scrape that one file. The dashboard and the runs list interpolated
// the same NULLable columns raw the whole time — the guard was green while the
// bug was still live in two of the three run-rendering pages. The helpers now
// live in src/lib/format.ts, which is a pure module, so they are imported and
// executed here instead of scraped as text, and the source sweep covers every
// run-rendering page rather than one named file.

// Derived from the tree, not hardcoded: a hardcoded list is exactly how the
// dashboard and the runs list escaped the original guard.
const APP_ROOT = join(process.cwd(), "src", "app", "(app)", "app");

function collectRunPages(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collectRunPages(full));
    else if (entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

const RUN_PAGES = collectRunPages(APP_ROOT);

// Normalise separators so assertions read the same on Windows and POSIX.
function rel(page) {
  return page.replace(process.cwd(), "").replace(/\\/g, "/");
}

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function unguardedRender(src) {
  const lines = src.split(/\r?\n/);
  return lines
    .map((line, i) => [i + 1, line])
    .filter(([lineNo, line]) => {
      // Any JSX interpolation of a run/span column...
      const interpolates =
        /\$\{[^}]*(cost_usd|tokens_in|tokens_out|started_at|duration_ms|span_count)[^}]*\}/.test(line);
      if (!interpolates) return false;

      // A null-guard ternary legitimately wraps onto following lines, so scan a
      // small window rather than the single line: `cond ? "-"\n : `${x} ms`}`
      // puts the interpolation on a line that carries none of the guard.
      // `lineNo` is 1-based, so the inclusive slice ends at `lineNo`.
      const window = lines.slice(Math.max(0, lineNo - 3), lineNo).join(" ");
      if (/format(Usd|Cost|Tokens|Date|Time|Number)\(/.test(window)) return false;
      // Covers both `=== null` and `!== null` guards, plus `??` fallbacks.
      if (/[!=]==?\s*(null|undefined)/.test(window)) return false;
      if (/\?\?/.test(window)) return false;
      return true;
    });
}

describe("run rendering never leaks a raw NULL", () => {
  it("discovers the run-rendering pages rather than trusting a fixed list", () => {
    // If this fails, the sweep below is silently checking fewer files than the
    // app has — which is how the original single-file guard missed two bugs.
    expect(RUN_PAGES.length).toBeGreaterThanOrEqual(3);
    const names = RUN_PAGES.map(rel);
    expect(names.some((n) => n.includes("runs"))).toBe(true);
    expect(names.some((n) => n.endsWith("(app)/app/page.tsx"))).toBe(true);
  });

  it("no run-rendering page interpolates a NULLable column raw", () => {
    const offenders = RUN_PAGES.flatMap((page) =>
      unguardedRender(readFileSync(page, "utf8")).map(
        ([line, text]) => `${rel(page)}:${line}: ${text.trim()}`,
      ),
    );

    expect(offenders, `unguarded renders:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no page rebuilds a Date from a NULLable timestamp", () => {
    const offenders = RUN_PAGES.filter((page) =>
      /new Date\(\s*(run|span)\.(started_at|ended_at)/.test(readFileSync(page, "utf8")),
    ).map(rel);

    expect(offenders).toEqual([]);
  });

  it("keeps one shared definition instead of per-page copies", () => {
    const localCopies = RUN_PAGES.filter((page) =>
      /function format(Cost|Usd|Tokens|Date|Time|Number)\s*\(/.test(readFileSync(page, "utf8")),
    ).map((p) => p.replace(process.cwd(), ""));

    // A second copy of the contract is how the detail page and the list page
    // disagreed about whether null renders as "-" or as "$null".
    expect(localCopies).toEqual([]);
  });
});

describe("shared run formatters", () => {
  it("formatCost renders a dash for null, undefined and empty", () => {
    expect(formatCost(null)).toBe("-");
    expect(formatCost(undefined)).toBe("-");
    expect(formatCost("")).toBe("-");
    expect(formatCost(0)).toBe("0");
    expect(formatCost(0.08)).toBe("0.08");
  });

  it("formatUsd prefixes a real cost and never emits '$null' or '$-'", () => {
    expect(formatUsd(null)).toBe("-");
    expect(formatUsd(undefined)).toBe("-");
    expect(formatUsd(0.08)).toBe("$0.08");
    expect(formatUsd(0)).toBe("$0");
    for (const bad of [null, undefined, ""]) {
      expect(formatUsd(bad)).not.toContain("$");
    }
  });

  it("formatTokens never produces NaN and reports a fully-missing row", () => {
    expect(formatTokens(null, null)).toBe("-");
    expect(formatTokens(undefined, undefined)).toBe("-");
    expect(formatTokens(null, 5)).toBe("5");
    expect(formatTokens(5, null)).toBe("5");
    expect(formatTokens(5, 7)).toBe("12");
    expect(formatTokens(null, null)).not.toContain("NaN");
    expect(formatTokens(null, null)).not.toContain("null");
  });

  it("formatDate guards null and unparseable input", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
    expect(formatDate("not-a-date")).toBe("-");
    expect(formatDate(new Date("nope"))).toBe("-");
    expect(formatDate("2026-01-02T03:04:05Z")).not.toBe("-");
  });

  it("formatTime guards null and unparseable input", () => {
    expect(formatTime(null)).toBe("-");
    expect(formatTime(undefined)).toBe("-");
    expect(formatTime("not-a-date")).toBe("-");
    expect(formatTime("2026-01-02T03:04:05Z")).not.toBe("-");
  });

  it("formatNumber renders a dash rather than a blank cell", () => {
    expect(formatNumber(null)).toBe("-");
    expect(formatNumber(undefined)).toBe("-");
    expect(formatNumber(0)).toBe("0");
  });

  it("the run detail page routes its cost through the shared guard", () => {
    const detail = read("src/app/(app)/app/runs/[id]/page.tsx");
    expect(detail).toContain("formatUsd(run.cost_usd)");
    expect(detail).toContain("formatUsd(span.cost_usd)");
    expect(detail).not.toContain("${run.cost_usd}");
    expect(detail).not.toContain("${span.cost_usd}");
  });
});