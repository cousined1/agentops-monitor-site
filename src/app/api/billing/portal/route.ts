import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/insforge";
import { appEnv } from "@/lib/env";
import { BillingConfigError, getProfileByUserId, getStripe } from "@/lib/billing";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InsforgeClient = Awaited<ReturnType<typeof getServerClient>>;

// F-06: distinguish an InsForge auth outage (503, retry later) from a
// genuinely sessionless request (401). Never answer an outage with 401.
async function requirePortalUser(insforge: InsforgeClient) {
  const { data: userData, error: authError } = await insforge.auth.getCurrentUser();
  if (authError) {
    console.error("[billing/portal] auth check failed:", authError.message);
    return {
      user: null,
      response: apiError(
        503,
        "Authentication is temporarily unavailable. Please try again shortly.",
        "auth_unavailable",
      ),
    };
  }
  const user = userData?.user ?? null;
  if (!user) {
    return {
      user: null,
      response: apiError(401, "Unauthorized", "unauthorized"),
    };
  }
  return { user, response: null };
}

export async function POST(request: NextRequest) {
  const insforge = await getServerClient();
  const { user, response: authFailure } = await requirePortalUser(insforge);
  if (authFailure) return authFailure;

  let env: ReturnType<typeof appEnv>;
  try {
    env = appEnv();
  } catch (err) {
    console.error("[billing/portal] env validation failed:", err instanceof Error ? err.message : err);
    return apiError(503, "Billing is not configured.", "billing_not_configured");
  }

  try {
    const stripe = getStripe();
    const profile = await getProfileByUserId(user.id);
    if (!profile?.stripe_customer_id) {
      return apiError(400, "No Stripe customer on file — subscribe to a plan first.", "no_customer");
    }
    const origin = (env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/billing`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    if (err instanceof BillingConfigError) {
      return apiError(503, err.message, err.code);
    }
    // P1: never leak Stripe/DB internals to the client.
    console.error(
      "[billing/portal] Stripe portal session failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError(
      500,
      "Could not open the billing portal. Please try again or contact support.",
      "portal_failed",
    );
  }
}
