import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the backend InsForge SDK and external services to simulate the customer MVP workflow.
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockAuth = {
  getCurrentUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@insforge/sdk", () => ({
  createAdminClient: vi.fn(() => ({
    database: {
      from: mockFrom,
      rpc: mockRpc,
    },
  })),
}));

vi.mock("@/lib/insforge", () => ({
  getServerClient: vi.fn(async () => ({
    auth: mockAuth,
    database: {
      from: mockFrom,
      rpc: mockRpc,
    },
  })),
  getAuthActions: vi.fn(async () => mockAuth),
  getSessionUser: vi.fn(async () => ({
    id: "user-mvp-123",
    email: "customer@example.com",
    name: "Alex Customer",
  })),
}));

describe("Customer MVP Workflow Simulation", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_INSFORGE_URL = "https://backend.example";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY = "anon-key-with-at-least-twenty-characters";
    process.env.INSFORGE_API_KEY = "admin-key-with-at-least-twenty-characters";
    process.env.INGEST_RATE_LIMIT_PER_MIN = "600";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Step 1: Visitor submits lead / chatbot query via /api/leads", async () => {
    const { POST } = await import("../src/app/api/leads/route.ts");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("https://agentopsmonitor.com/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.42",
      },
      body: JSON.stringify({
        email: "customer@example.com",
        company: "Acme AI Corp",
        source: "landing_chatbot",
        product: "agentops-monitor",
        conversation: [
          { sender: "user", text: "How do budget caps work?" },
          { sender: "bot", text: "Hard caps halt runs at the limit you set." },
        ],
      }),
    });

    // AUDIT-RUN-20260930-202741: the endpoint now persists the lead rather than
    // logging and discarding it (FINDING-api-surface-001), so the backend stub
    // must resolve an insert and the server env must be present.
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("Step 2: Authenticated user creates an API key via JSON and FormData", async () => {
    mockAuth.getCurrentUser.mockResolvedValue({
      data: { user: { id: "user-mvp-123", email: "customer@example.com" } },
    });

    mockFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(async () => ({ data: [{ id: "key-mvp-1" }], error: null })),
      })),
    });

    const { POST } = await import("../src/app/api/api-keys/route.ts");
    const { NextRequest } = await import("next/server");

    // Case A: Creating via JSON (standard developer API usage)
    const jsonReq = new NextRequest("https://agentopsmonitor.com/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "production-refund-agent" }),
    });

    const jsonRes = await POST(jsonReq);
    expect(jsonRes.status).toBe(200);
    const jsonBody = await jsonRes.json();
    expect(jsonBody.ok).toBe(true);
    expect(jsonBody.key).toMatch(/^aom_live_[A-Za-z0-9_-]+$/);

    // Case B: Creating via FormData (dashboard UI form submit)
    const formData = new FormData();
    formData.append("name", "staging-agent");
    const formReq = new NextRequest("https://agentopsmonitor.com/api/api-keys", {
      method: "POST",
      body: formData,
    });

    const formRes = await POST(formReq);
    expect(formRes.status).toBe(200);
    const formBody = await formRes.json();
    expect(formBody.ok).toBe(true);
    expect(formBody.key).toMatch(/^aom_live_[A-Za-z0-9_-]+$/);
  });

  it("Step 3: Customer ingests a complete agent trace via /api/ingest", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        run_id: "00000000-0000-4000-8000-000000000099",
        span_count: 4,
      },
      error: null,
    });

    const { POST } = await import("../src/app/api/ingest/route.ts");
    const { NextRequest } = await import("next/server");

    const runPayload = {
      external_id: "run-refund-triage-400",
      agent_name: "refund-triage-v3",
      status: "completed",
      started_at: "2026-09-25T15:00:00.000Z",
      ended_at: "2026-09-25T15:00:48.219Z",
      duration_ms: 48219,
      tokens_in: 412880,
      tokens_out: 88104,
      cost_usd: 18.44,
      metadata: { environment: "production", customer_tier: "enterprise" },
      spans: [
        {
          id: "00000000-0000-4000-8000-000000000101",
          span_type: "workflow",
          tool_name: "start",
          status: "ok",
          duration_ms: 0,
        },
        {
          id: "00000000-0000-4000-8000-000000000102",
          span_type: "llm",
          provider: "openai",
          model: "gpt-4o",
          tool_name: "openai.chat",
          tokens_in: 8204,
          tokens_out: 512,
          cost_usd: 0.08,
          status: "ok",
          duration_ms: 600,
        },
        {
          id: "00000000-0000-4000-8000-000000000103",
          span_type: "tool",
          provider: "stripe",
          tool_name: "stripe.refunds.create",
          status: "held",
          duration_ms: 208,
          cost_usd: 0,
        },
        {
          id: "00000000-0000-4000-8000-000000000104",
          span_type: "tool",
          provider: "slack",
          tool_name: "slack.postMessage",
          status: "ok",
          duration_ms: 310,
          cost_usd: 0,
        },
      ],
    };

    const req = new NextRequest("https://agentopsmonitor.com/api/ingest", {
      method: "POST",
      headers: {
        authorization: "Bearer aom_live_0123456789abcdef0123456789abcdef0123456789abcdef",
        "content-type": "application/json",
      },
      body: JSON.stringify(runPayload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.run_id).toBe("00000000-0000-4000-8000-000000000099");
    expect(body.span_count).toBe(4);
  });

  it("Step 4: Customer checks billing status via /api/billing/status", async () => {
    mockAuth.getCurrentUser.mockResolvedValue({
      data: { user: { id: "user-mvp-123", email: "customer@example.com" } },
    });

    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              id: "user-mvp-123",
              current_plan_name: "team",
              subscription_status: "active",
              current_period_end: "2026-10-25T00:00:00.000Z",
              stripe_customer_id: "cus_mvp_test_123",
            },
          ],
          error: null,
        }),
      })),
    });

    const { GET } = await import("../src/app/api/billing/status/route.ts");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("https://agentopsmonitor.com/api/billing/status");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe("team");
    expect(body.status).toBe("active");
  });

  it("Step 5: Customer signs out and is cleanly redirected via 303 to /login", async () => {
    const { POST } = await import("../src/app/api/auth/sign-out/route.ts");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("https://agentopsmonitor.com/api/auth/sign-out", {
      method: "POST",
    });

    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://agentopsmonitor.com/login");
    expect(mockAuth.signOut).toHaveBeenCalled();
  });
});

