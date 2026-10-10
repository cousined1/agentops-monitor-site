import type { Metadata } from "next";
import { getSessionState } from "@/lib/insforge";
import { getProfileByUserId } from "@/lib/billing";
import SubscribeButton from "./SubscribeButton";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free up to 10,000 runs a month. Team is $299 with 500,000 runs. Enterprise starts at $2,000. Run-volume pricing, not seat pricing.",
  alternates: { canonical: "/pricing" },
};

export const dynamic = "force-dynamic";

async function getPricingState(): Promise<{ subscribed: boolean; authUnavailable: boolean }> {
  const session = await getSessionState();
  if (session.unavailable) {
    return { subscribed: false, authUnavailable: true };
  }
  if (!session.user) {
    return { subscribed: false, authUnavailable: false };
  }

  try {
    const profile = await getProfileByUserId(session.user.id);
    const status = profile?.subscription_status;
    return {
      subscribed: status === "active" || status === "trialing",
      authUnavailable: false,
    };
  } catch (error) {
    console.error("[pricing] subscription check failed:", error instanceof Error ? error.message : error);
    return { subscribed: false, authUnavailable: true };
  }
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; checkout?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const { subscribed, authUnavailable } = await getPricingState();
  const resumeCheckout = params.checkout === "1" && params.plan === "team";

  return (
    <main id="main" tabIndex={-1}>
      <section>
        <p className="eyebrow">Pricing</p>
        <h1>Free to start. Priced like infrastructure.</h1>
        <p className="lede">
          Run-volume pricing, not seat pricing. The same plan covers one agent or a thousand.
        </p>
        {params.status === "cancelled" ? (
          <p role="status">Checkout was cancelled. You can try again whenever you’re ready.</p>
        ) : null}
        {authUnavailable ? (
          <p className="auth-error">
            We could not verify your current subscription right now. Please retry in a moment.
          </p>
        ) : null}
        <p>
          <a className="cta cta-primary" href="/signup">Start free</a>{" "}
          <a className="cta cta-ghost" href="/contact">Talk to sales</a>
        </p>
      </section>

      <section>
        <h2>Plans</h2>
        <div className="cards">
          <article className="card">
            <p className="card-label">Free</p>
            <p className="card-value">$0/mo</p>
            <p>10,000 agent runs / month</p>
            <p>Basic tracing</p>
            <p>Community support</p>
          </article>
          <article className="card">
            <p className="card-label">Team</p>
            <p className="card-value">$299/mo</p>
            <p>500,000 runs</p>
            <p>Cost attribution, full trace detail</p>
            <p>Slack support</p>
            <p>
              <SubscribeButton
                plan="team"
                label={subscribed ? "Manage subscription" : "Subscribe to Team"}
                subscribed={subscribed}
                autoStart={resumeCheckout && !subscribed && !authUnavailable}
                disabledReason={
                  authUnavailable
                    ? "Billing is temporarily unavailable while session checks recover. Please retry shortly."
                    : null
                }
              />
            </p>
          </article>
          <article className="card">
            <p className="card-label">Enterprise</p>
            <p className="card-value">from $2,000/mo</p>
            <p>Custom run limits</p>
            <p>SSO, audit export, custom policies (planned)</p>
            <p>Named support</p>
          </article>
        </div>
      </section>

      <section>
        <h2>Overage</h2>
        <p>
          Team overage is not charged yet. The free tier&apos;s 10,000 runs per month
          is enforced at ingest, and a Team account keeps ingesting past 500K rather
          than being cut off. Metered overage billing at $1.00 per 1,000 runs is on
          the roadmap - see <a href="/features">features</a>.
        </p>
      </section>

      <section>
        <h2>Compare plans</h2>
        <table className="ledger">
          <thead>
            <tr>
              <th></th>
              <th>Free</th>
              <th>Team</th>
              <th>Enterprise</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Runs / month</td><td>10K</td><td>500K</td><td>Custom</td></tr>
            <tr><td>Tracing</td><td>Basic</td><td>Full</td><td>Full</td></tr>
            <tr><td>Cost governance</td><td>-</td><td>Planned</td><td>Planned</td></tr>
            <tr><td>Alerts</td><td>-</td><td>Planned</td><td>Planned</td></tr>
            <tr><td>SSO</td><td>-</td><td>-</td><td>Planned</td></tr>
            <tr><td>Audit export</td><td>-</td><td>-</td><td>Planned</td></tr>
            <tr><td>Support</td><td>Community</td><td>Slack</td><td>Named</td></tr>
            <tr><td>Price</td><td>$0</td><td>$299</td><td>from $2,000</td></tr>
          </tbody>
        </table>
        <p className="lede">
          &quot;Planned&quot; means committed on this tier but not built yet. What
          works today is tracing: every run and span, with tokens and USD cost,
          plus per-key ingest rate limiting. Spend caps and automated budget
          enforcement are on the roadmap - see <a href="/features">features</a>.
        </p>
      </section>

      <section>
        <p className="eyebrow">Pricing notes</p>
        <p>Annual billing and custom volume commitments are available. See <a href="/contact">contact</a> for details.</p>
      </section>
    </main>
  );
}
