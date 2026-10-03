import { beforeAll, describe, expect, it, vi } from "vitest";

// Wave G4 coverage closure for src/app/api/leads/route.ts rate-limiter
// maintenance loops (allowRequest): the expired-entry prune scan that runs
// once the bucket map passes 10,000 entries, and the oldest-window eviction
// at the 20,000-entry cap. The module's buckets map is private, so the only
// honest way in is through the real POST handler with 20k distinct client
// IPs. Only the @insforge/sdk boundary is mocked.
vi.mock("@insforge/sdk", () => ({
  createAdminClient: vi.fn(() => ({
    database: {
      from: vi.fn(() => ({ insert: vi.fn(async () => ({ data: null, error: null })) })),
    },
  })),
}));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
};

function ipFor(i) {
  return `10.${Math.floor(i / 65_536)}.${Math.floor((i % 65_536) / 256)}.${i % 256}`;
}

describe("leads rate-limiter bucket maintenance (API-004)", () => {
  beforeAll(() => {
    Object.assign(process.env, BASE_ENV);
  });

  it(
    "prunes past 10k buckets and evicts the oldest window at the 20k cap without false 429s",
    { timeout: 300_000 },
    async () => {
      const { POST } = await import("../src/app/api/leads/route.ts");

      // Freeze Date.now so no window can expire mid-run: the maintenance
      // loops under test are the >10k prune scan and the 20k oldest-first
      // eviction, not window expiry.
      vi.useFakeTimers();
      try {
        const TOTAL = 20_001;
        const statuses = new Set();
        for (let i = 0; i < TOTAL; i += 1) {
          const response = await POST(
            new Request("https://app.example/api/leads", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-forwarded-for": ipFor(i),
              },
              // Invalid JSON keeps the request cheap: allowRequest (the code
              // under test) still runs and maintains buckets before the parse
              // step rejects with 400.
              body: "x",
            }),
          );
          statuses.add(response.status);
        }
        // Every distinct-IP request stays inside its own 5/min window: cap
        // maintenance must never turn a legitimate submission into a 429.
        expect(statuses).toEqual(new Set([400]));

        // A valid lead from a fresh IP still succeeds after cap eviction.
        const valid = await POST(
          new Request("https://app.example/api/leads", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-forwarded-for": "10.255.255.255",
            },
            body: JSON.stringify({ email: "lead@example.com", source: "bucket-test" }),
          }),
        );
        expect(valid.status).toBe(200);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
