"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SubscribeButton({
  plan,
  label = "Subscribe",
  subscribed = false,
}: {
  plan: string;
  label?: string;
  // F-05: an active subscriber manages their plan through the Billing Portal;
  // launching Stripe Checkout again would create a duplicate subscription.
  subscribed?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  async function startCheckout() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      // F-05: the route 303-redirects sessionless requests to /signup.
      if (res.status === 401 || res.type === "opaqueredirect") {
        router.push("/signup");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      if (data?.error?.code === "price_not_configured") {
        setNote("Billing for this plan is being set up — email us and we'll flip it on.");
      } else if (data?.error?.code === "stripe_not_configured") {
        setNote("Billing is not live yet — contact sales to subscribe.");
      } else {
        setNote(data?.error?.message ?? "Could not start checkout.");
      }
    } catch {
      setNote("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function openBillingPortal() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        router.push("/login?next=/billing");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setNote(data?.error?.message ?? "Could not open the billing portal.");
    } catch {
      setNote("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button
        className="cta cta-primary"
        onClick={subscribed ? openBillingPortal : startCheckout}
        disabled={busy}
      >
        {busy ? "Redirecting…" : label}
      </button>
      {note ? <span className="billing-note"> {note}</span> : null}
      <style jsx>{`
        .billing-note {
          font-size: 0.85rem;
          opacity: 0.75;
        }
      `}</style>
    </span>
  );
}
