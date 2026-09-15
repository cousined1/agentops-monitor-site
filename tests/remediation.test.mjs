import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// REL-001 (High): the checkout / price-resolution surface had zero tests.
// Covers: env-var price override, not_purchasable guard, generic failure
// messages (P1), and the env-aware webhook price->plan mapping (API-005).

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("@insforge/sdk", () => ({ createAdminClient }));

const ENV_BASE = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
  INGEST_RATE_LIMIT_PER_MIN: "600",
};

const TEAM_ROW = { name: "team", stripe_price_id: "price_db_team" };
const ENTERPRISE_ROW = { name: "enterprise", stripe_price_id: "price_db_ent" };

function plansDb(byName, byPrice = {}) {
  return {
    database: {
      from: vi.fn(() => ({
        select: () => ({
          eq: (_col, value) =>
            Promise.resolve({
              data: byName[value] ? [byName[value]] : byPrice[value] ? [byPrice[value]] : [],
              error: null,
            }),
        }),
      })),
    },
  };
}

async function loadBilling(envOverrides = {}) {
  vi.resetModules();
  Object.assign(process.env, ENV_BASE);
  delete process.env.STRIPE_TEAM_PRICE_ID;
  delete process.env.STRIPE_ENTERPRISE_PRICE_ID;
  Object.assign(process.env, envOverrides);
  return import("../src/lib/billing.ts");
}

describe("billing price resolution (REL-001)", () => {
  it("prefers the env override over the plans table (STRIPE_TEAM_PRICE_ID)", async () => {
    const { getPlanPriceId } = await loadBilling({ STRIPE_TEAM_PRICE_ID: "price_env_team" });
    const price = await getPlanPriceId(TEAM_ROW);
    expect(price).toBe("price_env_team");
  });

  it("falls back to the plans-table price when no env override is set", async () => {
    const { getPlanPriceId } = await loadBilling();
    const price = await getPlanPriceId(TEAM_ROW);
    expect(price).toBe("price_db_team");
  });

  it("webhook mapping resolves an env-overridden price to its plan (API-005)", async () => {
    createAdminClient.mockImplementation(() => plansDb({ enterprise: ENTERPRISE_ROW }));
    const { getPlanByPriceId } = await loadBilling({ STRIPE_ENTERPRISE_PRICE_ID: "price_env_ent" });
    const plan = await getPlanByPriceId("price_env_ent");
    expect(plan?.name).toBe("enterprise");
  });

  it("webhook mapping still resolves prices that only exist in the plans table", async () => {
    createAdminClient.mockImplementation(() => plansDb({}, { price_db_team: TEAM_ROW }));
    const { getPlanByPriceId } = await loadBilling();
    const plan = await getPlanByPriceId("price_db_team");
    expect(plan?.name).toBe("team");
  });
});

describe("checkout route guards (REL-001 + P1)", () => {
  function mockUser() {
    vi.doMock("@/lib/insforge", () => ({
      getServerClient: async () => ({
        auth: { getCurrentUser: async () => ({ data: { user: { id: "u1", email: "e@x.co" } } }) },
      }),
    }));
  }

  it("rejects $0 / metered plans as not purchasable", async () => {
    vi.resetModules();
    Object.assign(process.env, ENV_BASE, { STRIPE_SECRET_KEY: "sk_test_checkout_tests" });
    mockUser();
    vi.doMock("@/lib/billing", async () => {
      const actual = await vi.importActual("../src/lib/billing.ts");
      return {
        ...actual,
        getPlanByName: async (name) => ({ name, stripe_price_id: "price_free", price_usd_cents: 0 }),
        getPlanPriceId: async (plan) => plan.stripe_price_id,
      };
    });
    const { POST } = await import("../src/app/api/billing/checkout/route.ts");
    const res = await POST(
      new Request("https://app.example/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "free" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("not_purchasable");
  });

  it("returns a generic 500 (no Stripe internals) when Stripe fails", async () => {
    vi.resetModules();
    Object.assign(process.env, ENV_BASE, { STRIPE_SECRET_KEY: "sk_test_checkout_tests" });
    mockUser();
    vi.doMock("@/lib/billing", async () => {
      const actual = await vi.importActual("../src/lib/billing.ts");
      return {
        ...actual,
        getPlanByName: async (name) => ({ name, stripe_price_id: "price_team", price_usd_cents: 29900 }),
        getPlanPriceId: async () => "price_team",
        getProfileByUserId: async () => null,
        getStripe: () => ({
          checkout: {
            sessions: {
              create: async () => {
                throw new Error("No such price: price_team (leaked internal detail)");
              },
            },
          },
        }),
        BillingConfigError: class BillingConfigError extends Error {},
      };
    });
    const { POST: POST_ROUTE } = await import("../src/app/api/billing/checkout/route.ts");
    const res = await POST_ROUTE(
      new Request("https://app.example/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "team" }),
      }),
    );
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("price_team");
    expect(text).toContain("Checkout could not be started");
  });
});

// REL-002 (High): the P0-1 surface — the signup profile upsert grant — must
// stay covered by hermetic invariants so a future grant change cannot
// silently break signup again.
describe("signup profile-upsert invariants (REL-002)", () => {
  const repoRoot = process.cwd();

  it("grants UPDATE (id) on profiles so the PostgREST merge-duplicates upsert can run", () => {
    const migration = join(repoRoot, "migrations", "20260915021500_fix-profile-upsert-grants.sql");
    expect(existsSync(migration)).toBe(true);
    const sql = readFileSync(migration, "utf8");
    expect(sql).toContain("grant update (id) on table public.profiles to authenticated;");
  });

  it("keeps the RLS with-check pinning profile ids to the caller (non-escalating grant)", () => {
    const hardening = readFileSync(
      join(repoRoot, "migrations", "20260820060710_harden-v1-runtime-privileges.sql"),
      "utf8",
    );
    expect(hardening).toMatch(
      /create policy "own profile" on public\.profiles[\s\S]*?with check \(\(select auth\.uid\(\)\) = id\)/,
    );
  });

  it("signup writes only non-billing columns into the profiles upsert", () => {
    const page = readFileSync(join(repoRoot, "src", "app", "signup", "page.tsx"), "utf8");
    const upsertBodies = [...page.matchAll(/\.upsert\(\s*\[\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
    expect(upsertBodies.length).toBeGreaterThanOrEqual(2); // signup + verify paths
    for (const body of upsertBodies) {
      expect(body).toMatch(/\bid\s*:/);
      expect(body).toMatch(/\bemail\b/);
      for (const forbidden of [
        "stripe_customer_id",
        "current_plan_name",
        "subscription_status",
        "current_period_end",
      ]) {
        expect(body).not.toContain(forbidden);
      }
    }
  });
});
