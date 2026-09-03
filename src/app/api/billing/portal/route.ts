import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/insforge";
import { BillingConfigError, getProfileByUserId, getStripe } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const insforge = await getServerClient();
  const { data: userData } = await insforge.auth.getCurrentUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const stripe = getStripe();
    const profile = await getProfileByUserId(user.id);
    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: { message: "No Stripe customer on file — subscribe to a plan first.", code: "no_customer" } },
        { status: 400 },
      );
    }
    const origin = new URL(request.url).origin;
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/billing`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    if (err instanceof BillingConfigError) {
      return NextResponse.json(
        { error: { message: err.message, code: err.code } },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : "Portal session failed.";
    return NextResponse.json({ error: { message, code: "portal_failed" } }, { status: 500 });
  }
}