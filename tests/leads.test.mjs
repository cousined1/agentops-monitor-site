import { beforeAll, describe, expect, it, vi } from "vitest";

describe("leads endpoint hardening (DELTA-003)", () => {
  let POST;

  beforeAll(async () => {
    ({ POST } = await import("../src/app/api/leads/route.ts"));
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

  it("accepts a valid lead", async () => {
    const res = await POST(
      leadRequest({ email: "lead@example.com", company: "Acme Corp", source: "chat" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });

  it("never logs the raw email or transcript — only a hash and byte counts", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const transcript = [{ role: "user", text: "my prompt contains secrets" }];
      const res = await POST(
        leadRequest({ email: "victim@example.com", company: "Stealth Co", conversation: transcript }),
      );
      expect(res.status).toBe(200);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
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

  it("rejects oversized payloads with 413 before doing any work", async () => {
    const bigBlob = "x".repeat(20_000);
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
