import { beforeEach, describe, expect, it, vi } from "vitest";

// Wave G4 coverage closure for src/app/api/billing/status/route.ts: the
// profile-repair path and the DB-outage 503 path. Only external seams are
// mocked (@/lib/insforge, @/lib/billing); the real route handler runs.
const { getServerClient, getProfileByUserId, ensureProfileBilling } = vi.hoisted(() => ({
  getServerClient: vi.fn(),
  getProfileByUserId: vi.fn(),
  ensureProfileBilling: vi.fn(),
}));

vi.mock("@/lib/insforge", () => ({ getServerClient }));
vi.mock("@/lib/billing", () => ({ getProfileByUserId, ensureProfileBilling }));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
};

function statusRequest() {
  return new Request("https://app.example/api/billing/status");
}

describe("billing status route coverage closure", () => {
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
    getProfileByUserId.mockResolvedValue({
      id: "user-1",
      current_plan_name: "team",
      subscription_status: "active",
      current_period_end: null,
    });
  });

  it("self-heals a missing profile and reports repaired: true", async () => {
    getProfileByUserId.mockResolvedValue(null);
    ensureProfileBilling.mockResolvedValue({
      id: "user-1",
      current_plan_name: "free",
      subscription_status: "inactive",
      current_period_end: null,
    });
    const { GET } = await import("../src/app/api/billing/status/route.ts");

    const response = await GET(statusRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plan: "free",
      status: "inactive",
      currentPeriodEnd: null,
      repaired: true,
    });
    expect(ensureProfileBilling).toHaveBeenCalledWith("user-1", "team@example.com");
  });

  it("maps a profile read failure to 503, never a false free/inactive 200", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getProfileByUserId.mockRejectedValue(new Error("profiles table missing"));
      const { GET } = await import("../src/app/api/billing/status/route.ts");

      const response = await GET(statusRequest());

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: { message: "Service temporarily unavailable", code: "profile_unavailable" },
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("maps an ensureProfileBilling failure to 503 as well", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getProfileByUserId.mockResolvedValue(null);
      ensureProfileBilling.mockRejectedValue(new Error("upsert failed"));
      const { GET } = await import("../src/app/api/billing/status/route.ts");

      const response = await GET(statusRequest());

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: { message: "Service temporarily unavailable", code: "profile_unavailable" },
      });
    } finally {
      errSpy.mockRestore();
    }
  });
});
