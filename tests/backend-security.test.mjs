import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createAdminClient } from "@insforge/sdk";
import { createServerClient } from "@insforge/sdk/ssr";

vi.mock("@insforge/sdk/ssr/middleware", () => ({
  updateSession: vi.fn(async () => null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));
vi.mock("@insforge/sdk/ssr", () => ({
  createAuthActions: vi.fn(() => ({
    signOut: vi.fn(async () => ({ error: null })),
  })),
  // F-05/F-06: route handlers under test call getServerClient(), which builds
  // on createServerClient; individual tests stub its auth/database behavior.
  createServerClient: vi.fn(),
}));

// AUDIT-RUN-20260930-202741: /api/leads persists via the admin client now
// (FINDING-api-surface-001), so this suite needs a backend stub. Default is a
// successful write; individual tests can override when they need a failure.
vi.mock("@insforge/sdk", () => ({
  createAdminClient: vi.fn(() => ({
    database: { from: () => ({ insert: async () => ({ data: null, error: null }) }) },
  })),
}));

// AUDIT-RUN-20260930-202741: /api/leads persists via the admin client now
// (FINDING-api-surface-001), so this suite needs a backend stub. Default is a
// successful write; individual tests can override when they need a failure.
vi.mock("@insforge/sdk", () => ({
  createAdminClient: vi.fn(() => ({
    database: { from: () => ({ insert: async () => ({ data: null, error: null }) }) },
  })),
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

  it("returns a JSON 401 (not an HTML login redirect) for lookalike API auth paths", async () => {
    // REL-008: API consumers cannot follow HTML redirects; the middleware
    // must answer /api/* without a session using a machine-readable 401.
    const { middleware } = await import("../src/middleware.ts");
    const { NextRequest } = await import("next/server");
    const request = new NextRequest("https://app.example/api/authentication");

    const response = await middleware(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
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

  it("allows chatbot lead capture requests to reach /api/leads without redirect", async () => {
    const { middleware } = await import("../src/middleware.ts");
    const { NextRequest } = await import("next/server");
    const request = new NextRequest("https://app.example/api/leads", {
      method: "POST",
    });

    const response = await middleware(request);

    expect(response.headers.get("location")).toBeNull();
  });

  it("handles lead capture POST and OPTIONS at /api/leads", async () => {
    process.env.NEXT_PUBLIC_INSFORGE_URL = "https://backend.example";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY = "anon-key-with-at-least-twenty-characters";
    process.env.INSFORGE_API_KEY = "admin-key-with-at-least-twenty-characters";
    const { POST, OPTIONS } = await import("../src/app/api/leads/route.ts");
    const { NextRequest } = await import("next/server");

    const postReq = new NextRequest("https://app.example/api/leads", {
      method: "POST",
      body: JSON.stringify({ email: "lead@example.com", company: "Acme Corp" }),
    });

    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);
    await expect(postRes.json()).resolves.toEqual(
      expect.objectContaining({ status: "ok" }),
    );

    const optionsRes = await OPTIONS(new Request("https://app.example/api/leads"));
    expect(optionsRes.status).toBe(204);
    expect(optionsRes.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("redirects sign-out requests to the origin login URL", async () => {
    process.env.NEXT_PUBLIC_INSFORGE_URL = "https://backend.example";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY = "anon-key-with-at-least-twenty-characters";
    process.env.INSFORGE_API_KEY = "admin-key-with-at-least-twenty-characters";

    const { POST } = await import("../src/app/api/auth/sign-out/route.ts");
    const { NextRequest } = await import("next/server");
    const request = new NextRequest("https://agentopsmonitor.com/api/auth/sign-out", {
      method: "POST",
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toBe("https://agentopsmonitor.com/login");
  });
});

describe("F-05 duplicate-checkout guard and F-06 outage handling", () => {
  const AUTH_OUTAGE = new Error("DB Connection Refused");

  beforeEach(() => {
    process.env.NEXT_PUBLIC_INSFORGE_URL = "https://backend.example";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY = "anon-key-with-at-least-twenty-characters";
    process.env.INSFORGE_API_KEY = "admin-key-with-at-least-twenty-characters";
    createAdminClient.mockImplementation(() => ({
      database: { from: () => ({ insert: async () => ({ data: null, error: null }) }) },
    }));
  });

  function stubSession({ user = null, authError = null } = {}) {
    createServerClient.mockResolvedValue({
      auth: {
        getCurrentUser: async () => ({
          data: user ? { user } : { user: null },
          error: authError,
        }),
      },
    });
  }

  function stubProfiles(rows) {
    createAdminClient.mockReturnValue({
      database: {
        from: (table) =>
          table === "profiles"
            ? { select: () => ({ eq: async () => ({ data: rows, error: null }) }) }
            : { insert: async () => ({ data: null, error: null }) },
      },
    });
  }

  // Hoisted lazily so the mocked next/headers module above applies.
  let NextRequestShim = null;
  async function nextRequest(url, init) {
    if (!NextRequestShim) {
      ({ NextRequest: NextRequestShim } = await import("next/server"));
    }
    return new NextRequestShim(url, init);
  }

  it("F-05: active subscriber is routed to /billing, not a new checkout session", async () => {
    stubSession({ user: { id: "user-1", email: "team@example.com" } });
    stubProfiles([
      { id: "user-1", stripe_customer_id: "cus_1", subscription_status: "active", current_plan_name: "team", current_period_end: null },
    ]);
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");
    const request = await nextRequest("https://app.example/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "/billing",
      message: "Already subscribed",
    });
  });

  it("F-05: trialing subscriber is also blocked from creating a second subscription", async () => {
    stubSession({ user: { id: "user-2", email: "trial@example.com" } });
    stubProfiles([
      { id: "user-2", stripe_customer_id: "cus_2", subscription_status: "trialing", current_plan_name: "team", current_period_end: null },
    ]);
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");
    const request = await nextRequest("https://app.example/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ url: "/billing" });
  });

  it("F-05: past_due subscribers are also routed to /billing, not a new checkout session", async () => {
    stubSession({ user: { id: "user-3", email: "pastdue@example.com" } });
    stubProfiles([
      { id: "user-3", stripe_customer_id: "cus_3", subscription_status: "past_due", current_plan_name: "team", current_period_end: null },
    ]);
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");
    const request = await nextRequest("https://app.example/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ url: "/billing" });
  });

  it("F-05: unauthenticated checkout attempt redirects to /signup", async () => {
    stubSession();
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");
    const request = await nextRequest("https://app.example/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example/signup");
  });

  it("F-06: api-keys POST maps an InsForge auth outage to 503, not 401", async () => {
    stubSession({ authError: AUTH_OUTAGE });
    const { POST } = await import("../src/app/api/api-keys/route.ts");
    const request = await nextRequest("https://app.example/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "ci" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "auth_unavailable" },
    });
  });

  it("F-06: api-keys PATCH and DELETE map an InsForge auth outage to 503", async () => {
    const { PATCH, DELETE } = await import("../src/app/api/api-keys/route.ts");

    stubSession({ authError: AUTH_OUTAGE });
    const patchReq = await nextRequest("https://app.example/api/api-keys", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "key-1", is_active: false }),
    });
    const patchRes = await PATCH(patchReq);
    expect(patchRes.status).toBe(503);
    await expect(patchRes.json()).resolves.toMatchObject({
      error: { code: "auth_unavailable" },
    });

    stubSession({ authError: AUTH_OUTAGE });
    const deleteReq = await nextRequest("https://app.example/api/api-keys", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "key-1" }),
    });
    const deleteRes = await DELETE(deleteReq);
    expect(deleteRes.status).toBe(503);
    await expect(deleteRes.json()).resolves.toMatchObject({
      error: { code: "auth_unavailable" },
    });
  });

  it("F-06: billing portal maps an InsForge auth outage to 503", async () => {
    stubSession({ authError: AUTH_OUTAGE });
    const { POST } = await import("../src/app/api/billing/portal/route.ts");
    const request = await nextRequest("https://app.example/api/billing/portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "auth_unavailable" },
    });
  });

  it("F-06: checkout maps an InsForge auth outage to 503 before any redirect", async () => {
    stubSession({ authError: AUTH_OUTAGE });
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");
    const request = await nextRequest("https://app.example/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "auth_unavailable" },
    });
  });

  it("F-06: a genuinely sessionless request still returns 401", async () => {
    stubSession();
    const { POST } = await import("../src/app/api/api-keys/route.ts");
    const request = await nextRequest("https://app.example/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "ci" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("F-06: error boundaries are client components with a Try again reset", async () => {
    for (const file of ["../src/app/error.tsx", "../src/app/(app)/error.tsx"]) {
      const source = await readFile(new URL(file, import.meta.url), "utf8");
      expect(source).toMatch(/"use client"/);
      expect(source).toContain("Try again");
      expect(source).toMatch(/\breset\b/);
    }
  });

  it("F-06: api-keys page renders an outage notice instead of a false empty state", async () => {
    const source = await readFile(
      new URL("../src/app/(app)/app/api-keys/page.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/Could not load your API keys/);
  });

  it("F-05: active subscribers are routed to the billing portal from pricing", async () => {
    const button = await readFile(
      new URL("../src/app/(marketing)/pricing/SubscribeButton.tsx", import.meta.url),
      "utf8",
    );
    const page = await readFile(
      new URL("../src/app/(marketing)/pricing/page.tsx", import.meta.url),
      "utf8",
    );
    expect(button).toContain("/api/billing/portal");
    expect(button).toMatch(/subscribed/);
    expect(button).toContain("/signup");
    expect(page).toContain("getSessionState");
    expect(page).toContain("authUnavailable");
    expect(page).toMatch(/subscription_status/);
  });
});


