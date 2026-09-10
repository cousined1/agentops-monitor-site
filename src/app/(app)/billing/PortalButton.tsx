"use client";

import { useState } from "react";

export default function PortalButton() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function openPortal() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (res.status === 401) {
        setNote("Please sign in again.");
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
      <style jsx>{`
        .billing-note {
          font-size: 0.85rem;
          opacity: 0.75;
        }
      `}</style>
    </span>
  );
}
