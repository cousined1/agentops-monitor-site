import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Wave G4 coverage closure for src/app/api/leads/route.ts: declared-length
// 413, mid-stream read failure, invalid JSON, invalid payload, and the
// persistence-throw path. Only the @insforge/sdk boundary is mocked; the real
// route handler, rate limiter, and zod validation run.
const adminBehavior = vi.hoisted(() => ({ throwOnCreate: false }));

vi.mock("@insforge/sdk", () => ({
  createAdminClient: vi.fn(() => {
    if (adminBehavior.throwOnCreate) throw new Error("admin client unavailable");
    return {
      database: { from: vi.fn(() => ({ insert: vi.fn(async () => ({ data: null, error: null })) })) },
    };
  }),
}));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
};

function leadRequest(body, ip = "203.0.113.250") {
  return new Request("https://app.example/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("leads route validation coverage closure", () => {
  beforeAll(() => {
    Object.assign(process.env, BASE_ENV);
  });

  beforeEach(() => {
    adminBehavior.throwOnCreate = false;
  });

  it("rejects a body whose declared length exceeds the cap with 413", async () => {
    const { POST } = await import("../src/app/api/leads/route.ts");

    // Real Request objects strip content-length; a header shim exercises the
    // declared-length shortcut (the streamed-cap path is covered elsewhere).
    const response = await POST({
      headers: new Headers({ "content-length": "200000" }),
      body: null,
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Lead payload too large." });
  });

  it("propagates a mid-stream body read failure instead of swallowing it", async () => {
    const { POST } = await import("../src/app/api/leads/route.ts");

    const request = new Request("https://app.example/api/leads", {
      method: "POST",
      duplex: "half",
      headers: { "x-forwarded-for": "203.0.113.251" },
      body: new ReadableStream({
        start(controller) {
          controller.error(new Error("socket reset"));
        },
      }),
    });

    await expect(POST(request)).rejects.toThrow("socket reset");
  });

  it("rejects a body that is not valid JSON with 400", async () => {
    const { POST } = await import("../src/app/api/leads/route.ts");

    const response = await POST(leadRequest("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON" });
  });

  it("rejects a payload that fails schema validation with 400", async () => {
    const { POST } = await import("../src/app/api/leads/route.ts");

    const response = await POST(leadRequest({ company: "No Email Corp" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid lead payload." });
  });

  it("returns 503 when persistence throws instead of reporting success", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      adminBehavior.throwOnCreate = true;
      const { POST } = await import("../src/app/api/leads/route.ts");

      const response = await POST(
        leadRequest({ email: "lead@example.com", company: "Acme Corp" }, "203.0.113.252"),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("30");
      await expect(response.json()).resolves.toEqual({
        error: "We could not record your details. Please try again in a moment.",
      });
      const logged = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("lead LOST");
      expect(logged).toContain("persistError=admin client unavailable");
    } finally {
      errSpy.mockRestore();
    }
  });
});
