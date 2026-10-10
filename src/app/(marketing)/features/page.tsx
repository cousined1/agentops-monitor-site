import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Trace, cost, cap, audit, ingest, and overview. Every feature answers one question: what did the agent do, and what did it cost.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <main id="main" tabIndex={-1}>
      <section>
        <p className="eyebrow">Product</p>
        <h1>Six things AgentOps Monitor does for your agents.</h1>
        <p className="lede">
          Trace, cost, cap, audit, ingest, and overview. Every feature exists to answer one question: what did the agent do, and what did it cost.
        </p>
        <p>
          <a className="cta cta-primary" href="/signup">Start monitoring</a>{" "}
          <a className="cta cta-ghost" href="/pricing">See pricing</a>
        </p>
      </section>

      <section>
        <h2>Trace every tool call and LLM decision</h2>
        <p>
          Every run becomes a replayable timeline: model output, tool calls, latencies, errors. Click any span to see the prompt, the model output, and what the agent changed in the world.
        </p>
        <pre className="install"><code>+0 ms      refund-triage-v3 start
+12 ms     llm openai.chat        8,204 tok
+612 ms    tool vectorstore.query
+820 ms    tool stripe.refunds.create  HELD
+5,402 ms  tool retries × 3
+11,008 ms llm openai.chat        64,118 tok
+18,402 ms tool slack.postMessage
+48,219 ms end · budget exceeded</code></pre>
      </section>

      <section>
        <h2>Track every dollar an agent spends</h2>
        <p>
          Tokens in and out, USD per span, total per run. The dashboard surfaces the runs that cost the most so on-call sees the bill before the invoice arrives.
        </p>
      </section>

      <section>
        <h2>Every span, with the cost attached</h2>
        <p>
          Each span records its model, provider, tool name, status, duration, USD
          cost, and the raw input and output your agent reported. The dashboard
          ranks the runs that cost the most, so an expensive loop is visible while
          it is still running rather than on an invoice.
        </p>
        <pre className="install"><code>GET /api/ingest
  run   → agent_name, status, tokens_in/out, cost_usd
  span  → model, tool_name, status, duration_ms, cost_usd, input, output</code></pre>
      </section>

      <section>
        <h2>Audit every decision</h2>
        <p>
          The trace keeps what actually ran: the model and provider behind each
          call, which tool was invoked, the input and output payloads, and the
          cost and duration of every span. Human approval workflows and policy
          decisions are not captured yet - they are on the roadmap below. SOC 2 /
          HIPAA / GDPR badges are not claimed on this page.
        </p>
      </section>

      <section>
        <h2>Ingest from any framework</h2>
        <p>
          Send traces from any framework with a plain HTTP POST to /api/ingest. First-party adapters are not shipped yet.
        </p>
        <p>
          <a className="cta cta-ghost" href="/integrations">See integrations</a>
        </p>
      </section>

      <section>
        <h2>See your fleet at a glance</h2>
        <p>
          Total runs, active keys, recent runs with spans, cost, and status. One dashboard for the whole agent fleet.
        </p>
        <p>
          <a className="cta cta-primary" href="/signup">Start free</a>
        </p>
      </section>

      <section>
        <h2>Planned / Roadmap</h2>
        <p>
          These capabilities are planned and are not built yet. They are listed here so the roadmap is public, not implied.
        </p>
        <ul>
          <li>Spend caps and automated budget enforcement: halt a run when it crosses a limit you set, per workflow, agent, or user. Today the product records the cost your agent reports at ingest and does not stop a run or refuse a spend.</li>
          <li>Human approval workflows and policy decisions in the audit trail, so a run that needs sign-off records that sign-off.</li>
          <li>Multi-region SSO: SAML and OIDC sign-in across regions for enterprise fleets.</li>
          <li>Framework adapters for LangChain, CrewAI, the OpenAI SDK, and the Anthropic SDK, so ingestion is one import instead of one HTTP call.</li>
        </ul>
      </section>
    </main>
  );
}
