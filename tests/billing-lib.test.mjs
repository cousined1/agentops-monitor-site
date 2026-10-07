import { beforeEach, describe, expect, it, vi } from "vitest";

// Wave G4 coverage closure for src/lib/billing.ts: the BillingConfigError
// constructor, the getStripe missing-key branch, the env price-override
// mapping in getPlanByPriceId, getProfileByCustomerId (success/error/empty),
// and periodEndToIso. Only the @insforge/sdk boundary is mocked. Modules are
// re-imported per test because appEnv() caches a successful parse.
const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));

vi.mock("@insforge/sdk", () => ({ createAdminClient }));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
};

function setEnv(overrides = {}) {
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function loadBilling() {
  vi.resetModules();
  return import("../src/lib/billing.ts");
}

// Minimal fluent InsForge admin mock: from(table).select().eq() -> {data,error};
// from("profiles").upsert() -> {error}.
function adminDb({ plans = [], profiles = [], planError = null, profileError = null } = {}) {
  return {
    database: {
      from: vi.fn((table) =>
        table === "plans"
          ? {
              select: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: planError ? null : plans, error: planError })),
              })),
            }
          : {
              select: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: profileError ? null : profiles,
                  error: profileError,
                })),
              })),
              upsert: vi.fn(async () => ({ error: null })),
            },
      ),
    },
  };
}

const TEAM_PLAN = {
  id: "plan-team",
  name: "team",
  stripe_price_id: "price_team_db",
  included_runs: 10_000,
  price_usd_cents: 2900,
  overage_per_1k: 0,
};

describe("lib/billing coverage closure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getStripe throws BillingConfigError when STRIPE_SECRET_KEY is missing", async () => {
    setEnv({ STRIPE_SECRET_KEY: undefined });
    const { getStripe, BillingConfigError } = await loadBilling();

    let caught;
    try {
      getStripe();
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BillingConfigError);
    expect(caught.code).toBe("stripe_not_configured");
    expect(caught.message).toContain("STRIPE_SECRET_KEY is not configured");
  });

  it("getStripe returns a Stripe client when STRIPE_SECRET_KEY is present", async () => {
    setEnv({ STRIPE_SECRET_KEY: "sk_test_4eC39HqLyjWDarjtT1zdp7dc" });
    const { getStripe } = await loadBilling();
    const { default: Stripe } = await import("stripe");

    expect(getStripe()).toBeInstanceOf(Stripe);
  });

  it("getPlanByPriceId resolves an env-overridden team price to the team plan", async () => {
    setEnv({ STRIPE_TEAM_PRICE_ID: "price_team_env" });
    createAdminClient.mockReturnValue(adminDb({ plans: [TEAM_PLAN] }));
    const { getPlanByPriceId } = await loadBilling();

    await expect(getPlanByPriceId("price_team_env")).resolves.toEqual(TEAM_PLAN);
    expect(createAdminClient).toHaveBeenCalled();
  });

  it("getPlanByPriceId resolves an env-overridden enterprise price to the enterprise plan", async () => {
    setEnv({ STRIPE_ENTERPRISE_PRICE_ID: "price_ent_env" });
    const enterprisePlan = { ...TEAM_PLAN, id: "plan-ent", name: "enterprise" };
    createAdminClient.mockReturnValue(adminDb({ plans: [enterprisePlan] }));
    const { getPlanByPriceId } = await loadBilling();

    await expect(getPlanByPriceId("price_ent_env")).resolves.toEqual(enterprisePlan);
  });

  it("getProfileByCustomerId returns the matching profile row", async () => {
    setEnv();
    const profile = {
      id: "user-1",
      stripe_customer_id: "cus_1",
      current_plan_name: "team",
      subscription_status: "active",
      current_period_end: null,
    };
    createAdminClient.mockReturnValue(adminDb({ profiles: [profile] }));
    const { getProfileByCustomerId } = await loadBilling();

    await expect(getProfileByCustomerId("cus_1")).resolves.toEqual(profile);
  });

  it("getProfileByCustomerId returns null when no profile matches", async () => {
    setEnv();
    createAdminClient.mockReturnValue(adminDb({ profiles: [] }));
    const { getProfileByCustomerId } = await loadBilling();

    await expect(getProfileByCustomerId("cus_missing")).resolves.toBeNull();
  });

  it("getProfileByCustomerId throws when the query errors", async () => {
    setEnv();
    createAdminClient.mockReturnValue(adminDb({ profileError: { message: "profiles table missing" } }));
    const { getProfileByCustomerId } = await loadBilling();

    await expect(getProfileByCustomerId("cus_1")).rejects.toThrow("profiles table missing");
  });

  it("periodEndToIso converts epoch seconds and nullish values", async () => {
    setEnv();
    const { periodEndToIso } = await loadBilling();

    expect(periodEndToIso(1800000000)).toBe(new Date(1800000000 * 1000).toISOString());
    expect(periodEndToIso(null)).toBeNull();
    expect(periodEndToIso(undefined)).toBeNull();
    expect(periodEndToIso(0)).toBeNull();
  });
});
