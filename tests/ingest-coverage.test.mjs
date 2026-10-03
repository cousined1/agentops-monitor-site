import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Wave G4 coverage closure for src/app/api/ingest/route.ts: declared-length
// 413, mid-stream read failure, invalid JSON, run/span size caps, RPC error,
// and an RPC result that fails the result schema. Only the @insforge/sdk
// boundary is mocked; the real route handler and real zod validation run.
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@insforge/sdk", () => ({
  createAdminClient: vi.fn(() => ({ database: { rpc } })),
}));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
  INGEST_RATE_LIMIT_PER_MIN: "600",
};

function authedRequest(body, extraHeaders = {}) {
  return new Request("https://app.example/api/ingest", {
    method: "POST",
    headers: {
      authorization: "Bearer aom_live_test_secret",
      "content-type": "application/json",
      ...extraHeaders,
    },
    body,
  });
}

const VALID_PAYLOAD = JSON.stringify({
  external_id: "run-coverage",
  agent_name: "coverage-agent",
  spans: [],
});

describe("ingest route coverage closure", () => {
  beforeAll(() => {
    Object.assign(process.env, BASE_ENV);
  });

  beforeEach(() => {
    rpc.mockReset();
  });

  it("rejects a body whose declared length exceeds the cap with 413", async () => {
    const { POST } = await import("../src/app/api/ingest/route.ts");

    // Real Request objects strip content-length; a header shim exercises the
    // declared-length shortcut (the streamed-cap path is covered elsewhere).
    const response = await POST({
      headers: new Headers({
        authorization: "Bearer aom_live_test_secret",
        "content-length": "2000000",
      }),
      body: null,
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "payload_too_large" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("propagates a mid-stream body read failure instead of swallowing it", async () => {
    const { POST } = await import("../src/app/api/ingest/route.ts");

    const request = new Request("https://app.example/api/ingest", {
      method: "POST",
      duplex: "half",
      headers: { authorization: "Bearer aom_live_test_secret" },
      body: new ReadableStream({
        start(controller) {
          controller.error(new Error("socket reset"));
        },
      }),
    });

    await expect(POST(request)).rejects.toThrow("socket reset");
  });

  it("rejects a body that is not valid JSON with 400 invalid_json", async () => {
    const { POST } = await import("../src/app/api/ingest/route.ts");

    const response = await POST(authedRequest("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_json" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects run metadata over the 64 KB cap with 413", async () => {
    const { POST } = await import("../src/app/api/ingest/route.ts");

    const response = await POST(
      authedRequest(
        JSON.stringify({
          external_id: "run-meta-big",
          agent_name: "coverage-agent",
          metadata: { blob: "x".repeat(70_000) },
        }),
      ),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Run metadata exceeds the size limit.", code: "payload_too_large" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a span whose fields exceed the 64 KB cap with 413", async () => {
    const { POST } = await import("../src/app/api/ingest/route.ts");

    const response = await POST(
      authedRequest(
        JSON.stringify({
          external_id: "run-span-big",
          agent_name: "coverage-agent",
          spans: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              span_type: "llm",
              input: { prompt: "x".repeat(70_000) },
            },
          ],
        }),
      ),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Span payload exceeds the size limit.", code: "payload_too_large" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps an RPC failure to a sanitized 500 ingest_transaction_failed", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      rpc.mockResolvedValue({ data: null, error: { message: "relation agent_runs missing" } });
      const { POST } = await import("../src/app/api/ingest/route.ts");

      const response = await POST(authedRequest(VALID_PAYLOAD));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "ingest_transaction_failed" },
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("rejects an RPC result that does not match the result schema", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const { POST } = await import("../src/app/api/ingest/route.ts");

    const response = await POST(authedRequest(VALID_PAYLOAD));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_ingest_result" },
    });
  });

  it("maps an invalid API key result from the RPC to 401", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, code: "invalid_api_key", message: "Unknown API key." },
      error: null,
    });
    const { POST } = await import("../src/app/api/ingest/route.ts");

    const response = await POST(authedRequest(VALID_PAYLOAD));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_api_key" },
    });
  });
});
