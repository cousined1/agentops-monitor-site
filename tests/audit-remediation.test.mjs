import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Audit Remediation & Verification Suite", () => {
  const repoRoot = process.cwd();

  it("AUDIT-001 (CSP): includes googletagmanager in script-src in next.config.mjs and server.mjs", async () => {
    const nextConfigPath = join(repoRoot, "next.config.mjs");
    const nextConfigContent = readFileSync(nextConfigPath, "utf8");
    const serverMjsPath = join(repoRoot, "server.mjs");
    const serverMjsContent = readFileSync(serverMjsPath, "utf8");

    // Both configs must allow https://www.googletagmanager.com in script-src so GTM can execute
    expect(nextConfigContent).toMatch(/script-src[^;]*https:\/\/www\.googletagmanager\.com/);
    expect(serverMjsContent).toMatch(/script-src[^;]*https:\/\/www\.googletagmanager\.com/);
  });

  it("AUDIT-002 (IDOR): scopes revokeKey in app/api-keys/page.tsx to the authenticated user ID", () => {
    const pagePath = join(repoRoot, "src", "app", "(app)", "app", "api-keys", "page.tsx");
    const content = readFileSync(pagePath, "utf8");

    // revokeKey must resolve the user and scope with .eq("user_id", user.id)
    expect(content).toMatch(/revokeKey[\s\S]*?\.eq\(\s*["']user_id["']\s*,\s*user\.id\s*\)/);
  });

  it("AUDIT-003 (BILLING): prevents customer_id pollution with empty string in webhook handler", () => {
    const webhookPath = join(repoRoot, "src", "app", "api", "stripe", "webhook", "route.ts");
    const content = readFileSync(webhookPath, "utf8");

    // Must not fallback customerId to "" or write "" to stripe_customer_id
    expect(content).not.toMatch(/customerId:\s*typeof session\.customer === ["']string["'] \? session\.customer : session\.customer\?\.id \?\? ["']["']/);
  });

  it("AUDIT-004 (HEALTH): complies with GODMYTHOS health route contract", async () => {
    const { GET, HEAD, dynamic, revalidate } = await import("../src/app/api/health/route.ts");

    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);

    const getRes = await GET();
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("cache-control")).toBe("no-store, max-age=0");
    const getBody = await getRes.json();
    expect(getBody.status).toBe("ok");

    expect(typeof HEAD).toBe("function");
    const headRes = await HEAD();
    expect(headRes.status).toBe(200);
    expect(headRes.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("AUDIT-005 (ROUTING): middleware allows /not-found and unauthenticated 404 paths", async () => {
    const { middleware } = await import("../src/middleware.ts");
    const { NextRequest } = await import("next/server");

    // /not-found must not redirect to login
    const reqNotFound = new NextRequest("https://agentopsmonitor.com/not-found");
    const resNotFound = await middleware(reqNotFound);
    expect(resNotFound.headers.get("location")).toBeNull();

    // Unknown public route should not redirect to login, letting Next.js render 404
    const reqUnknown = new NextRequest("https://agentopsmonitor.com/unknown-random-page");
    const resUnknown = await middleware(reqUnknown);
    expect(resUnknown.headers.get("location")).toBeNull();

    // But protected /app and /billing routes MUST redirect to /login
    const reqApp = new NextRequest("https://agentopsmonitor.com/app");
    const resApp = await middleware(reqApp);
    expect(resApp.headers.get("location")).toContain("/login?next=%2Fapp");

    const reqBilling = new NextRequest("https://agentopsmonitor.com/billing");
    const resBilling = await middleware(reqBilling);
    expect(resBilling.headers.get("location")).toContain("/login?next=%2Fbilling");
  });
});
