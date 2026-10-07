import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

// Wave G4 coverage closure for src/app/api/stripe/webhook/route.ts: the
// verification/validation branches, every switch case, the fail-open dedup,
// and the event-ledger write failure. Only the @/lib/billing seam is mocked
// (same style as tests/webhook-idempotency.test.mjs); the real route handler
// and the real Stripe signature verification run throughout.
const { getAdmin, updateProfileBilling, getProfileByCustomerId, getPlanByPriceId, getStripe } =
  vi.hoisted(() => ({
    getAdmin: vi.fn(),
    updateProfileBilling: vi.fn(),
    getProfileByCustomerId: vi.fn(),
    getPlanByPriceId: vi.fn(),
    getStripe: vi.fn(),
  }));

vi.mock("@/lib/billing", () => ({
  getAdmin,
  updateProfileBilling,
  getProfileByCustomerId,
  getPlanByPriceId,
  getStripe,
  periodEndToIso: (v) => (v ? new Date(v * 1000).toISOString() : null),
  BillingConfigError: class BillingConfigError extends Error {},
}));

const SECRET = "whsec_coverage_closure_secret";
const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
};

// Stateful ledger mock shared by every test: `seen` doubles as the
// processed-events table; select/insert errors are injectable per test.
const ledger = { seen: new Set(), selectError: null, insertError: null, insertCode: null };

async function loadRoute(env = {}) {
  vi.resetModules();
  Object.assign(process.env, BASE_ENV, { STRIPE_WEBHOOK_SECRET: SECRET });
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("../src/app/api/stripe/webhook/route.ts");
}

function makeEvent(id, type, object) {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2025-10-01.clover",
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  });
}

