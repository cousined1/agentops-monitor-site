import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAdmin,
  updateProfileBilling,
  getProfileByCustomerId,
  getPlanByPriceId,
  getStripe,
  periodEndToIso,
  processed,
} = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  updateProfileBilling: vi.fn(),
  getProfileByCustomerId: vi.fn(),
  getPlanByPriceId: vi.fn(),
  getStripe: vi.fn(),
  periodEndToIso: vi.fn((v) => (v ? new Date(v * 1000).toISOString() : null)),
  processed: new Set(),
}));

vi.mock("@/lib/billing", () => ({
  getAdmin,
  updateProfileBilling,
  getProfileByCustomerId,
  getPlanByPriceId,
  getStripe,
  periodEndToIso,
  BillingConfigError: class BillingConfigError extends Error {},
}));

const SECRET = "whsec_test_secret_0123456789";

describe("stripe webhook idempotency (DELTA-005)", () => {
  let POST;
  let Stripe;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_INSFORGE_URL = "https://backend.example";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY = "anon-key-with-at-least-twenty-characters";
    process.env.INSFORGE_API_KEY = "admin-key-with-at-least-twenty-characters";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    ({ POST } = await import("../src/app/api/stripe/webhook/route.ts"));
    ({ default: Stripe } = await import("stripe"));

    // Stateful ledger mock: select reflects `processed`; insert records.
    getAdmin.mockImplementation(() => ({
      database: {
        from: vi.fn(() => ({
          select: () => ({
            eq: (_column, value) => ({
              maybeSingle: async () => (processed.has(value) ? { data: { event_id: value }, error: null } : { data: null, error: null }),
            }),
          }),
          insert: async (rows) => {
            for (const row of rows) processed.add(row.event_id);
            return { error: null };
          },
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

  beforeEach(() => {
    vi.clearAllMocks();
    updateProfileBilling.mockResolvedValue(undefined);
    getProfileByCustomerId.mockResolvedValue({
      id: "user-1",
      stripe_customer_id: "cus_test_001",
    });
    getPlanByPriceId.mockResolvedValue({ id: "plan-1", name: "team" });
  });

  function subscriptionEvent(id) {
    return JSON.stringify({
      id,
      object: "event",
      api_version: "2025-10-01.clover",
      created: Math.floor(Date.now() / 1000),
      type: "customer.subscription.updated",
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: {
        object: {
          object: "subscription",
          id: "sub_test_001",
          customer: "cus_test_001",
          status: "active",
          metadata: {},
          items: {
            data: [{ price: { id: "price_test_001" }, current_period_end: 1800000000 }],
          },
        },
      },
    });
  }

  async function signedPost(payload) {
    const signature = await Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: SECRET,
    });
    return POST(
      new Request("https://app.example/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
  }

  it("processes a delivery once: a replayed event short-circuits as a duplicate", async () => {
    const payload = subscriptionEvent("evt_replay_001");

    const first = await signedPost(payload);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      received: true,
      handled: true,
      duplicate: false,
    });
    expect(updateProfileBilling).toHaveBeenCalledTimes(1);

    const replay = await signedPost(payload);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      received: true,
      duplicate: true,
    });
    // The handler must not run twice for the same event id.
    expect(updateProfileBilling).toHaveBeenCalledTimes(1);
    expect(processed.has("evt_replay_001")).toBe(true);
  });

  it("fails closed with 500 and does NOT record the event when the handler errors", async () => {
    const payload = subscriptionEvent("evt_fail_001");
    updateProfileBilling.mockRejectedValueOnce(new Error("db hiccup"));

    const failed = await signedPost(payload);
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toMatchObject({
      error: { code: "webhook_handler_failed" },
    });
    expect(processed.has("evt_fail_001")).toBe(false);

    // Stripe retry after the transient failure is processed normally.
    const retried = await signedPost(payload);
    expect(retried.status).toBe(200);
    await expect(retried.json()).resolves.toMatchObject({ duplicate: false });
    expect(processed.has("evt_fail_001")).toBe(true);
  });
});
