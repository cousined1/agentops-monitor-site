import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// AUDIT-RUN-20260930-202741 / FINDING-api-surface-001 (Critical): the endpoint
// used to return 200 {"status":"ok"} while persisting nothing at all. These
// tests now assert the OPPOSITE contract — that a lead is actually written,
// and that a storage failure is surfaced as 503 rather than reported to the
// visitor as success. The previous assertions ("status is 200") would have
// passed against the defect itself, which is exactly what the audit found.
const insertRow = vi.fn();
const insertResult = vi.hoisted(() => ({ current: { data: null, error: null } }));

vi.mock("@insforge/sdk", () => ({
  createAdminClient: vi.fn(() => ({
    database: {
      from: vi.fn(() => ({ insert: insertRow.mockImplementation(async () => insertResult.current) })),
    },
  })),
}));

describe("leads endpoint hardening (DELTA-003 + audit persistence)", () => {
  let POST;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_INSFORGE_URL = "https://backend.example";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY = "anon-key-with-at-least-twenty-characters";
    process.env.INSFORGE_API_KEY = "admin-key-with-at-least-twenty-characters";
    ({ POST } = await import("../src/app/api/leads/route.ts"));
  });

  beforeEach(() => {
    insertRow.mockClear();
    insertResult.current = { data: null, error: null };
  });

  function leadRequest(body, ip = "203.0.113.10") {
    return new Request("https://app.example/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("accepts a valid lead AND persists it (regression test for the discarded-lead defect)", async () => {
    const res = await POST(
      leadRequest({ email: "lead@example.com", company: "Acme Corp", source: "chat" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.id).toEqual(expect.any(String));
    // The lead must reach storage, not just a log line.
    expect(insertRow).toHaveBeenCalledTimes(1);
    expect(insertRow).toHaveBeenCalledWith([
      expect.objectContaining({ email: "lead@example.com", company: "Acme Corp", source: "chat" }),
    ]);
  });

  it("returns 503 when the lead cannot be stored instead of reporting success", async () => {
    insertResult.current = { data: null, error: { message: "relation \"leads\" does not exist" } };
    const res = await POST(
      leadRequest({ email: "lead@example.com", company: "Acme Corp" }, "203.0.113.77"),
    );
    // Telling the visitor "ok" while their details were dropped is the defect.
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "We could not record your details. Please try again in a moment.",
    });
  });

  it("logs a LOST breadcrumb (never raw PII) when persistence fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      insertResult.current = { data: null, error: { message: "boom" } };
      await POST(leadRequest({ email: "victim@example.com", company: "Stealth Co" }, "203.0.113.88"));
      const logged = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("lead LOST");
      expect(logged).not.toContain("victim@example.com");
      expect(logged).not.toContain("Stealth Co");
    } finally {
      errSpy.mockRestore();
    }
  });

  it("never logs the raw email or transcript — only a hash and byte counts", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const transcript = [{ role: "user", text: "my prompt contains secrets" }];
      const res = await POST(
        leadRequest(
          { email: "victim@example.com", company: "Stealth Co", conversation: transcript },
          "203.0.113.99",
        ),
      );
      expect(res.status).toBe(200);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("lead stored");
      expect(logged).toContain("emailHash=");
      expect(logged).not.toContain("victim@example.com");
      expect(logged).not.toContain("my prompt contains secrets");
      expect(logged).not.toContain("Stealth Co");
      expect(logged).toContain("transcriptBytes=");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("rejects an invalid email with 400", async () => {
    const res = await POST(leadRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("accepts a ~50 KB payload under the 100 KB cap (F-04)", async () => {
    const res = await POST(
      leadRequest(
        { email: "lead@example.com", conversation: [{ sender: "user", text: "x".repeat(49_000) }] },
        "203.0.113.50",
      ),
    );
    expect(res.status).toBe(200);
  });

  it("rejects oversized payloads with 413 before doing any work", async () => {
    const bigBlob = "x".repeat(120_000);
    const res = await POST(leadRequest({ email: "lead@example.com", blob: bigBlob }));
    expect(res.status).toBe(413);
  });

  it("rate-limits the sixth submission from one IP within a minute", async () => {
    const ip = "198.51.100.7";
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await POST(
        leadRequest({ email: `lead${i}@example.com`, company: "Acme Corp" }, ip),
      );
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("scopes the CORS preflight to our own origin", async () => {
    const { OPTIONS } = await import("../src/app/api/leads/route.ts");
    const allowed = await OPTIONS(
      new Request("https://app.example/api/leads", {
        headers: { origin: "https://agentopsmonitor.com" },
      }),
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://agentopsmonitor.com");
    expect(allowed.headers.get("access-control-allow-methods")).toContain("POST");

    const foreign = await OPTIONS(
      new Request("https://app.example/api/leads", {
        headers: { origin: "https://attacker.example" },
      }),
    );
    expect(foreign.status).toBe(204);
    expect(foreign.headers.get("access-control-allow-origin")).toBeNull();
  });
});
