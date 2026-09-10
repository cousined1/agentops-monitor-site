import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Integrations",
  description: "Planned framework adapters and tool integrations for AgentOps Monitor.",
  alternates: { canonical: "/integrations" },
};

export default function IntegrationsPage() {
  return (
    <main>
      <section>
        <p className="eyebrow">Integrations</p>
        <h1>Frameworks and tools you already run.</h1>
        <p className="lede">
          The SDK ingests from the agents you have today and the tools they already call.
        </p>
      </section>

      <section>
        <h2>Framework adapters</h2>
        <div className="cards">
          <article className="card">
            <p className="card-label">Planned</p>
            <p className="card-value">LangChain</p>
            <p>Capture chains, tools, and LLM calls automatically.</p>
          </article>
          <article className="card">
            <p className="card-label">Planned</p>
            <p className="card-value">CrewAI</p>
            <p>Trace agent crews across tasks and tools.</p>
          </article>
          <article className="card">
            <p className="card-label">Planned</p>
            <p className="card-value">OpenAI SDK</p>
            <p>Stream chat completions, token usage, and tool calls.</p>
          </article>
          <article className="card">
            <p className="card-label">Planned</p>
            <p className="card-value">Anthropic</p>
            <p>Stream Claude messages, tokens, and tool calls.</p>
          </article>
        </div>
      </section>

      <section>
        <h2>Tool integrations</h2>
        <p>Spans capture every tool call regardless of provider:</p>
        <ul>
          <li>Payments: Stripe (refunds, charges, holds)</li>
          <li>Messaging: Slack, email</li>
          <li>Vector stores: query, upsert</li>
          <li>Anything your agent calls: generic capture</li>
        </ul>
      </section>

      <section>
        <h2>Need something specific?</h2>
        <p>
          <a className="cta cta-primary" href="/contact">Request an integration</a>
        </p>
      </section>
    </main>
  );
}
