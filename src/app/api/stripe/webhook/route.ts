import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { appEnv } from "@/lib/env";
import {
  getAdmin,
  getPlanByPriceId,
  getProfileByCustomerId,
  getStripe,
  periodEndToIso,
  updateProfileBilling,
} from "@/lib/billing";

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
  // Checkout
  "checkout.session.completed",
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

async function applySubscriptionState(params: {
  userId?: string | null;
  customerId: string;
  priceId?: string | null;
  status: string;
  periodEndIso: string | null;
}) {
  const admin = getAdmin();
  let userId = params.userId ?? null;

  if (!userId && params.customerId) {
    const profile = await getProfileByCustomerId(params.customerId);
    userId = profile?.id ?? null;
  }
  if (!userId) {
    console.log(`[stripe-webhook] no profile for customer ${params.customerId}; skipping DB sync`);
    return;
  }

  let planName: string | null = null;
  if (params.priceId) {
    const plan = await getPlanByPriceId(params.priceId);
    planName = plan?.name ?? null;
  }

  const patch: Parameters<typeof updateProfileBilling>[1] = {
    current_plan_name: planName,
    subscription_status: params.status,
    current_period_end: params.periodEndIso,
  };
  if (params.customerId) {
    patch.stripe_customer_id = params.customerId;
  }

  await updateProfileBilling(userId, patch);
  console.log(
    `[stripe-webhook] profile ${userId} synced: plan=${planName ?? "?"} status=${params.status}`,
  );
}

// API-R02/F-04: bound the streamed body. Real Stripe events are far smaller;
// this endpoint is public, so refuse oversized bodies while reading them.
const MAX_WEBHOOK_BODY_BYTES = 5_000_000;

// F-04 (dos-defense): streaming reader that aborts at the cap instead of
// buffering the whole body before measuring it.
async function readBodyCapped(
  request: NextRequest,
  maxBytes: number,
): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: NextRequest) {
  let secret: string | undefined;
  try {
    secret = appEnv().STRIPE_WEBHOOK_SECRET;
  } catch (err) {
    // API-013: env schema failures must not leak their details.
    console.error("[stripe-webhook] env validation failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: { message: "Webhook is not configured.", code: "webhook_not_configured" } },
      { status: 500 },
    );
  }

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

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json(
      { error: { message: "Body too large.", code: "payload_too_large" } },
      { status: 413 },
    );
  }
  const rawBody = await readBodyCapped(request, MAX_WEBHOOK_BODY_BYTES);
  if (rawBody === null) {
    return NextResponse.json(
      { error: { message: "Body too large.", code: "payload_too_large" } },
      { status: 413 },
    );
  }

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error(
      "[stripe-webhook] signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: { message: "Signature verification failed.", code: "invalid_signature" } },
      { status: 400 },
    );
  }

  // DELTA-005: at-least-once with dedup. Verified events are recorded in
  // billing_processed_events (migrations/20260911000000); a repeat delivery
  // short-circuits. Handlers remain idempotent state-writes, so the tiny
  // race between two concurrent duplicate deliveries is benign.
  const dedupAdmin = getAdmin();
  let duplicate = false;
  {
    const { data: seen, error: seenError } = await dedupAdmin.database
      .from("billing_processed_events")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();
    if (seenError) {
      // Fail open: handlers are idempotent, so reprocessing is safe.
      console.error(`[stripe-webhook] dedup lookup failed for ${event.id}: ${seenError.message}`);
    } else if (seen) {
      duplicate = true;
    }
  }
  if (duplicate) {
    console.log(`[stripe-webhook] duplicate ${event.type} (id=${event.id}); skipping`);
    return NextResponse.json({
      received: true,
      type: event.type,
      handled: HANDLED_EVENTS.has(event.type),
      duplicate: true,
    });
  }

  const handled = HANDLED_EVENTS.has(event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === "string" ? session.subscription : session.subscription.id,
          );
          const priceId = sub.items.data[0]?.price?.id ?? null;
          const periodEnd =
            (sub as unknown as { current_period_end?: number | null }).current_period_end ??
            sub.items.data[0]?.current_period_end ??
            null;
          await applySubscriptionState({
            userId: (session.metadata?.userId as string) ?? session.client_reference_id,
            customerId:
              typeof session.customer === "string" ? session.customer : (session.customer?.id || ""),
            priceId,
            status: sub.status,
            periodEndIso: periodEndToIso(periodEnd),
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id ?? null;
        const periodEnd =
          (sub as unknown as { current_period_end?: number | null }).current_period_end ??
          sub.items.data[0]?.current_period_end ??
          null;
        await applySubscriptionState({
          userId: (sub.metadata?.userId as string) ?? null,
          customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          priceId,
          status: sub.status,
          periodEndIso: periodEndToIso(periodEnd),
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const profile = await getProfileByCustomerId(customerId);
        if (profile) {
          await updateProfileBilling(profile.id, {
            subscription_status: "canceled",
            current_plan_name: "free",
            current_period_end: null,
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          const profile = await getProfileByCustomerId(customerId);
          if (profile) {
            await updateProfileBilling(profile.id, { subscription_status: "past_due" });
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // DELTA-005: with dedup in place, a failed handler must 500 so Stripe
    // retries; the processed-events check prevents double-apply on retry.
    // Silently 200-ing here would drop the event permanently.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe-webhook] handler error for ${event.type} (id=${event.id}): ${message}`);
    return NextResponse.json(
      { error: { message: "Webhook handler failed; the event will be retried.", code: "webhook_handler_failed" } },
      { status: 500 },
    );
  }

  const { error: recordError } = await dedupAdmin.database
    .from("billing_processed_events")
    .insert([{ event_id: event.id, event_type: event.type }]);
  if (recordError && (recordError as { code?: string }).code !== "23505") {
    // Non-fatal: the handlers are idempotent, so a missed ledger row only
    // means a retried delivery would reprocess the same state.
    console.error(`[stripe-webhook] failed to record ${event.id}: ${JSON.stringify(recordError)}`);
  }

  console.log(
    `[stripe-webhook] ${handled ? "handled" : "unhandled"} ${event.type} (id=${event.id})`,
  );
  return NextResponse.json({ received: true, type: event.type, handled, duplicate: false });
}

// Stripe sends a GET when you configure a destination from the Dashboard
// to verify the endpoint responds. Return 200 so verification passes.
export function GET() {
  return NextResponse.json({ ok: true });
}