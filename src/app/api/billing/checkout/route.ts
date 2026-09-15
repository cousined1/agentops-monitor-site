import { NextRequest, NextResponse } from "next/server";
import { appEnv } from "@/lib/env";
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

export async function POST(request: NextRequest) {
  let env: ReturnType<typeof appEnv>;
  try {
    env = appEnv();
  } catch (err) {
    console.error("[billing/checkout] env validation failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: { message: "Billing is not configured.", code: "billing_not_configured" } },
      { status: 503 },
    );
  }
  const insforge = await getServerClient();
  const { data: userData } = await insforge.auth.getCurrentUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CheckoutBody = {};
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    // empty body is fine; default plan below
  }
  // API-006: validate the plan selector instead of echoing unvalidated input.
  const planName = /^[a-z]{2,24}$/.test((body.plan ?? "team").toString())
    ? (body.plan ?? "team").toString().toLowerCase()
    : "unknown";

  let session_url: string;
  try {
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
    session_url = session.url ?? "";
    if (!session_url) {
      return NextResponse.json(
        { error: { message: "Stripe did not return a checkout URL.", code: "no_url" } },
        { status: 502 },
      );
    }
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

  return NextResponse.json({ url: session_url });
}