// F-02 (sdk-docs): the docs and LLM-facing files must describe the REAL
// ingestion surface — a plain HTTP POST to /api/ingest with an aom_live_ key —
// and must not reference the fabricated PyPI package, monitor.init, or the
// nonexistent /api/status endpoint.
describe("F-02 documentation truth", () => {
  function read(relativePath) {
    return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
  }

  const quickstartFiles = [
    "src/app/(marketing)/docs/page.tsx",
    "src/app/(marketing)/help/page.tsx",
    "src/app/page.tsx",
    "public/llms.txt",
    "public/llms-full.txt",
  ];

  it("docs quickstart contains no fabricated SDK import or monitor.init", () => {
    const docs = read("src/app/(marketing)/docs/page.tsx");
    expect(docs).not.toContain("from agentops_monitor import monitor");
    expect(docs).not.toContain("monitor.init");
    expect(docs).not.toContain("pip install agentops-monitor");
  });

  it("docs quickstart shows a working HTTP ingest sample with an aom_live_ key", () => {
    const docs = read("src/app/(marketing)/docs/page.tsx");
    expect(docs).toContain("/api/ingest");
    expect(docs).toContain("aom_live_");
    expect(docs).toMatch(/requests\.post|urllib\.request/);
    expect(docs).toContain("Authorization");
  });

  it("no quickstart file references the fabricated /api/status endpoint", () => {
    for (const file of quickstartFiles) {
      expect(read(file), file).not.toContain("/api/status");
    }
  });

  it("no quickstart file references the fabricated PyPI package or init call", () => {
    for (const file of quickstartFiles) {
      const content = read(file);
      expect(content, file).not.toContain("agentops_monitor.init");
      expect(content, file).not.toContain("pip install agentops-monitor");
      expect(content, file).not.toContain("@agentops/monitor");
    }
  });

  it("llms files document the aom_live_ key prefix and the real ingest endpoint", () => {
    for (const file of ["public/llms.txt", "public/llms-full.txt"]) {
      const content = read(file);
      expect(content, file).toContain("aom_live_");
      expect(content, file).toContain("/api/ingest");
      expect(content, file).not.toContain("$49");
    }
  });

  it("llms-full prices Pro at $299/mo", () => {
    const full = read("public/llms-full.txt");
    expect(full).toContain("$299");
  });
});

