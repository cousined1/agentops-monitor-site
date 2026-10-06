import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiError } from "../src/lib/api-error.ts";

describe("apiError", () => {
  it("wraps the message and code in a single nested error object", async () => {
    const response = apiError(400, "Invalid JSON", "invalid_json");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Invalid JSON", code: "invalid_json" },
    });
  });

  it("preserves the request status for each error class", () => {
    expect(apiError(401, "Unauthorized", "unauthorized").status).toBe(401);
    expect(apiError(404, "Not found", "not_found").status).toBe(404);
    expect(apiError(413, "Lead payload too large.", "payload_too_large").status).toBe(413);
    expect(apiError(429, "Too many requests.", "rate_limited").status).toBe(429);
    expect(apiError(503, "Auth unavailable", "auth_unavailable").status).toBe(503);
  });

  it("applies custom headers to the response", () => {
    const response = apiError(429, "Too many lead submissions; try again shortly.", "rate_limited", {
      headers: { "Retry-After": "30" },
    });

    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("merges extra fields alongside the error envelope", async () => {
    const response = apiError(
      503,
      "We could not record your details. Please try again in a moment.",
      "write_failed",
      { headers: { "Retry-After": "30" }, extra: { correlationId: "abc123" } },
    );

    expect(response.headers.get("retry-after")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      correlationId: "abc123",
      error: {
        message: "We could not record your details. Please try again in a moment.",
        code: "write_failed",
      },
    });
  });

  it("leaves no flat error literals in the normalized routes", () => {
    const repoRoot = process.cwd();
    const targets = [
      join(repoRoot, "src", "middleware.ts"),
      join(repoRoot, "src", "app", "api", "api-keys", "route.ts"),
      join(repoRoot, "src", "app", "api", "account", "route.ts"),
      join(repoRoot, "src", "app", "api", "leads", "route.ts"),
      join(repoRoot, "src", "app", "api", "billing", "status", "route.ts"),
      join(repoRoot, "src", "app", "api", "billing", "portal", "route.ts"),
      join(repoRoot, "src", "app", "api", "billing", "checkout", "route.ts"),
      join(repoRoot, "src", "app", "api", "stripe", "webhook", "route.ts"),
    ];

    for (const target of targets) {
      const content = readFileSync(target, "utf8");
      // Flat shape: { error: "message" } or { error: `...` }
      expect(content, `flat error literal in ${target}`).not.toMatch(
        /\{\s*error:\s*["'`]/,
      );
      // Inline nested literal: NextResponse.json({ error: { message, code } }, ...)
      // These must go through apiError() so the envelope stays defined in one place.
      expect(content, `inline error envelope in ${target}`).not.toMatch(
        /NextResponse\.json\(\s*\{\s*error:\s*\{/,
      );
      expect(content, `multiline inline error envelope in ${target}`).not.toMatch(
        /error:\s*\{\s*\n\s*message:/,
      );
    }
  });

  it("normalizes the middleware 401 to the unauthorized code", () => {
    const content = readFileSync(join(process.cwd(), "src", "middleware.ts"), "utf8");

    expect(content).toMatch(/apiError\(401,\s*"Unauthorized",\s*"unauthorized"\)/);
    expect(content).toMatch(/REL-008/);
    expect(content).toMatch(/REFRESHED_ACCESS_TOKEN_HEADER/);
  });
});
