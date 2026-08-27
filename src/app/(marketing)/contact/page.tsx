import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Talk to AgentOps Monitor sales, support, or privacy.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main>
      <section>
        <p className="eyebrow">Contact</p>
        <h1>Talk to us.</h1>
        <p className="lede">Sales, support, privacy, and security. Pick the right door.</p>
      </section>

      <section>
        <h2>Sales</h2>
        <p>
          For Team and Enterprise plans, leave a work email and we will reach out within 24 hours.
        </p>
        <p>
          <a className="cta cta-primary" href="/signup">Create an account</a>{" "}
          <a className="cta cta-ghost" href="mailto:support@agentopsmonitor.com">
            Email sales
          </a>
        </p>
      </section>

      <section>
        <h2>Support</h2>
        <p>Already a customer? Open a ticket from inside the dashboard or email us.</p>
        <p>
          <a href="mailto:support@agentopsmonitor.com">support@agentopsmonitor.com</a>
        </p>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>Data requests, GDPR, deletion.</p>
        <p>
          <a href="mailto:privacy@agentopsmonitor.com">privacy@agentopsmonitor.com</a>
        </p>
      </section>
    </main>
  );
}
