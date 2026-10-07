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
      insert: vi.fn().mockResolvedValue({ error: null }),
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
    mockFrom.mockReturnValue({ upsert });

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
    expect(features).toContain("Real-time automated budget killing");
    expect(features).toContain("Multi-region SSO");
    expect(features).toContain("LangChain");
    // The adapters are not shipped yet; claiming they ship is an unbacked claim.
    expect(features).not.toContain("The SDK ships ingestion");
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
