import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

vi.mock("@insforge/sdk/ssr/middleware", () => ({
  updateSession: vi.fn(async () => null),
}));

describe("backend security boundaries", () => {
  const originalSha = process.env.RAILWAY_GIT_COMMIT_SHA;

  beforeEach(() => {
    process.env.RAILWAY_GIT_COMMIT_SHA = "release-sha";
  });

  afterEach(() => {
    if (originalSha === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
    else process.env.RAILWAY_GIT_COMMIT_SHA = originalSha;
    vi.clearAllMocks();
  });

  it("reports the deployed commit SHA from the health route", async () => {
    const { GET } = await import("../src/app/api/health/route.ts");

    const response = GET();

    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      sha: "release-sha",
    });
  });

  it("allows Stripe webhook requests to reach signature verification", async () => {
    const { middleware } = await import("../src/middleware.ts");
    const { NextRequest } = await import("next/server");
    const request = new NextRequest("https://app.example/api/stripe/webhook", {
      method: "POST",
    });

    const response = await middleware(request);

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not expose lookalike API auth paths", async () => {
    const { middleware } = await import("../src/middleware.ts");
    const { NextRequest } = await import("next/server");
    const request = new NextRequest("https://app.example/api/authentication");

    const response = await middleware(request);

    expect(response.headers.get("location")).toBe(
      "https://app.example/login?next=%2Fapi%2Fauthentication",
    );
  });

  it("preserves protected-route query parameters through login", async () => {
    const { middleware } = await import("../src/middleware.ts");
    const { NextRequest } = await import("next/server");
    const request = new NextRequest("https://app.example/app/runs?status=failed");

    const response = await middleware(request);

    expect(response.headers.get("location")).toBe(
      "https://app.example/login?next=%2Fapp%2Fruns%3Fstatus%3Dfailed",
    );
  });

  it("falls back to the dashboard after an untrusted login redirect", async () => {
    const { safeRedirectPath } = await import("../src/lib/redirects.ts");

    expect(safeRedirectPath("https://attacker.example/phish")).toBe("/app");
  });

  it("enforces the signup password length at the backend boundary", async () => {
    const config = await readFile(new URL("../insforge.toml", import.meta.url), "utf8");

    expect(config).toMatch(/\[auth\.password\][\s\S]*min_length = 10(?:\r?\n|$)/);
  });

  it("never requires email verification while SMTP delivery is disabled (AUTHZ-001)", async () => {
    const config = await readFile(new URL("../insforge.toml", import.meta.url), "utf8");

    let section = "";
    let verificationRequired = false;
    let smtpEnabled = false;
    for (const line of config.split(/\r?\n/)) {
      const heading = line.match(/^\[(.+)\]\s*$/);
      if (heading) {
        section = heading[1];
        continue;
      }
      if (section === "auth" && /^require_email_verification\s*=\s*true\s*$/.test(line)) {
        verificationRequired = true;
      }
      if (section === "auth.smtp" && /^enabled\s*=\s*true\s*$/.test(line)) {
        smtpEnabled = true;
      }
    }

    // 6-digit verification codes are undeliverable with SMTP off; requiring
    // verification then dead-ends every signup at the OTP step (AUTHZ-001).
    // Re-enable both together or neither.
    if (verificationRequired) {
      expect(smtpEnabled).toBe(true);
    }
  });
});
