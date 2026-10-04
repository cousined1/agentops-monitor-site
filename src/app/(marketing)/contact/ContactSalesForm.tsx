"use client";

import type { FormEvent } from "react";
import { useState } from "react";

type SubmitState = {
  kind: "idle" | "success" | "error";
  message: string | null;
};

function getErrorMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: { message?: string } }).error?.message === "string"
  ) {
    return (payload as { error: { message: string } }).error.message;
  }
  return "We could not save your request right now. Please email support@agentopsmonitor.com.";
}

export default function ContactSalesForm() {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle", message: null });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = (formData.get("email") ?? "").toString().trim();
    const company = (formData.get("company") ?? "").toString().trim();
    const note = (formData.get("note") ?? "").toString().trim();

    setBusy(true);
    setState({ kind: "idle", message: null });
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          company: company || undefined,
          source: "contact-page",
          product: "agentops_monitor",
          conversation: note ? [{ role: "user", content: note }] : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState({ kind: "error", message: getErrorMessage(payload) });
        return;
      }
      form.reset();
      setState({
        kind: "success",
        message: "Thanks — we saved your request and will follow up within 24 hours.",
      });
    } catch {
      setState({
        kind: "error",
        message: "Network error. Please retry or email support@agentopsmonitor.com.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <label>
        Work email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Company
        <input name="company" type="text" autoComplete="organization" />
      </label>
      <label>
        What do you want to monitor?
        <textarea name="note" rows={4} placeholder="Agents, workflows, scale, or rollout timeline" />
      </label>
      <button className="cta cta-primary" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Request a sales follow-up"}
      </button>
      {state.message ? (
        <p className={state.kind === "error" ? "auth-error" : undefined} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
