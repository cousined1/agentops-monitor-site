import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiError } from "../src/lib/api-error.ts";

describe("apiError code union", () => {
  it("admits every code the billing routes can emit", () => {
    const billingCodes = [
      "billing_not_configured",
      "stripe_not_configured",
      "auth_unavailable",
      "unauthorized",
      "profile_unavailable",
      "unknown_plan",
      "not_purchasable",
      "price_not_configured",
      "no_url",
      "checkout_failed",
      "no_customer",
      "portal_failed",
    ];

    for (const code of billingCodes) {
      expect(apiError(400, "m", code).status).toBe(400);
    }
  });

  it("admits every code the webhook route can emit", () => {
    const webhookCodes = [
      "webhook_not_configured",
      "missing_signature",
      "invalid_signature",
      "payload_too_large",
      "webhook_handler_failed",
    ];

    for (const code of webhookCodes) {
      expect(apiError(500, "m", code).status).toBe(500);
    }
  });

  it("types BillingConfigError.code so no route needs a cast", () => {
    const content = readFileSync(join(process.cwd(), "src", "lib", "billing.ts"), "utf8");

    expect(content).toMatch(/code:\s*ErrorCode;/);
    expect(content).toMatch(/import type \{ ErrorCode \} from "\.\/api-error";/);
  });

  it("routes BillingConfigError straight through apiError without a cast", () => {
    for (const route of [
      join("src", "app", "api", "billing", "checkout", "route.ts"),
      join("src", "app", "api", "billing", "portal", "route.ts"),
    ]) {
      const content = readFileSync(join(process.cwd(), route), "utf8");

      expect(content, `cast in ${route}`).not.toMatch(/err\.code as ErrorCode/);
      expect(content, `inline envelope in ${route}`).not.toMatch(
        /NextResponse\.json\(\s*\{\s*error:\s*\{/,
      );
    }
  });

  it("keeps the ingest helper as the documented canonical reference", () => {
    const content = readFileSync(
      join(process.cwd(), "src", "app", "api", "ingest", "route.ts"),
      "utf8",
    );

    // ingest keeps its own local `error()` so the hot path stays allocation-free.
    // Asserted structurally rather than as one literal signature: the helper
    // gained an optional `extra` payload so a 402 quota response can carry
    // runs_used / runs_included, and pinning the exact parameter list would
    // fail on any future signature change without saying anything about intent.
    expect(content).toMatch(/function error\(\s*status: number,\s*message: string,\s*code: string/);
    // The canonical envelope must still be the shape every ingest error uses.
    expect(content).toMatch(/NextResponse\.json\(\{ error: \{ message, code \}/);
  });

  it("ingest reports a quota-exhausted key as 402, not as an invalid key", () => {
    const content = readFileSync(
      join(process.cwd(), "src", "app", "api", "ingest", "route.ts"),
      "utf8",
    );

    // A full free-tier month used to have no branch at all, so it would have
    // fallen through to `status = code === "rate_limited" ? 429 : 401` and told
    // a customer with a valid key that their key was invalid.
    expect(content).toMatch(/code: z\.enum\(\[.*"quota_exceeded".*\]\)/);
    expect(content).toMatch(/result\.data\.code === "quota_exceeded"/);
    expect(content).toMatch(/error\(402, result\.data\.message, "quota_exceeded"/);
  });

  it("the free-tier quota migration keeps the RPC signature unchanged", () => {
    const content = readFileSync(
      join(
        process.cwd(),
        "migrations",
        "20261009120000_free-tier-run-quota.sql",
      ),
      "utf8",
    );

    // Changing the parameter list would make PostgREST reject the live call and
    // break ingest for every customer the moment the route shipped ahead of the
    // migration. Same signature => safe, and not applying it degrades to
    // "no quota" rather than "no ingest".
    expect(content).toMatch(
      /create or replace function public\.ingest_agent_run\(\s*p_key_hash text,\s*p_payload jsonb,\s*p_rate_limit integer\s*\)/,
    );
    expect(content).toContain("'code', 'quota_exceeded'");
    // Failing open: a broken quota check must never stop telemetry landing.
    expect(content).toMatch(/exception[\s\S]*?when others then[\s\S]*?raise warning/);
  });
});