function signedRequest(payload) {
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return new Request("https://app.example/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

function subscriptionObject(overrides = {}) {
  return {
    object: "subscription",
    id: "sub_test_001",
    customer: "cus_test_001",
    status: "active",
    metadata: {},
    items: { data: [{ price: { id: "price_test_001" }, current_period_end: 1800000000 }] },
    ...overrides,
  };
}

describe("stripe webhook coverage closure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledger.seen = new Set();
    ledger.selectError = null;
    ledger.insertError = null;
    ledger.insertCode = null;
    getAdmin.mockImplementation(() => ({
      database: {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn((_column, value) => ({
              maybeSingle: vi.fn(async () => {
                if (ledger.selectError) return { data: null, error: { message: ledger.selectError } };
                return ledger.seen.has(value)
                  ? { data: { event_id: value }, error: null }
                  : { data: null, error: null };
              }),
            })),
          })),
          insert: vi.fn(async (rows) => {
            if (ledger.insertError) {
              return { error: { message: ledger.insertError, code: ledger.insertCode } };
            }
            for (const row of rows) ledger.seen.add(row.event_id);
            return { error: null };
          }),
        })),
      },
    }));
    updateProfileBilling.mockResolvedValue(undefined);
    getProfileByCustomerId.mockResolvedValue({
      id: "user-1",
      stripe_customer_id: "cus_test_001",
    });
    getPlanByPriceId.mockResolvedValue({ id: "plan-1", name: "team" });
  });

  it("GET answers Stripe dashboard endpoint verification", async () => {
    const { GET } = await loadRoute();

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("maps an env schema failure to 500 webhook_not_configured", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { POST } = await loadRoute({ NEXT_PUBLIC_INSFORGE_URL: undefined });

      const response = await POST(
        new Request("https://app.example/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": "t=1,v1=x" },
          body: "{}",
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: { message: "Webhook is not configured.", code: "webhook_not_configured" },
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("maps an unset STRIPE_WEBHOOK_SECRET to 500 webhook_not_configured", async () => {
    const { POST } = await loadRoute({ STRIPE_WEBHOOK_SECRET: undefined });

    const response = await POST(
      new Request("https://app.example/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=x" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "STRIPE_WEBHOOK_SECRET is not configured.",
        code: "webhook_not_configured",
      },
    });
  });

  it("rejects a delivery without the stripe-signature header", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      new Request("https://app.example/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Missing stripe-signature header.", code: "missing_signature" },
    });
  });

  it("rejects a body whose declared length exceeds the cap with 413", async () => {
    const { POST } = await loadRoute();

    // Real Request objects strip content-length; a header shim is required to
    // exercise the declared-length shortcut (the streamed-cap path is covered
    // elsewhere).
    const response = await POST({
      headers: new Headers({
        "stripe-signature": "t=1,v1=x",
        "content-length": "6000000",
      }),
      body: null,
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Body too large.", code: "payload_too_large" },
    });
  });

  it("propagates a mid-stream body read failure instead of swallowing it", async () => {
    const { POST } = await loadRoute();

    const request = new Request("https://app.example/api/stripe/webhook", {
      method: "POST",
      duplex: "half",
      headers: { "stripe-signature": "t=1,v1=x" },
      body: new ReadableStream({
        start(controller) {
          controller.error(new Error("socket reset"));
        },
      }),
    });

    await expect(POST(request)).rejects.toThrow("socket reset");
  });

  it("rejects a bad signature with 400 invalid_signature", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { POST } = await loadRoute();

      const response = await POST(
        new Request("https://app.example/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": "t=1,v1=invalid" },
          body: "{}",
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: { message: "Signature verification failed.", code: "invalid_signature" },
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("acknowledges an unhandled event type without touching the database", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      signedRequest(makeEvent("evt_unhandled_1", "charge.refunded", { object: "charge" })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      type: "charge.refunded",
      handled: false,
      duplicate: false,
    });
    expect(updateProfileBilling).not.toHaveBeenCalled();
    expect(ledger.seen.has("evt_unhandled_1")).toBe(true);
  });

  it("fails open when the dedup lookup errors, then processes the event", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      ledger.selectError = "billing_processed_events missing";
      const { POST } = await loadRoute();

      const response = await POST(
        signedRequest(
          makeEvent("evt_dedup_err_1", "customer.subscription.updated", subscriptionObject()),
        ),
      );

      expect(response.status).toBe(200);
      expect(updateProfileBilling).toHaveBeenCalledTimes(1);
      expect(ledger.seen.has("evt_dedup_err_1")).toBe(true);
    } finally {
      errSpy.mockRestore();
    }
  });

  it("checkout.session.completed (subscription) syncs plan, status, and period end", async () => {
    const { POST } = await loadRoute();
    getStripe.mockReturnValue({
      subscriptions: {
        retrieve: vi.fn(async () => ({
          status: "active",
          items: { data: [{ price: { id: "price_test_001" }, current_period_end: 1800000000 }] },
          current_period_end: 1800000000,
        })),
      },
    });

    const response = await POST(
      signedRequest(
        makeEvent("evt_checkout_1", "checkout.session.completed", {
          object: "checkout.session",
          mode: "subscription",
          subscription: "sub_test_001",
          metadata: { userId: "user-9" },
          customer: "cus_test_001",
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(getStripe().subscriptions.retrieve).toHaveBeenCalledWith("sub_test_001");
    expect(updateProfileBilling).toHaveBeenCalledWith("user-9", {
      current_plan_name: "team",
      subscription_status: "active",
      current_period_end: new Date(1800000000 * 1000).toISOString(),
      stripe_customer_id: "cus_test_001",
    });
  });

  it("checkout.session.completed (payment mode) is acknowledged without a subscription sync", async () => {
    const { POST } = await loadRoute();
    getStripe.mockReturnValue({
      subscriptions: { retrieve: vi.fn() },
    });

    const response = await POST(
      signedRequest(
        makeEvent("evt_checkout_pay_1", "checkout.session.completed", {
          object: "checkout.session",
          mode: "payment",
          subscription: null,
          metadata: {},
          customer: "cus_test_001",
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(getStripe().subscriptions.retrieve).not.toHaveBeenCalled();
    expect(updateProfileBilling).not.toHaveBeenCalled();
  });

  it("subscription.updated without a resolvable profile fails closed so Stripe retries", async () => {
    const { POST } = await loadRoute();
    getProfileByCustomerId.mockResolvedValue(null);

    const response = await POST(
      signedRequest(
        makeEvent(
          "evt_no_profile_1",
          "customer.subscription.updated",
          subscriptionObject({ customer: "cus_unknown" }),
        ),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "webhook_handler_failed" },
    });
    expect(updateProfileBilling).not.toHaveBeenCalled();
    expect(ledger.seen.has("evt_no_profile_1")).toBe(false);
  });

  it("subscription.deleted resets the profile to the free plan", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      signedRequest(
        makeEvent("evt_deleted_1", "customer.subscription.deleted", subscriptionObject()),
      ),
    );

    expect(response.status).toBe(200);
    expect(updateProfileBilling).toHaveBeenCalledWith("user-1", {
      subscription_status: "canceled",
      current_plan_name: "free",
      current_period_end: null,
    });
  });

  it("invoice.payment_failed marks the profile past_due", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      signedRequest(
        makeEvent("evt_past_due_1", "invoice.payment_failed", {
          object: "invoice",
          customer: "cus_test_001",
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(updateProfileBilling).toHaveBeenCalledWith("user-1", {
      subscription_status: "past_due",
    });
  });

  it("invoice.payment_failed without a customer is acknowledged without a sync", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      signedRequest(
        makeEvent("evt_past_due_none_1", "invoice.payment_failed", {
          object: "invoice",
          customer: null,
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(updateProfileBilling).not.toHaveBeenCalled();
  });

  it("a non-duplicate ledger write failure is logged but still returns 200", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      ledger.insertError = "relation missing";
      ledger.insertCode = "42P01";
      const { POST } = await loadRoute();

      const response = await POST(
        signedRequest(
          makeEvent("evt_ledger_err_1", "customer.subscription.updated", subscriptionObject()),
        ),
      );

      expect(response.status).toBe(200);
      const logged = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("failed to record evt_ledger_err_1");
    } finally {
      errSpy.mockRestore();
    }
  });
});
