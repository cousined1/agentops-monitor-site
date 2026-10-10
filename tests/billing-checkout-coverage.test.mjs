import { beforeEach, describe, expect, it, vi } from "vitest";

// Wave G4 coverage closure for src/app/api/billing/checkout/route.ts:
// env failure, profile-lookup failure, unknown plan, missing price,
// Stripe returning no URL, BillingConfigError, and generic Stripe failure.
// Only external seams are mocked (@/lib/insforge, @/lib/billing); the real
// route handler runs throughout.
const { getServerClient, getStripe, getPlanByName, getPlanPriceId, getProfileByUserId, BillingConfigError } =
  vi.hoisted(() => {
    class BillingConfigError extends Error {
      constructor(message, code = "billing_not_configured") {
        super(message);
        this.code = code;
      }
    }
    return {
      getServerClient: vi.fn(),
      getStripe: vi.fn(),
      getPlanByName: vi.fn(),
      getPlanPriceId: vi.fn(),
      getProfileByUserId: vi.fn(),
      BillingConfigError,
    };
  });

vi.mock("@/lib/insforge", () => ({ getServerClient }));
vi.mock("@/lib/billing", () => ({
  getStripe,
  getPlanByName,
  getPlanPriceId,
  getProfileByUserId,
  BillingConfigError,
}));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
  NEXT_PUBLIC_SITE_URL: "https://app.example",
};

function checkoutRequest(plan = "team") {
  return new Request("https://app.example/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

const TEAM_PLAN = {
  id: "plan-team",
  name: "team",
  stripe_price_id: "price_team_db",
  included_runs: 10_000,
  price_usd_cents: 2900,
  overage_per_1k: 0,
};

describe("billing checkout route coverage closure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, BASE_ENV);
    getServerClient.mockResolvedValue({
      auth: {
        getCurrentUser: vi.fn(async () => ({
          data: { user: { id: "user-1", email: "team@example.com" } },
          error: null,
        })),
      },
    });
    getProfileByUserId.mockResolvedValue({ id: "user-1", stripe_customer_id: null });
    getPlanByName.mockResolvedValue(TEAM_PLAN);
    getPlanPriceId.mockResolvedValue("price_team_env");
    getStripe.mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: "https://checkout.stripe.com/session/cs_1" })),
        },
      },
    });
  });

  it("maps a missing server env to 503 billing_not_configured", async () => {
    // Must run before any successful appEnv() call in this file (env is cached).
    const missing = process.env.NEXT_PUBLIC_INSFORGE_URL;
    delete process.env.NEXT_PUBLIC_INSFORGE_URL;
    try {
      const { POST } = await import("../src/app/api/billing/checkout/route.ts");
      const response = await POST(checkoutRequest());

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: { message: "Billing is not configured.", code: "billing_not_configured" },
      });
    } finally {
      process.env.NEXT_PUBLIC_INSFORGE_URL = missing;
    }
  });

  it("maps a profile lookup failure to 503 profile_unavailable", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getProfileByUserId.mockRejectedValue(new Error("profiles table missing"));
      const { POST } = await import("../src/app/api/billing/checkout/route.ts");

      const response = await POST(checkoutRequest());

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: {
          message: "Your subscription status could not be checked. Please try again shortly.",
          code: "profile_unavailable",
        },
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("rejects an unparseable plan name with 400 unknown_plan", async () => {
    getPlanByName.mockResolvedValue(null);
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");

    const response = await POST(checkoutRequest("!!!notaplan"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Unknown plan: unknown", code: "unknown_plan" },
    });
  });

  it("normalises plan casing instead of rejecting it as unknown", async () => {
    // The validator regex only accepts lowercase, so "Team" failed the test and
    // fell through to the "unknown" branch - producing `Unknown plan: unknown`,
    // which names a plan the customer never asked for. Casing is normalised
    // first so the real plan resolves.
    getPlanByName.mockResolvedValue({
      id: "plan-team",
      name: "team",
      stripe_price_id: null,
      included_runs: 500_000,
      price_usd_cents: 29900,
      overage_per_1k: 100,
    });
    getPlanPriceId.mockResolvedValue(null);
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");

    const response = await POST(checkoutRequest("TeAm"));

    // It got past the selector and failed later, on the missing Stripe price.
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'Plan "team" has no Stripe price configured yet.',
        code: "price_not_configured",
      },
    });
    expect(getPlanByName).toHaveBeenCalledWith("team");
  });

  it("maps a plan without a Stripe price to 503 price_not_configured", async () => {
    getPlanPriceId.mockResolvedValue(null);
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");

    const response = await POST(checkoutRequest("enterprise"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'Plan "team" has no Stripe price configured yet.',
        code: "price_not_configured",
      },
    });
  });

  it("maps a Stripe session without a URL to 502 no_url", async () => {
    getStripe().checkout.sessions.create.mockResolvedValue({ url: null });
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Stripe did not return a checkout URL.", code: "no_url" },
    });
  });

  it("maps a Stripe BillingConfigError to 503 with its code", async () => {
    getStripe.mockImplementation(() => {
      throw new BillingConfigError(
        "STRIPE_SECRET_KEY is not configured on the server.",
        "stripe_not_configured",
      );
    });
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "STRIPE_SECRET_KEY is not configured on the server.",
        code: "stripe_not_configured",
      },
    });
  });

  it("maps a generic Stripe failure to a sanitized 500", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getStripe().checkout.sessions.create.mockRejectedValue(new Error("stripe api down"));
      const { POST } = await import("../src/app/api/billing/checkout/route.ts");

      const response = await POST(checkoutRequest());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: {
          message: "Checkout could not be started. Please try again or contact support.",
          code: "checkout_failed",
        },
      });
    } finally {
      errSpy.mockRestore();
    }
  });
});
