import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// F-08 (customer-e2e): a pure customer journey simulator. The ONLY mocked
// boundary is the external InsForge SDK / Stripe boundary - every route
// handler and library unit under test is the real production module. Mock
// patterns mirror tests/customer-workflow.test.mjs and
// tests/backend-security.test.mjs.

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockAuth = {
  getCurrentUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
};

// The Stripe checkout boundary: the only billing seam we replace. Plan and
// profile resolution stay real (they run against the mocked InsForge admin
// client), following how tests/webhook-idempotency.test.mjs stubs @/lib/billing.
const { mockStripe } = vi.hoisted(() => ({
  mockStripe: { checkout: { sessions: { create: vi.fn() } } },
}));

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
    id: USER.id,
    email: USER.email,
    name: "Journey Customer",
  })),
}));

vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getStripe: () => mockStripe };
});

const USER = { id: "user-journey-001", email: "journey.customer@example.com" };
const RUN_ID = "00000000-0000-4000-8000-0000000000aa";
const API_KEY_PATTERN = /^aom_live_[A-Za-z0-9_-]+$/;

// Journey state carried between steps, exactly like a real session would.
const journey = { apiKey: null, runId: null };

const TRACE_SPANS = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    span_type: "workflow",
    provider: null,
    model: null,
    tool_name: "start",
    status: "ok",
    started_at: "2026-09-25T15:00:00.000Z",
    duration_ms: 0,
    cost_usd: 0,
    input: { trigger: "webhook", refund_id: "rf_123" },
    output: { started: true },
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    span_type: "llm",
    provider: "openai",
    model: "gpt-4o",
    tool_name: "openai.chat",
    status: "ok",
    started_at: "2026-09-25T15:00:01.000Z",
    duration_ms: 600,
    cost_usd: 0.08,
    input: { prompt: "Classify the refund policy question" },
    output: { classification: "eligible" },
  },
];

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

// A chunked body with NO Content-Length, so the route cannot rely on the
// declared-length shortcut and must enforce the cap while reading (F-04).
// Mirrors the helper in tests/ingest.test.mjs.
function streamedPost(url, body, headers = {}) {
  const bytes = typeof body === "number" ? null : new TextEncoder().encode(body);
  const totalBytes = typeof body === "number" ? body : bytes.byteLength;
  return new Request(url, {
    method: "POST",
    headers,
    duplex: "half",
    body: new ReadableStream({
      start(controller) {
        let sent = 0;
        while (sent < totalBytes) {
          const n = Math.min(64 * 1024, totalBytes - sent);
          controller.enqueue(bytes ? bytes.subarray(sent, sent + n) : new Uint8Array(n).fill(120));
          sent += n;
        }
        controller.close();
      },
    }),
  });
}

