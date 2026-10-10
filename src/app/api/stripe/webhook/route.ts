import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { appEnv } from "@/lib/env";
import { apiError } from "@/lib/api-error";
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

// Events this endpoint actually applies to a profile. The response's `handled`
// flag is derived from THIS set — the switch below implements exactly these
// five cases and no others.
const IMPLEMENTED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

// Every event Stripe is configured to deliver. They are all signature-verified
// and acknowledged so the delivery history does not fill with retries, but
// anything outside IMPLEMENTED_EVENTS changes no billing state and must never be
// reported as handled. The previous single HANDLED_EVENTS set listed 14 types
// against 5 switch cases, so `invoice.paid` and friends were reported
// `handled: true` while doing nothing.
const ACKNOWLEDGED_EVENTS = new Set([
  ...IMPLEMENTED_EVENTS,
  // Subscriptions
  "customer.subscription.trial_will_end",
  // Customers
  "customer.created",
  "customer.deleted",
  // Billing & payments
  "invoice.created",
  "invoice.paid",
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
  let userId = params.userId ?? null;

  if (!userId && params.customerId) {
    const profile = await getProfileByCustomerId(params.customerId);
    userId = profile?.id ?? null;
  }
  if (!userId) {
    throw new Error(`No profile found for Stripe customer ${params.customerId}`);
  }

  let planName: string | undefined;
  if (params.priceId) {
    const plan = await getPlanByPriceId(params.priceId);
    if (!plan) {
      console.warn(
        `[stripe-webhook] unknown price ${params.priceId}; leaving current_plan_name unchanged`,
      );
    } else {
      planName = plan.name;
    }
  }

  const patch: Parameters<typeof updateProfileBilling>[1] = {
    subscription_status: params.status,
    current_period_end: params.periodEndIso,
  };
  if (planName !== undefined) {
    patch.current_plan_name = planName;
  }
  if (params.customerId) {
    patch.stripe_customer_id = params.customerId;
  }

  await updateProfileBilling(userId, patch);
  console.log(
    `[stripe-webhook] profile ${userId} synced: plan=${planName ?? "unchanged"} status=${params.status}`,
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
    return apiError(500, "Webhook is not configured.", "webhook_not_configured");
  }

  if (!secret) {
    return apiError(500, "STRIPE_WEBHOOK_SECRET is not configured.", "webhook_not_configured");
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return apiError(400, "Missing stripe-signature header.", "missing_signature");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    return apiError(413, "Body too large.", "payload_too_large");
  }
  const rawBody = await readBodyCapped(request, MAX_WEBHOOK_BODY_BYTES);
  if (rawBody === null) {
    return apiError(413, "Body too large.", "payload_too_large");
  }

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error(
      "[stripe-webhook] signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError(400, "Signature verification failed.", "invalid_signature");
  }

  // DELTA-005: at-least-once with dedup. Verified events are recorded in
  // billing_processed_events (migrations/20260911000000); a repeat delivery
  // short-circuits. Handlers remain idempotent state-writes, so the tiny
  // race between two concurrent duplicate deliveries is benign.
  //
  // getAdmin() and the dedup lookup sat outside the handler's try, so a
  // transport-level throw here escaped as an unstructured Next 500 instead of
  // the documented webhook_handler_failed envelope. Wrap the whole thing.
  let dedupAdmin: ReturnType<typeof getAdmin> | null = null;
  let duplicate = false;
  try {
    dedupAdmin = getAdmin();
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
  } catch (err) {
    // Fail open for the same reason: reprocessing an idempotent state write is
    // safer than dropping the event on a ledger read failure.
    console.error(
      `[stripe-webhook] dedup lookup threw for ${event.id}:`,
      err instanceof Error ? err.message : err,
    );
  }
  if (duplicate) {
    console.log(`[stripe-webhook] duplicate ${event.type} (id=${event.id}); skipping`);
    return NextResponse.json({
      received: true,
      type: event.type,
      handled: IMPLEMENTED_EVENTS.has(event.type),
      implemented: IMPLEMENTED_EVENTS.has(event.type),
      acknowledged: ACKNOWLEDGED_EVENTS.has(event.type),
      duplicate: true,
    });
  }

  const handled = IMPLEMENTED_EVENTS.has(event.type);

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
        // A cancellation that finds no profile used to be dropped silently:
        // no else, no throw, response still `handled: true`, and the customer
        // kept their paid plan after cancelling. Fail loudly so Stripe retries
        // and the mismatch is visible instead of silently granting service.
        if (!profile) {
          throw new Error(
            `Subscription cancelled for Stripe customer ${customerId} but no profile is linked; entitlements were not revoked.`,
          );
        }
        await updateProfileBilling(profile.id, {
          subscription_status: "canceled",
          current_plan_name: "free",
          current_period_end: null,
        });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        // No customer on the invoice means there is nothing to scope a sync to —
        // acknowledging is correct. The missing-PROFILE case below is the one
        // that silently dropped a dunning failure while the account stayed
        // active, so that one fails loudly and lets Stripe retry.
        if (!customerId) {
          console.warn(
            `[stripe-webhook] invoice.payment_failed with no customer (invoice ${invoice.id}); nothing to sync`,
          );
          break;
        }
        const profile = await getProfileByCustomerId(customerId);
        // Same silent-drop shape as the cancellation above: an unlinked profile
        // meant a failed payment was acknowledged as handled while the account
        // stayed active and past_due was never recorded.
        if (!profile) {
          throw new Error(
            `Payment failed for Stripe customer ${customerId} but no profile is linked; past_due was not recorded.`,
          );
        }
        await updateProfileBilling(profile.id, { subscription_status: "past_due" });
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
    return apiError(
      500,
      "Webhook handler failed; the event will be retried.",
      "webhook_handler_failed",
    );
  }

  // The ledger write is the last thing that can throw, so it is guarded too —
  // an unstructured 500 here would look identical to a handler failure to Stripe.
  // dedupAdmin is null when the client could not even be constructed above.
  if (!dedupAdmin) {
    console.error(
      `[stripe-webhook] no admin client; skipping ledger write for ${event.id}. ` +
        `A retry may reprocess this event.`,
    );
  } else {
    try {
      const { error: recordError } = await dedupAdmin.database
        .from("billing_processed_events")
        .insert([{ event_id: event.id, event_type: event.type }]);
      if (recordError && (recordError as { code?: string }).code !== "23505") {
        // Non-fatal: the handlers are idempotent, so a missed ledger row only
        // means a retried delivery would reprocess the same state.
        console.error(`[stripe-webhook] failed to record ${event.id}: ${JSON.stringify(recordError)}`);
      }
    } catch (err) {
      console.error(
        `[stripe-webhook] ledger write threw for ${event.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[stripe-webhook] ${handled ? "handled" : "acknowledged-only"} ${event.type} (id=${event.id})`,
  );
  return NextResponse.json({
    received: true,
    type: event.type,
    // `handled` is reserved for events that really did change billing state.
    handled,
    implemented: handled,
    // Acknowledged-but-unimplemented events are verified and logged only.
    acknowledged: ACKNOWLEDGED_EVENTS.has(event.type),
    duplicate: false,
  });
}

// Stripe sends a GET when you configure a destination from the Dashboard
// to verify the endpoint responds. Return 200 so verification passes.
export function GET() {
  return NextResponse.json({ ok: true });
}