// F-03 (entitlement): self-healing profile provisioning. A user whose profile
// write failed during signup must be repaired on login and by the billing
// status endpoint, and plan assignments must never be dropped silently.
describe("F-03 entitlement self-heal", () => {
  const USER = { id: "user-mvp-123", email: "customer@example.com" };

  beforeAll(() => {
    // Self-sufficient under `vitest -t` filtering: the env bootstrap in the
    // workflow describe above is skipped when its tests are filtered out.
    process.env.NEXT_PUBLIC_INSFORGE_URL ??= "https://backend.example";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ??= "anon-key-with-at-least-twenty-characters";
    process.env.INSFORGE_API_KEY ??= "admin-key-with-at-least-twenty-characters";
  });

  function profilesMock({ rows, upsert }) {
    return {
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
      })),
      upsert,
    };
  }

  it("billing status repairs a missing profile instead of returning 404", async () => {
    mockAuth.getCurrentUser.mockResolvedValue({ data: { user: USER } });
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockImplementation((table) => {
      expect(table).toBe("profiles");
      return profilesMock({ rows: [], upsert });
    });

    const { GET } = await import("../src/app/api/billing/status/route.ts");
    const { NextRequest } = await import("next/server");

    const res = await GET(new NextRequest("https://agentopsmonitor.com/api/billing/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe("free");
    expect(body.status).toBe("inactive");
    expect(body.repaired).toBe(true);
    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: USER.id, email: USER.email }),
    ]);
  });

  it("billing status returns 401 for an invalid session", async () => {
    mockAuth.getCurrentUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { GET } = await import("../src/app/api/billing/status/route.ts");
    const { NextRequest } = await import("next/server");

    const res = await GET(new NextRequest("https://agentopsmonitor.com/api/billing/status"));
    expect(res.status).toBe(401);
  });

  it("billing status returns 503 on backend outage, not a false 200", async () => {
    mockAuth.getCurrentUser.mockResolvedValue({
      data: null,
      error: new Error("DB Connection Refused"),
    });

    const { GET } = await import("../src/app/api/billing/status/route.ts");
    const { NextRequest } = await import("next/server");

    const res = await GET(new NextRequest("https://agentopsmonitor.com/api/billing/status"));
    expect(res.status).toBe(503);
  });

  it("updateProfileBilling upserts so a plan assignment is never dropped", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({
      then: (resolve) =>
        Promise.resolve({
          data: [{ id: USER.id, email: USER.email }],
          error: null,
        }).then(resolve),
    }));
    const select = vi.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ upsert, select });

    const { updateProfileBilling } = await import("../src/lib/billing.ts");
    await updateProfileBilling(USER.id, {
      current_plan_name: "team",
      subscription_status: "active",
    });

    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: USER.id,
        current_plan_name: "team",
        subscription_status: "active",
      }),
    ]);
  });

  it("updateProfileBilling carries a non-null email so the upsert can insert", async () => {
    // profiles.email is `text not null` with no default
    // (migrations/20260819230452_agentops-monitor-v1.sql:12) and PostgREST
    // compiles the upsert to INSERT ... ON CONFLICT DO UPDATE. An upsert that
    // omits `email` therefore failed 23502 on exactly the case the upsert
    // exists for - a missing profile row - so the webhook could never repair a
    // plan assignment and the customer stayed on `free` while paying.
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({
      then: (resolve) =>
        Promise.resolve({ data: [{ id: USER.id, email: "stored@example.com" }], error: null }).then(
          resolve,
        ),
    }));
    mockFrom.mockReturnValue({ upsert, select: vi.fn(() => ({ eq })) });

    const { updateProfileBilling } = await import("../src/lib/billing.ts");
    await updateProfileBilling(USER.id, { current_plan_name: "team" });

    const [row] = upsert.mock.calls[0][0];
    expect(row.email).toBe("stored@example.com");
    expect(row.email).not.toBeNull();
    expect(row.email).not.toBeUndefined();
  });

  it("updateProfileBilling falls back to the caller-supplied email when no row exists", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    }));
    mockFrom.mockReturnValue({ upsert, select: vi.fn(() => ({ eq })) });

    const { updateProfileBilling } = await import("../src/lib/billing.ts");
    await updateProfileBilling(USER.id, { current_plan_name: "team" }, "webhook@example.com");

    const [row] = upsert.mock.calls[0][0];
    expect(row.email).toBe("webhook@example.com");
  });

  it("updateProfileBilling refuses to write a row the schema cannot accept", async () => {
    // Neither a stored row nor a caller email means there is no way to satisfy
    // profiles.email. Writing anyway just moves the failure to a raw 23502 from
    // the database, so it must be refused here instead.
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    }));
    mockFrom.mockReturnValue({ upsert, select: vi.fn(() => ({ eq })) });

    const { updateProfileBilling } = await import("../src/lib/billing.ts");
    await expect(
      updateProfileBilling(USER.id, { current_plan_name: "team" }),
    ).rejects.toThrow(/profiles\.email/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("ensureProfileBilling repairs a missing profile via upsert", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockImplementation((table) => {
      expect(table).toBe("profiles");
      return profilesMock({ rows: [], upsert });
    });

    const { ensureProfileBilling } = await import("../src/lib/billing.ts");
    const profile = await ensureProfileBilling(USER.id, USER.email);

    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: USER.id, email: USER.email }),
    ]);
    expect(profile.id).toBe(USER.id);
    expect(profile.subscription_status).toBe("inactive");
  });

  it("ensureProfileBilling leaves an existing profile untouched", async () => {
    const upsert = vi.fn();
    mockFrom.mockImplementation((table) => {
      expect(table).toBe("profiles");
      return profilesMock({
        rows: [
          {
            id: USER.id,
            current_plan_name: "team",
            subscription_status: "active",
            current_period_end: "2026-10-25T00:00:00.000Z",
            stripe_customer_id: "cus_mvp_test_123",
          },
        ],
        upsert,
      });
    });

    const { ensureProfileBilling } = await import("../src/lib/billing.ts");
    const profile = await ensureProfileBilling(USER.id, USER.email);

    expect(upsert).not.toHaveBeenCalled();
    expect(profile.current_plan_name).toBe("team");
  });

  it("login page self-heals a missing profile after password sign-in", () => {
    const login = readFileSync(
      new URL("../src/app/login/page.tsx", import.meta.url),
      "utf8",
    );
    // The self-heal must run after a successful sign-in, not on the error path.
    expect(login).toContain("ensureProfileBilling");
    expect(login).toMatch(/signInWithPassword[\s\S]*ensureProfileBilling/);
  });
});

