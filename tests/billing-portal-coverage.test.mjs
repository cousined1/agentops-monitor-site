import { beforeEach, describe, expect, it, vi } from "vitest";

// Wave G4 coverage closure for src/app/api/billing/portal/route.ts.
// Only external seams are mocked: the InsForge server client and the
// @/lib/billing Stripe/profile seam. The real route handler runs throughout.
const { getServerClient, getStripe, getProfileByUserId, BillingConfigError } = vi.hoisted(
  () => {
    class BillingConfigError extends Error {
      constructor(message, code = "billing_not_configured") {
        super(message);
        this.code = code;
      }
    }
    return { getServerClient: vi.fn(), getStripe: vi.fn(), getProfileByUserId: vi.fn(), BillingConfigError };
  },
);

vi.mock("@/lib/insforge", () => ({ getServerClient }));
vi.mock("@/lib/billing", () => ({ getStripe, getProfileByUserId, BillingConfigError }));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
  NEXT_PUBLIC_SITE_URL: "https://app.example",
};

function portalRequest(body = "{}") {
  return new Request("https://app.example/api/billing/portal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("billing portal route coverage", () => {
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
    getProfileByUserId.mockResolvedValue({ id: "user-1", stripe_customer_id: "cus_1" });
    getStripe.mockReturnValue({
      billingPortal: {
        sessions: {
          create: vi.fn(async () => ({ url: "https://billing.stripe.com/session/portal_1" })),
        },
      },
    });
  });

  it("maps a missing server env to 503 billing_not_configured", async () => {
    // Must run before any successful appEnv() call in this file (env is cached).
    const missing = process.env.NEXT_PUBLIC_INSFORGE_URL;
    delete process.env.NEXT_PUBLIC_INSFORGE_URL;
    try {
      const { POST } = await import("../src/app/api/billing/portal/route.ts");
      const response = await POST(portalRequest());

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: { message: "Billing is not configured.", code: "billing_not_configured" },
      });
    } finally {
      process.env.NEXT_PUBLIC_INSFORGE_URL = missing;
    }
  });

  it("returns 401 for a genuinely sessionless request", async () => {
    getServerClient.mockResolvedValue({
      auth: { getCurrentUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    const { POST } = await import("../src/app/api/billing/portal/route.ts");

    const response = await POST(portalRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 no_customer when the profile has no Stripe customer", async () => {
    getProfileByUserId.mockResolvedValue({ id: "user-1", stripe_customer_id: null });
    const { POST } = await import("../src/app/api/billing/portal/route.ts");

    const response = await POST(portalRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "No Stripe customer on file — subscribe to a plan first.",
        code: "no_customer",
      },
    });
    expect(getStripe().billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("creates a portal session and returns its URL for a subscribed user", async () => {
    const { POST } = await import("../src/app/api/billing/portal/route.ts");

    const response = await POST(portalRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://billing.stripe.com/session/portal_1",
    });
    expect(getStripe().billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://app.example/billing",
    });
  });

  it("maps a Stripe BillingConfigError to 503 with its code", async () => {
    getStripe.mockImplementation(() => {
      throw new BillingConfigError(
        "STRIPE_SECRET_KEY is not configured on the server.",
        "stripe_not_configured",
      );
    });
    const { POST } = await import("../src/app/api/billing/portal/route.ts");

    const response = await POST(portalRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "STRIPE_SECRET_KEY is not configured on the server.",
        code: "stripe_not_configured",
      },
    });
  });

  it("maps a portal session failure to a sanitized 500", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getStripe().billingPortal.sessions.create.mockRejectedValueOnce(new Error("stripe down"));
      const { POST } = await import("../src/app/api/billing/portal/route.ts");

      const response = await POST(portalRequest());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: {
          message: "Could not open the billing portal. Please try again or contact support.",
          code: "portal_failed",
        },
      });
    } finally {
      errSpy.mockRestore();
    }
  });
});
