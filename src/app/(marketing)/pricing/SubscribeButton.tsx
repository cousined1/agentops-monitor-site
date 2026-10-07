"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function SubscribeButton({
  plan,
  label = "Subscribe",
  subscribed = false,
  autoStart = false,
  disabledReason = null,
}: {
  plan: string;
  label?: string;
  subscribed?: boolean;
  autoStart?: boolean;
  disabledReason?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();
  const startedRef = useRef(false);

  async function startCheckout() {
    if (disabledReason) {
      setNote(disabledReason);
      return;
    }

    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 401 || res.type === "opaqueredirect") {
        router.push(`/signup?next=${encodeURIComponent(`/pricing?checkout=1&plan=${plan}`)}`);
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
      } else if (data?.error?.code === "auth_unavailable") {
        setNote("Authentication is temporarily unavailable. Please retry shortly.");
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
    if (disabledReason) {
      setNote(disabledReason);
      return;
    }

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

  useEffect(() => {
    if (!autoStart || subscribed || startedRef.current) return;
    startedRef.current = true;
    void startCheckout();
  }, [autoStart, subscribed]);

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
