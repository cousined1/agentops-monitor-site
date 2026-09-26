import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for AgentOps Monitor.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main>
      <section>
        <p className="eyebrow">Legal</p>
        <h1>Terms of Service</h1>
        <p className="lede">
          Standard terms governing your use of AgentOps Monitor services and dashboard.
        </p>
      </section>

      <section>
        <h2>Acceptance</h2>
        <p>
          By using AgentOps Monitor, you agree to these terms. If you are entering into this agreement on behalf of a company, you represent that you have authority to bind that entity.
        </p>
      </section>

      <section>
        <h2>Service availability</h2>
        <p>
          We strive for high availability across all ingestion endpoints and dashboard services, backed by automated health monitoring and incident response.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          See the <a href="/privacy">Privacy Notice</a> for what we collect, how we use it, and how to make a data request.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions: <a href="mailto:privacy@agentopsmonitor.com">privacy@agentopsmonitor.com</a>.
        </p>
      </section>
    </main>
  );
}
