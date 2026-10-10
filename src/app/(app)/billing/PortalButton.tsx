"use client";

import Link from "next/link";
import { useState } from "react";

export default function PortalButton() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function openPortal() {
    setBusy(true);
    setNote(null);
    setNeedsLogin(false);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (res.status === 401) {
        // A session lapse used to render inert text here and leave the customer
        // stuck: no redirect and no sign-in affordance, so the only way out was
        // typing the URL by hand. SubscribeButton already sends 401s to
        // /login?next=...; do the same and return so the busy state is cleared.
        setNote("Please sign in again.");
        setNeedsLogin(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      if (data?.error?.code === "stripe_not_configured") {
        setNote("Billing is not live yet - contact sales to manage your subscription.");
      } else {
        setNote(data?.error?.message ?? "Could not open the billing portal.");
      }
    } catch {
      setNote("Network error - try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button className="cta cta-primary" onClick={openPortal} disabled={busy}>
        {busy ? "Opening..." : "Manage billing in Stripe"}
      </button>
      {note ? <span className="billing-note"> {note}</span> : null}
      {needsLogin ? (
        <>
          {" "}
          <Link className="billing-note" href="/login?next=%2Fbilling">
            Sign in
          </Link>
        </>
      ) : null}
      <style jsx>{`
        .billing-note {
          font-size: 0.85rem;
          opacity: 0.75;
        }
      `}</style>
    </span>
  );
}
