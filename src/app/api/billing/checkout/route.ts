import { NextRequest, NextResponse } from "next/server";
import { appEnv } from "@/lib/env";
import { getServerClient } from "@/lib/insforge";
import {
  BillingConfigError,
  getPlanByName,
  getProfileByUserId,
  getStripe,
  getAdmin,
} from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutBody = { plan?: string };

export async function POST(request: NextRequest) {
  const env = appEnv();
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
  const planName = (body.plan ?? "team").toString().toLowerCase();

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
    if (!plan.stripe_price_id) {
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

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
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
    void env;
  } catch (err) {
    if (err instanceof BillingConfigError) {
      return NextResponse.json(
        { error: { message: err.message, code: err.code } },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : "Checkout failed.";
    return NextResponse.json({ error: { message, code: "checkout_failed" } }, { status: 500 });
  }

  void getAdmin;
  return NextResponse.json({ url: session_url });
}