describe("F-08 customer journey simulation: 7-step lifecycle", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_INSFORGE_URL = "https://backend.example";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY = "anon-key-with-at-least-twenty-characters";
    process.env.INSFORGE_API_KEY = "admin-key-with-at-least-twenty-characters";
    process.env.INGEST_RATE_LIMIT_PER_MIN = "600";
    process.env.STRIPE_SECRET_KEY = "sk_test_journey_secret";
    process.env.STRIPE_TEAM_PRICE_ID = "price_team_journey";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Step 1: visitor submits a lead via the chatbot surface and it is persisted", async () => {
    const { POST } = await import("../src/app/api/leads/route.ts");
    const { NextRequest } = await import("next/server");

    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockImplementation((table) => {
      expect(table).toBe("leads");
      return { insert };
    });

    const req = new NextRequest("https://agentopsmonitor.com/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.10",
      },
      body: JSON.stringify({
        email: "journey.customer@example.com",
        company: "Acme AI Corp",
        source: "landing_chatbot",
        product: "agentops-monitor",
        conversation: [{ sender: "user", text: "How do budget caps work?" }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.id).toBeTruthy();
    // The lead reached durable storage with the visitor's actual details.
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        email: "journey.customer@example.com",
        company: "Acme AI Corp",
        source: "landing_chatbot",
      }),
    ]);;
  });

  it("Step 2: visitor signs up and the profile row is provisioned via upsert", () => {
    // Signup is a server action inside the page (no route handler exists), so
    // the contract is asserted against the real page source, mirroring the
    // established F-02/F-03/F-07 source-assertion style: signUp first, then a
    // profiles upsert keyed on the returned user id with the signup details.
    const signup = read("src/app/signup/page.tsx");
    expect(signup).toContain('auth.signUp');
    expect(signup).toMatch(/auth\.signUp\(\{[\s\S]*?email,[\s\S]*?password,[\s\S]*?\}\)/);
    expect(signup).toMatch(/signUp[\s\S]*?from\("profiles"\)[\s\S]*?\.upsert\(\[/);
    expect(signup).toMatch(/upsert\(\[[\s\S]*?id:\s*userId[\s\S]*?email,/);
  });

  it("Step 3: user logs in, session established, missing profile self-heals via upsert", async () => {
    // (a) The login path establishes a session through the real auth actions
    // boundary and runs the F-03 self-heal after a successful sign-in.
    const login = read("src/app/login/page.tsx");
    expect(login).toContain("signInWithPassword");
    expect(login).toMatch(/signInWithPassword[\s\S]*ensureProfileBilling/);

    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER.id, email: USER.email } },
      error: null,
    });
    const auth = await (await import("@/lib/insforge")).getAuthActions();
    const { data, error } = await auth.signInWithPassword({
      email: USER.email,
      password: "correct-horse-battery",
    });
    expect(error).toBeNull();
    expect(data.user.id).toBe(USER.id);

    // (b) The profile row is missing (e.g. the signup write failed): the
    // self-heal must fire the upsert with a free/inactive repair row.
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockImplementation((table) => {
      expect(table).toBe("profiles");
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
        upsert,
      };
    });

    const { ensureProfileBilling } = await import("../src/lib/billing.ts");
    const profile = await ensureProfileBilling(USER.id, USER.email);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: USER.id,
        email: USER.email,
        current_plan_name: "free",
        subscription_status: "inactive",
      }),
    ]);
    expect(profile.subscription_status).toBe("inactive");
  });

  it("Step 4: logged-in user creates an API key and receives an aom_live_ key", async () => {
    mockAuth.getCurrentUser.mockResolvedValue({
      data: { user: { id: USER.id, email: USER.email } },
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table) => {
      expect(table).toBe("api_keys");
      return { insert };
    });

    const { POST } = await import("../src/app/api/api-keys/route.ts");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("https://agentopsmonitor.com/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "production-refund-agent" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.key).toMatch(API_KEY_PATTERN);
    // The hashed key (never the raw secret) is what reaches storage.
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: USER.id,
        name: "production-refund-agent",
        key_prefix: body.key.slice(0, 14),
        key_hash: createHash("sha256").update(body.key).digest("hex"),
      }),
    ]);

    journey.apiKey = body.key;
  });

  it("Step 5: the user's AI agent POSTs a trace with the bearer key -> 200 and run persisted", async () => {
    expect(journey.apiKey, "Step 4 must issue the key first").toMatch(API_KEY_PATTERN);

    mockRpc.mockResolvedValue({
      data: { ok: true, run_id: RUN_ID, span_count: TRACE_SPANS.length },
      error: null,
    });

    const { POST } = await import("../src/app/api/ingest/route.ts");
    const { NextRequest } = await import("next/server");

    const trace = {
      external_id: "run-refund-triage-400",
      agent_name: "refund-triage-v3",
      status: "completed",
      started_at: "2026-09-25T15:00:00.000Z",
      ended_at: "2026-09-25T15:00:48.219Z",
      duration_ms: 48219,
      tokens_in: 412880,
      tokens_out: 88104,
      cost_usd: 18.44,
      metadata: { environment: "production" },
      spans: TRACE_SPANS.map(({ input, output, ...span }) => ({
        ...span,
        input,
        output,
      })),
    };

    const req = new NextRequest("https://agentopsmonitor.com/api/ingest", {
      method: "POST",
      headers: {
        authorization: `Bearer ${journey.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(trace),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.run_id).toBe(RUN_ID);
    expect(body.span_count).toBe(TRACE_SPANS.length);

    // The run was persisted through the transactional ingest RPC, keyed by
    // the SHA-256 hash of the exact bearer key from Step 4.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "ingest_agent_run",
      expect.objectContaining({
        p_key_hash: createHash("sha256").update(journey.apiKey).digest("hex"),
        p_rate_limit: 600,
        p_payload: expect.objectContaining({
          external_id: "run-refund-triage-400",
          agent_name: "refund-triage-v3",
          spans: expect.arrayContaining([
            expect.objectContaining({ tool_name: "openai.chat", model: "gpt-4o" }),
          ]),
        }),
      }),
    );

    journey.runId = body.run_id;
  });

  it("Step 6: user opens /app/runs and /app/runs/[id] and sees the run with its spans", () => {
    expect(journey.runId, "Step 5 must persist the run first").toBe(RUN_ID);

    // The runs UI has no API route (the pages query InsForge directly), and
    // vitest here cannot import .tsx (tsconfig sets jsx: "preserve", so vite
    // leaves JSX untransformed - fixing that lives in the F-09 vitest.config
    // lane, not this one). Per the brief, the page contract is therefore
    // asserted against the real page SOURCE, mirroring the established F-07
    // style in tests/customer-workflow.test.mjs.

    // /app/runs lists the stored run shape: the same columns the ingest RPC
    // persists, rendered as a ledger the user can scan.
    const list = read("src/app/(app)/app/runs/page.tsx");
    expect(list).toMatch(/from\("runs"\)[\s\S]*\.select\("[^"]*external_id[^"]*agent_name/);
    expect(list).toContain("run.external_id");
    expect(list).toContain("run.agent_name");
    expect(list).toContain("run.span_count");
    // Each listed run deep-links to its detail page by stored run id.
    expect(list).toContain('href={`/app/runs/${run.id}`}');

    // /app/runs/[id] fetches the full stored run row and its span payloads
    // (input/output columns), then renders each payload via JSON.stringify so
    // the user sees the exact stored inputs, outputs, and latency.
    const detail = read("src/app/(app)/app/runs/[id]/page.tsx");
    expect(detail).toMatch(/from\("runs"\)[\s\S]*\.select\("[^"]*external_id[^"]*span_count/);
    expect(detail).toContain("SPAN_DETAIL_COLUMNS");
    expect(detail).toMatch(/SPAN_DETAIL_COLUMNS[^;]*input/);
    expect(detail).toMatch(/SPAN_DETAIL_COLUMNS[^;]*output/);
    expect(detail).toContain(".select(SPAN_DETAIL_COLUMNS)");
    expect(detail).toContain("JSON.stringify");
    expect(detail).toContain("duration_ms");
    // The exact payload the agent sent in Step 5 is what the page displays.
    expect(detail).toContain("span.input");
    expect(detail).toContain("span.output");
  });

  it("Step 7: user visits pricing and triggers checkout -> Stripe checkout session returned", async () => {
    mockAuth.getCurrentUser.mockResolvedValue({
      data: { user: { id: USER.id, email: USER.email } },
    });
    mockFrom.mockImplementation((table) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    id: USER.id,
                    stripe_customer_id: null,
                    current_plan_name: "free",
                    subscription_status: "inactive",
                    current_period_end: null,
                  },
                ],
                error: null,
              }),
          }),
        };
      }
      if (table === "plans") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    id: "plan-team",
                    name: "team",
                    stripe_price_id: "price_team_table",
                    included_runs: 100000,
                    price_usd_cents: 29900,
                    overage_per_1k: 0,
                  },
                ],
                error: null,
              }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: "cs_test_journey_1",
      object: "checkout.session",
      url: "https://checkout.stripe.com/c/pay/cs_test_journey_1",
    });

    const { POST } = await import("../src/app/api/billing/checkout/route.ts");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("https://agentopsmonitor.com/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "team" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://checkout.stripe.com/c/pay/cs_test_journey_1");

    // The checkout session was created against the team price with the
    // user's id wired into the session (and back to /billing on success).
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_team_journey", quantity: 1 }],
        client_reference_id: USER.id,
        customer_email: USER.email,
        success_url: expect.stringContaining("/billing?status=success"),
        cancel_url: expect.stringContaining("/pricing?status=cancelled"),
      }),
    );
  });
});

describe("F-08 unhappy-path gates: exact status at the exact boundary", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_INSFORGE_URL ??= "https://backend.example";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ??= "anon-key-with-at-least-twenty-characters";
    process.env.INSFORGE_API_KEY ??= "admin-key-with-at-least-twenty-characters";
    process.env.INGEST_RATE_LIMIT_PER_MIN ??= "600";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function validTraceBody() {
    return JSON.stringify({
      external_id: "run-gate-probe",
      agent_name: "gate-probe",
      spans: [{ id: "00000000-0000-4000-8000-0000000000bb", span_type: "workflow" }],
    });
  }

  it("Gate 1: POST /api/ingest without an Authorization header -> 401", async () => {
    const { POST } = await import("../src/app/api/ingest/route.ts");
    const { NextRequest } = await import("next/server");

    const res = await POST(
      new NextRequest("https://agentopsmonitor.com/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: validTraceBody(),
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "missing_bearer" },
    });
    // The backend is never touched without a bearer key.
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("Gate 2: POST /api/ingest with a non-aom_live_ bearer key -> 401", async () => {
    // A well-formed but foreign key must be rejected at the key-validation
    // boundary (the RPC reports invalid_api_key, which the route maps to 401).
    mockRpc.mockResolvedValue({
      data: { ok: false, code: "invalid_api_key", message: "Invalid API key." },
      error: null,
    });

    const { POST } = await import("../src/app/api/ingest/route.ts");
    const { NextRequest } = await import("next/server");

    const res = await POST(
      new NextRequest("https://agentopsmonitor.com/api/ingest", {
        method: "POST",
        headers: {
          authorization: "Bearer sk_live_4eC39HqLyjWDarjtT1zdp7dc",
          "content-type": "application/json",
        },
        body: validTraceBody(),
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "invalid_api_key" },
    });
  });

  it("Gate 3: POST /api/ingest with a malformed trace payload -> 400 structured error", async () => {
    const { POST } = await import("../src/app/api/ingest/route.ts");
    const { NextRequest } = await import("next/server");

    const res = await POST(
      new NextRequest("https://agentopsmonitor.com/api/ingest", {
        method: "POST",
        headers: {
          authorization: "Bearer aom_live_gateprobe_0123456789abcdef",
          "content-type": "application/json",
        },
        // Missing required fields: agent_name and external_id.
        body: JSON.stringify({ status: "completed", spans: [] }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      error: { code: "invalid_payload" },
    });
    expect(typeof body.error.message).toBe("string");
    // Validation fails before any storage write.
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("Gate 4: POST /api/ingest with an oversized streamed body -> 413 (F-04, 1MB cap)", async () => {
    mockRpc.mockReset();

    const { POST } = await import("../src/app/api/ingest/route.ts");

    const res = await POST(
      streamedPost("https://agentopsmonitor.com/api/ingest", 1_100_000, {
        authorization: "Bearer aom_live_gateprobe_0123456789abcdef",
        "content-type": "application/json",
      }),
    );

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "payload_too_large" },
    });
    // The cap fires before the ingest RPC is ever invoked.
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
