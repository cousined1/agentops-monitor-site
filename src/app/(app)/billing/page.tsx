import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/insforge";
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

export default async function BillingPage() {
  const insforge = await getServerClient();
  const { data: userData } = await insforge.auth.getCurrentUser();
  const user = userData?.user;
  if (!user) redirect("/login?next=/billing");

  const profile = await getProfileByUserId(user.id);

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
        <p className="lede">
          Your subscription status, synced from Stripe.
        </p>
      </section>

      <section className="cards">
        <article className="card">
          <p className="card-label">Plan</p>
          <p className="card-value">{profile?.current_plan_name ?? "free"}</p>
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
            No subscription on file yet. Subscribe from the{" "}
            <Link href="/pricing">pricing page</Link>.
          </p>
        )}
        <p style={{ marginTop: "1rem" }}>
          <Link href="/app">Back to dashboard</Link>
        </p>
      </section>
    </>
  );
}
