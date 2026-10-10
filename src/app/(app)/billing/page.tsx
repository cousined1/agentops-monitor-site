import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/insforge";
import { getProfileByUserId } from "@/lib/billing";
import { Breadcrumbs } from "@/components/breadcrumbs";
import PortalButton from "./PortalButton";

export const metadata: Metadata = {
  title: "Billing",
  description: "Your AgentOps Monitor subscription status.",
  alternates: { canonical: "/billing" },
};

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "-";
  }
}

function displayPlanName(profile: Awaited<ReturnType<typeof getProfileByUserId>>) {
  if (profile?.current_plan_name) return profile.current_plan_name;
  if (profile?.subscription_status && profile.subscription_status !== "inactive") {
    return "managed externally";
  }
  return "free";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const { user, unavailable } = await getSessionState();
  if (unavailable) {
    return (
      <>
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/app" },
            { label: "Billing" },
          ]}
        />
        <section>
          <h1>Billing</h1>
          <p className="auth-error">
            Billing is temporarily unavailable because we could not verify your session.
          </p>
          <p>
            <Link href="/app">Back to dashboard</Link>
          </p>
        </section>
      </>
    );
  }
  if (!user) redirect("/login?next=/billing");

  let profile = null;
  try {
    profile = await getProfileByUserId(user.id);
  } catch (error) {
    console.error("[billing] profile lookup failed:", error instanceof Error ? error.message : error);
    return (
      <>
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/app" },
            { label: "Billing" },
          ]}
        />
        <section>
          <h1>Billing</h1>
          <p className="auth-error">
            Could not load your billing profile. Please try again shortly.
          </p>
          <p>
            <Link href="/app">Back to dashboard</Link>
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app" },
          { label: "Billing" },
        ]}
      />
      <section>
        <h1>Billing</h1>
        <p className="lede">Your subscription status, synced from Stripe.</p>
        {params.status === "success" ? (
          <p role="status">
            Payment received. Stripe is still confirming your subscription, so this
            page can briefly show your previous plan. Refresh in a moment to see the
            update.{" "}
            <Link href="/billing">Refresh now</Link>
          </p>
        ) : null}
      </section>

      <section className="cards">
        <article className="card">
          <p className="card-label">Plan</p>
          <p className="card-value">{displayPlanName(profile)}</p>
        </article>
        <article className="card">
          <p className="card-label">Status</p>
          <p className="card-value">{profile?.subscription_status ?? "inactive"}</p>
        </article>
        <article className="card">
          <p className="card-label">Current period ends</p>
          <p className="card-value">{formatDate(profile?.current_period_end ?? null)}</p>
        </article>
      </section>

      <section>
        <h2>Manage subscription</h2>
        {profile?.stripe_customer_id ? (
          <PortalButton />
        ) : (
          <p>
            No subscription on file yet. Subscribe from the <Link href="/pricing">pricing page</Link>.
          </p>
        )}
        <p style={{ marginTop: "1rem" }}>
          <Link href="/app">Back to dashboard</Link>
        </p>
      </section>
    </>
  );
}
