import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeAuthMessage } from "../src/lib/auth-errors.ts";

// Two privacy/advisability defects in the analytics + auth-copy path:
//
// 1. page_path carried the ENTIRE query string. /login and /signup place the
//    auth provider's message in `?error=`, and safeAuthMessage passes several
//    of those messages through verbatim - so a message containing the address
//    the visitor typed was pushed to the analytics vendor on every failed
//    sign-in.
// 2. safeAuthMessage's allowlist contained bare /expired/i and /required/i,
//    which match almost any driver string. Internal text such as
//    "column profiles.plan is required" passed the filter and was rendered to
//    the customer verbatim on /login.

const repo = process.cwd();

function read(relativePath) {
  return readFileSync(join(repo, relativePath), "utf8");
}

// Assert on the shipped `description` VALUE, not on a whole-file substring.
// The layout documents this fix inline, so scanning the file matched the
// comment describing the old string rather than the metadata - and rewording a
// correct comment to satisfy a measurement that cannot read code would be the
// wrong fix. Extracting the field is both precise and comment-proof.
function metadataDescription(source) {
  const match = source.match(/description:\s*["'`]([^"'`]*)/);
  return match ? match[1] : null;
}

describe("analytics does not receive auth error text or PII", () => {
  it("strips every query parameter except the campaign allowlist", () => {
    const component = read("src/components/Analytics.tsx");

    // The old line appended the whole search string to page_path.
    expect(component).not.toMatch(
      /const url = pathname \+ \(search \? `\?\$\{search\}` : ""\)/,
    );
    expect(component).not.toMatch(/window\.location\.search\.replace\(\/\^\\\?\/, ""\)/);

    // An explicit allowlist, so a new sensitive param is dropped by default.
    expect(component).toContain("ALLOWED_PARAMS");
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
      expect(component).toContain(key);
    }
  });

  it("still tracks campaign parameters so attribution is not lost", () => {
    const component = read("src/components/Analytics.tsx");
    expect(component).toMatch(/for \(const key of ALLOWED_PARAMS\)/);
    expect(component).toMatch(/kept\.set\(key, value\)/);
  });
});

describe("auth error copy does not leak internal text", () => {
  it("rejects internal strings that the old bare patterns let through", () => {
    // Both of these matched /required/i and were rendered to the customer.
    expect(
      safeAuthMessage("column profiles.plan is required"),
    ).toBe("Authentication failed. Please check your details and try again.");

    expect(safeAuthMessage("relation \"profiles\" does not exist")).toBe(
      "Authentication failed. Please check your details and try again.",
    );

    expect(safeAuthMessage("ECONNREFUSED 10.0.0.4:5432")).toBe(
      "Authentication failed. Please check your details and try again.",
    );
  });

  it("still passes through genuinely actionable validation copy", () => {
    // Tightening the allowlist must not throw the baby out with the bathwater:
    // these are the messages the customers actually need to see.
    const passthrough = [
      "Invalid email or password",
      "User already registered",
      "Email not confirmed",
      "Too many requests",
      "Password is too short",
      "Verification code expired",
      "Reset token has expired",
      "Email is required",
      "Signups are not allowed",
    ];

    for (const message of passthrough) {
      expect(safeAuthMessage(message), message).toBe(message);
    }
  });

  it("handles null and empty input without throwing", () => {
    const generic = "Authentication failed. Please check your details and try again.";
    expect(safeAuthMessage(null)).toBe(generic);
    expect(safeAuthMessage(undefined)).toBe(generic);
    expect(safeAuthMessage("")).toBe(generic);
  });
});

describe("error surfaces stay reachable and diagnosable", () => {
  it("the skip link target exists on 404 and error boundaries", () => {
    // layout.tsx renders <a class="skip-link" href="#main">. not-found.tsx and
    // both error.tsx boundaries rendered <main> with no id, so a keyboard user
    // pressing "Skip to content" on those pages stayed at the top of the nav.
    for (const page of [
      "src/app/not-found.tsx",
      "src/app/error.tsx",
      "src/app/(app)/error.tsx",
    ]) {
      expect(read(page), `${page} has no #main target`).toMatch(/<main id="main"/);
    }
  });

  it("error boundaries surface the digest so support can correlate", () => {
    // Without this, a customer reporting a crash gives support no identifier
    // to search for in the server logs.
    for (const page of ["src/app/error.tsx", "src/app/(app)/error.tsx"]) {
      expect(read(page), `${page} hides error.digest`).toContain("error.digest");
    }
  });

  it("the default meta description does not over-claim", () => {
    // This is the fallback description for every page without its own, so it is
    // what search results and social cards show site-wide.
    const description = metadataDescription(read("src/app/layout.tsx"));
    expect(description).not.toBeNull();
    expect(description).not.toMatch(/Govern every dollar/i);
    expect(description).not.toMatch(/Audit every decision/i);
    expect(description).toMatch(/cost/i);
  });

  it("the comment recording the fix is itself free of the old claim", () => {
    // Guards against the explanation quietly being dropped in a later edit.
    expect(read("src/app/layout.tsx")).toMatch(/over-promise/);
  });
});