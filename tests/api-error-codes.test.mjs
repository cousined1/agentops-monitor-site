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
    expect(content).toMatch(/function error\(status: number, message: string, code: string\)/);
    expect(content).toMatch(/NextResponse\.json\(\{ error: \{ message, code \} \}, \{ status \}\)/);
  });
});