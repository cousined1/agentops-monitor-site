import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@insforge/sdk", () => ({
  createAdminClient: vi.fn(() => ({
    database: { rpc, from: () => ({ insert: async () => ({ error: null }) }) },
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

  it("rejects oversized request bodies with 413 before touching the backend", async () => {
    const response = await POST(
      new Request("https://app.example/api/ingest", {
        method: "POST",
        headers: {
          authorization: "Bearer aom_live_test_secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          external_id: "run-too-big",
          agent_name: "size-probe",
          metadata: { blob: "x".repeat(1_100_000) },
        }),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "payload_too_large" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

// F-04 (dos-defense): bodies must be consumed through a streaming reader that
// aborts at the byte cap, never through unbounded request.text() buffering.
// Caps: 1 MB /api/ingest, 100 KB /api/leads, 5 MB /api/stripe/webhook.
describe("streaming body-size caps (F-04)", () => {
  let leadsPOST;
  let webhookPOST;

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_caps_test_secret";
    ({ POST: leadsPOST } = await import("../src/app/api/leads/route.ts"));
    ({ POST: webhookPOST } = await import("../src/app/api/stripe/webhook/route.ts"));
  });

  // A chunked body with NO Content-Length, so the route cannot rely on the
  // declared-length shortcut and must enforce the cap while reading. Pass a
  // number for a filler body of that many bytes, or a string to stream its
  // exact UTF-8 bytes.
  function streamedPost(url, body, headers = {}) {
    const bytes =
      typeof body === "number"
        ? null
        : new TextEncoder().encode(body);
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
            controller.enqueue(
              bytes ? bytes.subarray(sent, sent + n) : new Uint8Array(n).fill(120),
            );
            sent += n;
          }
          controller.close();
        },
      }),
    });
  }

  it("ingest: aborts a streamed body over the 1 MB cap with 413 before the backend", async () => {
    const { POST } = await import("../src/app/api/ingest/route.ts");
    rpc.mockReset();

    const res = await POST(
      streamedPost("https://app.example/api/ingest", 1_100_000, {
        authorization: "Bearer aom_live_test_secret",
        "content-type": "application/json",
      }),
    );

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "payload_too_large" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ingest: still accepts a normal small streamed payload", async () => {
    const { POST } = await import("../src/app/api/ingest/route.ts");
    rpc.mockReset();
    rpc.mockResolvedValue({
      data: { ok: true, run_id: "00000000-0000-4000-8000-000000000002", span_count: 1 },
      error: null,
    });

    const payload = JSON.stringify({
      external_id: "run-streamed",
      agent_name: "stream-smoke",
      spans: [{ id: "00000000-0000-4000-8000-000000000001", span_type: "workflow" }],
    });
    const res = await POST(
      streamedPost("https://app.example/api/ingest", payload, {
        authorization: "Bearer aom_live_test_secret",
        "content-type": "application/json",
      }),
    );

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("leads: accepts a 50 KB payload under the 100 KB cap", async () => {
    const res = await leadsPOST(
      new Request("https://app.example/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.201",
        },
        body: JSON.stringify({
          email: "big-lead@example.com",
          company: "Acme Corp",
          source: "chat",
          conversation: [{ sender: "user", text: "x".repeat(49_000) }],
        }),
      }),
    );

    expect(res.status).toBe(200);
  });

  it("leads: aborts a streamed body over the 100 KB cap with 413", async () => {
    const res = await leadsPOST(
      streamedPost("https://app.example/api/leads", 110_000, {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.202",
      }),
    );

    expect(res.status).toBe(413);
  });

  it("stripe webhook: rejects a body over the 5 MB cap with 413", async () => {
    const res = await webhookPOST(
      new Request("https://app.example/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=irrelevant" },
        body: JSON.stringify({ id: "evt_big", data: { blob: "x".repeat(5_100_000) } }),
      }),
    );

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "payload_too_large" },
    });
  });

  it("all three routes stream via request.body.getReader(), not request.text()", () => {
    for (const route of [
      "src/app/api/ingest/route.ts",
      "src/app/api/leads/route.ts",
      "src/app/api/stripe/webhook/route.ts",
    ]) {
      const source = readFileSync(new URL(`../${route}`, import.meta.url), "utf8");
      expect(source, route).toContain("getReader()");
      expect(source, route).not.toContain("await request.text()");
    }
  });
});
