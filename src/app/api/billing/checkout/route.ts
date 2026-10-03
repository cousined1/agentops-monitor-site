import { NextRequest, NextResponse } from "next/server";
import { appEnv, type AppEnv } from "@/lib/env";
import { getServerClient } from "@/lib/insforge";
import {
  BillingConfigError,
  getPlanByName,
  getPlanPriceId,
  getProfileByUserId,
  getStripe,
} from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutBody = { plan?: string };

type SessionUser = { id: string; email?: string };

type InsforgeClient = Awaited<ReturnType<typeof getServerClient>>;

// F-05: a profile holding any of these Stripe statuses must never start a
// second checkout session; they belong in the Billing Portal instead.
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function billingEnvFailure() {
  return NextResponse.json(
    { error: { message: "Billing is not configured.", code: "billing_not_configured" } },
    { status: 503 },
  );
}

// F-06: an InsForge auth outage is a 503, never a false 401 that sends a
// logged-in user to the signup page mid-outage.
async function requireCheckoutUser(insforge: InsforgeClient, request: NextRequest) {
  const { data: userData, error: authError } = await insforge.auth.getCurrentUser();
  if (authError) {
    console.error("[billing/checkout] auth check failed:", authError.message);
    return {
      user: null,
      response: NextResponse.json(
        {
          error: {
            message: "Authentication is temporarily unavailable. Please try again shortly.",
            code: "auth_unavailable",
          },
        },
        { status: 503 },
      ),
    };
  }
  const user = (userData?.user ?? null) as SessionUser | null;
  if (!user) {
    // F-05 unhappy path: checkout without a session belongs at signup.
    return { user: null, response: NextResponse.redirect(new URL("/signup", request.url), 303) };
  }
  return { user, response: null };
}

// F-05: query the profile before any Stripe work so an active subscriber can
// never create a duplicate subscription.
async function duplicateSubscriptionGuard(userId: string): Promise<NextResponse | null> {
  let profile;
  try {
    profile = await getProfileByUserId(userId);
  } catch (err) {
    console.error(
      "[billing/checkout] profile lookup failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        error: {
          message: "Your subscription status could not be checked. Please try again shortly.",
          code: "profile_unavailable",
        },
      },
      { status: 503 },
    );
  }
  if (ACTIVE_SUBSCRIPTION_STATUSES.has(profile?.subscription_status ?? "")) {
    return NextResponse.json({ url: "/billing", message: "Already subscribed" });
  }
  return null;
}

async function parsePlanName(request: NextRequest): Promise<string> {
  let body: CheckoutBody = {};
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    // empty body is fine; default plan below
  }
  // API-006: validate the plan selector instead of echoing unvalidated input.
  return /^[a-z]{2,24}$/.test((body.plan ?? "team").toString())
    ? (body.plan ?? "team").toString().toLowerCase()
    : "unknown";
}

async function buildCheckoutResponse(params: {
  request: NextRequest;
  env: AppEnv;
  user: SessionUser;
  planName: string;
}): Promise<NextResponse> {
  const { request, env, user, planName } = params;
  const stripe = getStripe();

  const plan = await getPlanByName(planName);
  if (!plan) {
    return NextResponse.json(
      { error: { message: `Unknown plan: ${planName}`, code: "unknown_plan" } },
      { status: 400 },
    );
  }
  if (plan.price_usd_cents <= 0) {
    return NextResponse.json(
      { error: { message: `"${plan.name}" is not a purchasable plan.`, code: "not_purchasable" } },
      { status: 400 },
    );
  }

  const priceId = await getPlanPriceId(plan);
  if (!priceId) {
    return NextResponse.json(
      {
        error: {
          message: `Plan "${plan.name}" has no Stripe price configured yet.`,
          code: "price_not_configured",
        },
      },
      { status: 503 },
    );
  }

  const profile = await getProfileByUserId(user.id);

  const origin = (env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/billing?status=success`,
    cancel_url: `${origin}/pricing?status=cancelled`,
    client_reference_id: user.id,
    ...(profile?.stripe_customer_id
      ? { customer: profile.stripe_customer_id }
      : { customer_email: user.email }),
    metadata: { userId: user.id, plan: plan.name },
    subscription_data: { metadata: { userId: user.id, plan: plan.name } },
    allow_promotion_codes: true,
  });
  const sessionUrl = session.url ?? "";
  if (!sessionUrl) {
    return NextResponse.json(
      { error: { message: "Stripe did not return a checkout URL.", code: "no_url" } },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: sessionUrl });
}

export async function POST(request: NextRequest) {
  let env: AppEnv;
  try {
    env = appEnv();
  } catch (err) {
    console.error("[billing/checkout] env validation failed:", err instanceof Error ? err.message : err);
    return billingEnvFailure();
  }

  const insforge = await getServerClient();
  const { user, response: authFailure } = await requireCheckoutUser(insforge, request);
  if (authFailure) return authFailure;

  const duplicate = await duplicateSubscriptionGuard(user.id);
  if (duplicate) return duplicate;

  const planName = await parsePlanName(request);
  try {
    return await buildCheckoutResponse({ request, env, user, planName });
  } catch (err) {
    if (err instanceof BillingConfigError) {
      return NextResponse.json(
        { error: { message: err.message, code: err.code } },
        { status: 503 },
      );
    }
    // P1: never leak Stripe/DB internals (e.g. price IDs, SQLSTATE) to the
    // client. Details go to server logs only.
    console.error(
      "[billing/checkout] Stripe session creation failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        error: {
          message: "Checkout could not be started. Please try again or contact support.",
          code: "checkout_failed",
        },
      },
      { status: 500 },
    );
  }
}