// F-07 (mvp-features): marketing copy makes zero unbacked claims, and the run
// detail view renders stored span inputs/outputs with latency.
describe("F-07 marketing truth and span detail", () => {
  function read(relativePath) {
    return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
  }

  it("features page tags unreleased capabilities as Planned / Roadmap", () => {
    const features = read("src/app/(marketing)/features/page.tsx");
    expect(features).toContain("Planned / Roadmap");
    expect(features).toMatch(/Multi-region SSO/);
    expect(features).toMatch(/LangChain/);
    // The adapters are not shipped yet; claiming they ship is an unbacked claim.
    expect(features).not.toContain("The SDK ships ingestion");
  });

  it("budget caps are never presented as a shipped feature", () => {
    // Budget caps were sold as current ("A run stops at the limit you set") with a
    // config example, while no route or migration enforced any cap. The guard
    // used to pin one exact roadmap sentence instead of the rule, so rewording
    // the roadmap silently dropped the protection. Assert the rule itself.
    const pages = [
      "src/app/page.tsx",
      "src/app/(marketing)/features/page.tsx",
      "src/app/(marketing)/docs/page.tsx",
      "src/app/(marketing)/help/page.tsx",
      "src/app/(marketing)/about/page.tsx",
    ];

    const currentClaim = /hard budget (cap|limit)|stops at the limit|cap the spend/i;
    for (const page of pages) {
      expect(read(page), `${page} makes a current budget-cap claim`).not.toMatch(
        currentClaim,
      );
    }

    // And the caps must still be visible as roadmap, not quietly dropped.
    const features = read("src/app/(marketing)/features/page.tsx");
    expect(features).toMatch(/Spend caps and automated budget enforcement/i);
    expect(features).toMatch(/does not stop a run or refuse a spend/i);
  });

  it("login offers a password reset path", () => {
    const login = read("src/app/login/page.tsx");
    expect(login).toContain("/reset-password");
    expect(login).toContain("Forgot your password?");
  });

  it("reset flow uses the SDK reset methods and never leaks account existence", () => {
    const reset = read("src/app/reset-password/page.tsx");

    expect(reset).toContain("sendResetPasswordEmail");
    expect(reset).toContain("exchangeResetPasswordToken");
    expect(reset).toContain("resetPassword");
    // The request step must not reveal whether an address has an account: the
    // success copy is shown whether or not the backend accepted the address.
    expect(reset).toMatch(/If an account exists for that address/);
    // Enforced in code rather than relying on the backend to reject a short one.
    expect(reset).toMatch(/min\(MIN_PASSWORD_LENGTH/);
  });

  it("sign-out always redirects, even when signOut throws", async () => {
    // An unhandled throw from signOut() escaped the handler and rendered an
    // unstructured Next 500, so clicking "Sign out" could crash the page.
    mockAuth.signOut.mockRejectedValueOnce(new Error("auth backend down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { POST } = await import("../src/app/api/auth/sign-out/route.ts");
      const { NextRequest } = await import("next/server");

      const res = await POST(
        new NextRequest("https://agentopsmonitor.com/api/auth/sign-out", { method: "POST" }),
      );

      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("https://agentopsmonitor.com/login");
    } finally {
      errSpy.mockRestore();
    }
  });

  it("webhook guards the dedup and ledger writes, not just the handlers", () => {
    const webhook = read("src/app/api/stripe/webhook/route.ts");

    // getAdmin() and the dedup lookup sat outside the handler try, so a
    // transport-level throw escaped as an unstructured 500 rather than the
    // documented webhook_handler_failed envelope.
    expect(webhook).toMatch(/let dedupAdmin:[\s\S]*?\| null = null/);
    expect(webhook).toMatch(/if \(!dedupAdmin\)/);
    expect(webhook).toMatch(/ledger write threw for/);
  });

  it("pricing does not promise overage billing that does not happen", () => {
    const pricing = read("src/app/(marketing)/pricing/page.tsx");

    // The free cap is enforced; Team overage is NOT metered or billed. Saying
    // "$1.00 per 1,000 runs ... (metered)" on its own sells a charge that never
    // arrives, so the copy has to say which half is real.
    expect(pricing).not.toMatch(/\$1\.00 per 1,000 runs after the first 500K \(metered\)/);
    expect(pricing).toMatch(/Team overage is not charged yet/);
    expect(pricing).toMatch(/10,000 runs per month\s*is enforced at ingest/);
  });

  it("every public surface agrees on what is and is not enforced", () => {
    // The same over-promise lived on the Next pages, the static index.html (incl.
    // JSON-LD FAQ text that search overviews quote), the chatbot script, and the
    // llms.txt files. Fixing one surface left the others contradicting it, so the
    // claim is now asserted across all of them.
    const surfaces = [
      "index.html",
      "public/aom-chatbot.js",
      "public/llms.txt",
      "public/llms-full.txt",
      "src/app/(marketing)/features/page.tsx",
      "src/app/(marketing)/docs/page.tsx",
      "src/app/(marketing)/help/page.tsx",
      "src/app/(marketing)/pricing/page.tsx",
      "src/app/page.tsx",
      // Design explorations are not served, but one of these is the file that
      // gets promoted to the root index.html. An over-claim parked here is an
      // over-claim one copy-paste away from production.
      "variants/v1/index.html",
      "variants/v2/index.html",
      "variants/v3/index.html",
    ];

    const currentClaim =
      /hard budget cap|stops at the limit|cap the spend|enforces spending caps|billed monthly on actual usage/i;
    for (const surface of surfaces) {
      expect(read(surface), `${surface} makes a current over-claim`).not.toMatch(
        currentClaim,
      );
    }

    // The free-tier cap is real and must be described as enforced everywhere it
    // is mentioned, so a customer is not told a limit exists when it does not.
    expect(read("public/llms-full.txt")).toMatch(/enforced at ingest/i);
    expect(read("src/app/(marketing)/docs/page.tsx")).toMatch(/quota_exceeded/);
  });

  it("about page tags unreleased capabilities as Planned / Roadmap", () => {
    const about = read("src/app/(marketing)/about/page.tsx");
    expect(about).toContain("Planned / Roadmap");
    expect(about).toMatch(/not yet built|not shipped/i);
  });

  it("run detail renders stored spans with collapsible inputs, outputs, and latency", () => {
    const page = read("src/app/(app)/app/runs/[id]/page.tsx");
    // The stored trace payloads are fetched, not just summary columns.
    expect(page).toMatch(/SPAN_DETAIL_COLUMNS[^;]*input/);
    expect(page).toMatch(/SPAN_DETAIL_COLUMNS[^;]*output/);
    expect(page).toContain(".select(SPAN_DETAIL_COLUMNS)");
    // Spans are inspectable: collapsible details with payload JSON and latency.
    expect(page).toContain("<details");
    expect(page).toContain("<summary>");
    expect(page).toContain("JSON.stringify");
    expect(page).toContain("duration_ms");
  });

  it("run detail shows Unable to load spans on spans query failure", () => {
    const page = read("src/app/(app)/app/runs/[id]/page.tsx");
    expect(page).toContain("Unable to load spans");
    // The empty-state message must stay out of the failure branch.
    const failureBranch = page.split("Unable to load spans")[0];
    expect(failureBranch).not.toContain("No spans recorded");
  });
});
