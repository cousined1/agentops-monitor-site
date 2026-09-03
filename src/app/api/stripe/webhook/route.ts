import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { appEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The billing/metering events this site cares about. Each event that arrives
// is acknowledged and logged so Stripe delivery history shows them processed.
const HANDLED_EVENTS = new Set([
  // Subscriptions
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  // Customers
  "customer.created",
  "customer.deleted",
  // Billing & payments
  "invoice.created",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.finalized",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  // Metered / overage (Enterprise tier)
  "billing.meter.error_report_triggered",
]);

export async function POST(request: NextRequest) {
  const env = appEnv();
  const secret = env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: { message: "STRIPE_WEBHOOK_SECRET is not configured.", code: "webhook_not_configured" } },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: { message: "Missing stripe-signature header.", code: "missing_signature" } },
      { status: 400 },
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature verification failed.";
    return NextResponse.json(
      { error: { message, code: "invalid_signature" } },
      { status: 400 },
    );
  }

  // Acknowledge and log the event. Stripe marks the delivery healthy on a 200.
  const handled = HANDLED_EVENTS.has(event.type);
  console.log(
    `[stripe-webhook] ${handled ? "handled" : "unhandled"} ${event.type} (id=${event.id})`,
  );

  // TODO(billing): add business logic here per event type: e.g.
  //   invoice.paid          -> provision/refresh access
  //   invoice.payment_failed-> trigger dunning / alert
  //   customer.subscription.updated -> sync tier in DB
  //   billing.meter.error_report_triggered -> alert on metering failure

  return NextResponse.json({ received: true, type: event.type, handled });
}

// Stripe sends a GET when you configure a destination from the Dashboard
// to verify the endpoint responds. Return 200 so verification passes.
export function GET() {
  return NextResponse.json({ ok: true });
}
