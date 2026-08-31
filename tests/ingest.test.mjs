import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@insforge/sdk", () => ({
  createAdminClient: vi.fn(() => ({
    database: { rpc },
  })),
}));

describe("ingest transaction boundary", () => {
  let POST;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_INSFORGE_URL = "https://backend.example";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY = "anon-key-with-at-least-twenty-characters";
    process.env.INSFORGE_API_KEY = "admin-key-with-at-least-twenty-characters";
    process.env.INGEST_RATE_LIMIT_PER_MIN = "600";
    ({ POST } = await import("../src/app/api/ingest/route.ts"));
  });

  beforeEach(() => {
    rpc.mockReset();
  });

  function request() {
    return new Request("https://app.example/api/ingest", {
      method: "POST",
      headers: {
        authorization: "Bearer aom_live_test_secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        external_id: "run-1",
        agent_name: "release-smoke",
        spans: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            span_type: "workflow",
          },
        ],
      }),
    });
  }

  it("accepts a replayed payload through the idempotent RPC", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        run_id: "00000000-0000-4000-8000-000000000002",
        span_count: 1,
      },
      error: null,
    });

    const first = await POST(request());
    const replay = await POST(request());

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith(
      "ingest_agent_run",
      expect.objectContaining({ p_rate_limit: 600 }),
    );
  });

  it("returns 429 when the transactional rate limit is exceeded", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: false,
        code: "rate_limited",
        message: "Ingest rate limit exceeded.",
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "rate_limited" },
    });
  });
});
