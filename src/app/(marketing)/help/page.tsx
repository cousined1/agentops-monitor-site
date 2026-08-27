import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help",
  description: "Answers to common AgentOps Monitor questions.",
  alternates: { canonical: "/help" },
};

export default function HelpPage() {
  return (
    <main>
      <section>
        <p className="eyebrow">Help</p>
        <h1>Help center</h1>
        <p className="lede">
          Common questions. If you do not see yours, contact us.
        </p>
        <p>
          <a className="cta cta-primary" href="/contact">Contact support</a>{" "}
          <a className="cta cta-ghost" href="/docs">Read the docs</a>
        </p>
      </section>

      <section>
        <h2>What is AgentOps Monitor?</h2>
        <p>
          Observability for AI agents in production. It replays every tool call, every LLM decision, and every dollar an agent spends.
        </p>
      </section>

      <section>
        <h2>How do I install the SDK?</h2>
        <p>
          One command. See the <a href="/docs">docs</a> for the install snippet and the full reference.
        </p>
        <pre className="install"><code>pip install agentops-monitor
agentops_monitor.init(api_key="aom_live_...")</code></pre>
      </section>

      <section>
        <h2>How do budget caps work?</h2>
        <p>
          Hard caps at the workflow, agent, or user. The run stops at the limit you set. See <a href="/features">features</a> for policy examples.
        </p>
      </section>

      <section>
        <h2>Where is my data?</h2>
        <p>
          Runs, spans, and API key metadata are stored against your account. See the <a href="/privacy">privacy notice</a> for retention and request details.
        </p>
      </section>

      <section>
        <h2>How much does it cost?</h2>
        <p>
          Free up to 10,000 runs a month. See <a href="/pricing">pricing</a> for Team and Enterprise.
        </p>
      </section>
    </main>
  );
}
