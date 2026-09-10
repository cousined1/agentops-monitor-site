import type { Metadata } from "next";
import SubscribeButton from "./SubscribeButton";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free up to 10,000 runs a month. Team is $299 with 500,000 runs. Enterprise starts at $2,000. Run-volume pricing, not seat pricing.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main>
      <section>
        <p className="eyebrow">Pricing</p>
        <h1>Free to start. Priced like infrastructure.</h1>
        <p className="lede">
          Run-volume pricing, not seat pricing. The same plan covers one agent or a thousand.
        </p>
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
            <p>Cost governance, alerts</p>
            <p>Slack support</p>
            <p><SubscribeButton plan="team" label="Subscribe to Team" /></p>
          </article>
          <article className="card">
            <p className="card-label">Enterprise</p>
            <p className="card-value">from $2,000/mo</p>
            <p>Custom run limits</p>
            <p>SSO, audit export, custom policies</p>
            <p>Named support</p>
          </article>
        </div>
      </section>

      <section>
        <h2>Overage</h2>
        <p>$1.00 per 1,000 runs after the first 500K (metered).</p>
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
            <tr><td>Cost governance</td><td>-</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>Alerts</td><td>-</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>SSO</td><td>-</td><td>-</td><td>Yes</td></tr>
            <tr><td>Audit export</td><td>-</td><td>-</td><td>Yes</td></tr>
            <tr><td>Support</td><td>Community</td><td>Slack</td><td>Named</td></tr>
            <tr><td>Price</td><td>$0</td><td>$299</td><td>from $2,000</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <p className="eyebrow">Pre-launch</p>
        <p>Pricing shown is planned launch pricing. See <a href="/contact">contact</a> for the latest.</p>
      </section>
    </main>
  );
}

