import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// P1-4 (client half): key-creator.tsx read the API error body as { error?: string }
// and only accepted it when `typeof data.error === "string"`. The canonical envelope
// is { error: { message, code } }, so that guard went false and the server's actual
// message was discarded in favour of ky's generic HTTP text - the specific "we could
// not reach authentication" signal never reached the operator. Source-level
// assertions, matching tests/p1-3-outage-gating.test.mjs, because the helper lives in
// a "use client" module whose react/next imports cannot load in the node test env.

const SRC = "src/app/(app)/app/api-keys/key-creator.tsx";

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function shimOf(src) {
  const start = src.indexOf("function errorMessageFrom");
  const end = src.indexOf("export function KeyCreator");
  expect(start, "errorMessageFrom helper must exist").toBeGreaterThan(-1);
  expect(end, "KeyCreator component must exist").toBeGreaterThan(-1);
  return src.slice(start, end);
}

describe("P1-4: the API key form surfaces the server's real error message", () => {
  it("no longer narrows the error body to a flat string", () => {
    const src = read(SRC);

    // The old cast is what made the nested envelope unreadable.
    expect(src).not.toContain("as { error?: string }");
    expect(src).not.toContain('typeof data.error === "string"');
  });

  it("parses the body as unknown and delegates to the shim", () => {
    const src = read(SRC);

    expect(src).toContain("const data: unknown = await error.response.json()");
    expect(src).toContain("errorMessageFrom(data)");
  });

  it("the shim accepts the nested envelope", () => {
    const shim = shimOf(read(SRC));

    // Nested: { error: { message, code } } - read error.message.
    expect(shim).toContain("(err as { message?: unknown }).message");
    expect(shim).toContain('if (typeof message === "string") return message;');
  });

  it("the shim still accepts the legacy flat string", () => {
    const shim = shimOf(read(SRC));

    // Kept so the client is correct on both sides of the envelope migration.
    expect(shim).toContain('if (typeof err === "string") return err;');
  });

  it("the shim returns null rather than inventing text", () => {
    const shim = shimOf(read(SRC));

    // Null lets the caller fall through to its own fallback. \s* so the
    // assertion survives this repo's CRLF line endings.
    expect(shim.trim()).toMatch(/return null;\s*\}$/);
  });

  it("still falls back to a real message rather than swallowing the failure", () => {
    const src = read(SRC);

    expect(src).toContain("Unable to generate an API key.");
  });
});
