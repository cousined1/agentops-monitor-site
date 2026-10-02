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
