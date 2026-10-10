import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// P1-3 (High): a database outage must never render as an empty or zero state.
// The three signed-in dashboard pages already carried a dbError banner, but the
// derived values were still coalesced, so an unreachable database told the user
// "No runs yet. Generate an API key to start ingesting." - claiming their data
// was gone and prompting a pointless action. Source-level assertions, matching
// tests/customer-simulation.test.mjs, because these are async server components.

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("P1-3: outage renders as an outage, not as empty data", () => {
  it("runs list: a failed count is not zero runs", () => {
    const runs = read("src/app/(app)/app/runs/page.tsx");

    // The count query's error was previously dropped on the floor, so a
    // count-only failure rendered a confident "0 runs total".
    expect(runs).toMatch(/if \(countResult\.error\)/);
    expect(runs).toContain("countResult.error ? null");
    expect(runs).toMatch(
      /runsResult\.error\?\.message \?\? countResult\.error\?\.message/
    );

    // A null total is a third state ("unavailable"), never 0.
    expect(runs).not.toMatch(/const total = countResult\.count \?\? 0/);

    // The pagination line must not state a total it could not read.
    expect(runs).toContain("total === null");
  });

  it("runs list: a failed query does not render the empty state", () => {
    const runs = read("src/app/(app)/app/runs/page.tsx");

    // runs is null on failure; the old truthiness guard fell through to
    // "No runs yet." directly beneath the error banner.
    expect(runs).toContain("runs === null ? null : runs.length > 0");
  });

  it("dashboard: counts render as unavailable rather than 0", () => {
    const dash = read("src/app/(app)/app/page.tsx");

    expect(dash).toContain('totalRuns ?? "\u2014"');
    expect(dash).toContain('totalKeys ?? "\u2014"');
    expect(dash).not.toMatch(/totalRuns \?\? 0/);
    expect(dash).not.toMatch(/totalKeys \?\? 0/);
  });

  it("dashboard: failed reads do not render empty states or prompts", () => {
    const dash = read("src/app/(app)/app/page.tsx");

    expect(dash).toContain("runs === null ? null : runs.length > 0");
    expect(dash).toContain("keys === null ? null : keys.length > 0");
  });

  it("api keys: the SDK error channel is inspected, not just thrown errors", () => {
    const keysPage = read("src/app/(app)/app/api-keys/page.tsx");

    // The page wraps the query in try/catch AND renders a keysError branch, and
    // a test asserting only those two facts passed for the whole time the page
    // was still broken. @insforge/sdk wraps @supabase/postgrest-js: a query
    // resolves with { data, error } and does NOT throw, so try/catch can never
    // fire on an outage and `data` is simply null - which rendered the false
    // "No keys yet. Create one above." that this gate exists to prevent.
    // The load-bearing assertion is that `.error` is destructured and acted on.
    expect(keysPage).toMatch(/const \{ data, error \} = await insforge\.database/);
    expect(keysPage).toMatch(/if \(error\) \{/);
    // And the error must set keysError, not fall through to the empty state.
    expect(keysPage).toMatch(/if \(error\) \{[\s\S]*?keysError = true;/);
    // A destructuring that silently drops `.error` is the exact regression.
    expect(keysPage).not.toMatch(/const \{ data \} = await insforge\.database/);
  });

  it("api keys: the error gate stays ahead of the empty state", () => {
    const keysPage = read("src/app/(app)/app/api-keys/page.tsx");

    // Already correct when the audit was written - locked in so it cannot
    // regress to the dashboard's shape.
    expect(keysPage).toMatch(
      /keysError \? \(\s*<p className="auth-error">Could not load your API keys/
    );
  });

  it("every dashboard page that reads the database inspects .error", () => {
    // The same SDK contract applies to all three signed-in pages. A page that
    // destructures only `data` will render a confident empty state during an
    // outage, so assert the contract rather than trusting any single page.
    const pages = [
      "src/app/(app)/app/page.tsx",
      "src/app/(app)/app/runs/page.tsx",
      "src/app/(app)/app/api-keys/page.tsx",
      "src/app/(app)/app/profile/page.tsx",
    ];

    for (const page of pages) {
      const src = read(page);
      const bareReads = src.match(/const \{ data \} = await insforge\.database/g) ?? [];
      expect(bareReads, `${page} destructures only \`data\``).toEqual([]);
    }
  });

  it("profile page: an auth outage must not look like being signed out", () => {
    const profile = read("src/app/(app)/app/profile/page.tsx");

    // The page read the session with a bare `const { data: userData } = await
    // getCurrentUser()`, which drops the SDK error channel - so any auth blip
    // sent the customer to /login as if their session had expired. The layout
    // and billing page already use getSessionState() to tell the two apart.
    expect(profile).not.toMatch(/const \{ data: userData \} = await insforge\.auth\.getCurrentUser\(\)/);
    expect(profile).toContain("getSessionState()");
    expect(profile).toMatch(/if \(unavailable\)/);
  });

  it("profile page: a failed profile read is not a blank profile", () => {
    const profile = read("src/app/(app)/app/profile/page.tsx");

    // On an outage `data` is null, so rendering `profile?.full_name ?? "-"`
    // claimed the customer had never filled in a name or company.
    expect(profile).toContain("profileError");
    expect(profile).toMatch(/if \(error\) \{[\s\S]*?profileError = true;/);
    expect(profile).toContain("could not load your profile details");
  });

  it("runs list: an unknown count must not strand the customer on a dead Next", () => {
    const runs = read("src/app/(app)/app/runs/page.tsx");

    // totalPages collapses to 1 when the count is unavailable, which rendered a
    // disabled "Next" for anyone on page 2+ even though pages existed.
    expect(runs).toMatch(/const hasNext = countUnknown \|\| page < totalPages;/);
    expect(runs).toContain("hasNext ? <Link");
  });

  it("billing portal: a 401 offers a way back in", () => {
    const portal = read("src/app/(app)/billing/PortalButton.tsx");

    // It used to set an inert "Please sign in again." string and return, with
    // no redirect and no link - the only way out was typing the URL by hand.
    expect(portal).toContain("/login?next=");
    expect(portal).toContain("needsLogin");
    expect(portal).toMatch(/res\.status === 401[\s\S]*?setNeedsLogin\(true\)/);
  });
});
