import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("Audit Remediation & Verification Suite", () => {
  const repoRoot = process.cwd();

  it("AUDIT-006 (LEAD LOSS): /api/leads persists to public.leads and never reports success on a write failure", () => {
    const routePath = join(repoRoot, "src", "app", "api", "leads", "route.ts");
    const content = readFileSync(routePath, "utf8");

    // The defect: validate -> log a hash -> return {"status":"ok"} with no write.
    expect(content).toMatch(/from\(\s*["']leads["']\s*\)\s*\.insert\(/);
    // A failed write must surface as 5xx, never as { status: "ok" }.
    expect(content).toMatch(/if \(!persisted\)/);
    expect(content).toMatch(/status: 503/);
  });

  it("AUDIT-006b (LEAD LOSS): a public.leads migration exists and locks the table to project_admin", () => {
    const dir = join(repoRoot, "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    const match = files.filter((f) => /create table if not exists public\.leads/i.test(readFileSync(join(dir, f), "utf8")));
    expect(match.length).toBeGreaterThan(0);
    const sql = readFileSync(join(dir, match[0]), "utf8");
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/revoke all privileges on table public\.leads from anon, authenticated/i);
  });

  it("AUDIT-006c (LEAD LOSS): the chatbot only promises a 24h follow-up when the POST succeeded", () => {
    const content = readFileSync(join(repoRoot, "public", "aom-chatbot.js"), "utf8");
    // Must be async and gate the confirmation on the response.
    expect(content).toMatch(/async function showLeadConfirmation/);
    expect(content).toMatch(/stored = res\.ok/);
    expect(content).toMatch(/if \(CONFIG\.apiEndpoint\) \{[\s\S]{0,200}await fetch\(CONFIG\.apiEndpoint/);
  });

  it("AUDIT-008 (CONSENT ORDERING): the consent default precedes the GTM loader in every served page", () => {
    // Consent Mode only binds if the default exists BEFORE the container loads.
    const pages = [
      join(repoRoot, "src", "app", "layout.tsx"),
      join(repoRoot, "public", "index.html"),
      join(repoRoot, "public", "privacy.html"),
      join(repoRoot, "public", "cookie-policy.html"),
    ];
    for (const p of pages) {
      const content = readFileSync(p, "utf8");
      const consent = content.indexOf('gtag("consent", "default"');
      const gtm = content.indexOf("GTM-KL4BW5F2");
      expect(consent, `consent default missing in ${p}`).toBeGreaterThan(-1);
      expect(gtm, `GTM loader missing in ${p}`).toBeGreaterThan(-1);
      expect(consent, `consent default must precede GTM in ${p}`).toBeLessThan(gtm);
    }
  });

  it("AUDIT-008d (CONSENT EXECUTION): the consent default is a real inline script, not a next/script", () => {
    // Built HTML for strategy="beforeInteractive" only serialised the code
    // into the RSC payload (self.__next_s.push) and never executed it, so the
    // "denied by default" claim was not enforced at all. Guard the regression.
    const content = readFileSync(join(repoRoot, "src", "app", "layout.tsx"), "utf8");
    expect(content).toMatch(/<script\s+id="gtag-consent-default"\s+dangerouslySetInnerHTML/);
    expect(content).not.toMatch(/<Script id="gtag-consent-default"/);
  });

  it("AUDIT-008b (CONSENT HONESTY): policies disclose GTM and do not claim it is absent", () => {
    for (const f of ["privacy.html", "cookie-policy.html"]) {
      const content = readFileSync(join(repoRoot, "public", f), "utf8");
      expect(content, `${f} must disclose Google Tag Manager`).toMatch(/Google Tag Manager/);
      // The old, false statements.
      expect(content).not.toMatch(/No Google Analytics, Ads, or Tag Manager script is currently loaded/);
      expect(content).not.toMatch(/no third party analytics, advertising, or tracking scripts today/i);
      expect(content).not.toMatch(/No third party analytics, marketing, advertising, pixel, or font technology is currently installed/);
    }
  });

  it("AUDIT-008c (LEAD STORAGE): policies stop claiming leads are only kept in server logs", () => {
    for (const f of ["privacy.html", "cookie-policy.html"]) {
      const content = readFileSync(join(repoRoot, "public", f), "utf8");
      expect(content).not.toMatch(/where they are recorded in server logs/);
      expect(content).toMatch(/lead store/i);
    }
  });

  it("AUDIT-007 (DEPS): brace-expansion is pinned via version-scoped overrides, not one blanket version", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    const overrides = pkg.overrides ?? {};
    expect(overrides["minimatch@3"]).toEqual({ "brace-expansion": "1.1.21" });
    expect(overrides["minimatch@10"]).toEqual({ "brace-expansion": "5.0.12" });
    // A top-level brace-expansion pin would be a major-version mismatch for one chain.
    expect(overrides["brace-expansion"]).toBeUndefined();
  });

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
