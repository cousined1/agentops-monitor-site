import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for AgentOps Monitor. Pre-launch placeholder; final terms will be published before public release.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main>
      <section>
        <p className="eyebrow">Legal</p>
        <h1>Terms of Service</h1>
        <p className="lede">
          Pre-launch placeholder. Final terms will be published before public release.
        </p>
      </section>

      <section>
        <h2>Acceptance</h2>
        <p>
          By using AgentOps Monitor during the pre-launch period, you agree to use the service for evaluation and integration testing only. Production workloads should wait for the public release of these terms.
        </p>
      </section>

      <section>
        <h2>Service availability</h2>
        <p>
          The pre-launch service is provided as-is. We may reset, modify, or take down the service with reasonable notice.
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
