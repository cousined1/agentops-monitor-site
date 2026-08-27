import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Trace, cost, cap, audit, ingest, and overview. Every feature answers one question: what did the agent do, and what did it cost.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <main>
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
          Every run becomes a replayable timeline — model output, tool calls, latencies, errors. Click any span to see the prompt, the model output, and what the agent changed in the world.
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
        <h2>Cap the spend with hard budget limits</h2>
        <p>
          Set caps at the workflow, the agent, or the user. A run stops at the limit you set — not at the limit your CFO finds out about.
        </p>
        <pre className="install"><code>refund.cap_per_run_usd: 50
require_approval_above: 250
stripe.refunds.create: hold_above_usd: 100
loop.max_retries: 3
halt_after_seconds: 60</code></pre>
      </section>

      <section>
        <h2>Audit every decision</h2>
        <p>
          The audit trail captures prompt hashes, model output, tool calls, human approvals, and policy decisions. SOC 2 / HIPAA / GDPR badges are not claimed on this page. The audit trail is the product.
        </p>
      </section>

      <section>
        <h2>Ingest from any framework</h2>
        <p>
          The SDK ships ingestion for the frameworks you already run. Planned adapters: LangChain, CrewAI, OpenAI SDK, Anthropic.
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
    </main>
  );
}
