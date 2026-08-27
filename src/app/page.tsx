import type { Metadata } from "next";
import { getServerClient } from "@/lib/insforge";

export const metadata: Metadata = {
  title: "Find the call that cost you four hundred dollars",
  description:
    "AgentOps Monitor replays every tool call, every LLM decision, every dollar an agent spends, so an on-call engineer at 2 a.m. can stop guessing and start fixing.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  let recentRuns: number | null = null;
  try {
    const insforge = await getServerClient();
    const { count } = await insforge.database
      .from("runs")
      .select("id", { count: "exact", head: true });
    recentRuns = count ?? 0;
  } catch {
    recentRuns = null;
  }

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">02:14:11Z · run r_9f2c1a4e · agent refund-triage-v3</p>
            <h1>Find the call that cost you four hundred dollars.</h1>
            <p className="lede">
              AgentOps Monitor replays every tool call, every LLM decision, every dollar an agent spends, so an on-call engineer at 2 a.m. can stop guessing and start fixing.
            </p>
            <p>
              <a className="cta cta-primary" href="/signup">Start monitoring</a>{" "}
              <a className="cta cta-ghost" href="/login">Sign in</a>
            </p>
            <p className="hero-meta">
              Already have a key? Generate or paste it on the <a href="/app/api-keys">API keys</a> page.
            </p>
            {recentRuns !== null ? (
              <p className="hero-meta">{recentRuns} runs ingested so far.</p>
            ) : null}
          </div>
        </div>
      </section>

      <section id="trace">
        <h2>Replay every tool call and LLM decision</h2>
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
        <p>
          <a className="cta cta-primary" href="/features">See features</a>{" "}
          <a className="cta cta-ghost" href="/signup">Start tracing</a>
        </p>
      </section>

      <section id="cost">
        <h2>Track every dollar an agent spends</h2>
        <p>
          Tokens in and out, USD per span, total per run. Catch the agent that loops 64K tokens before it invoices you. Set a hard budget cap at the workflow, the agent, or the user — the run stops at the limit you set.
        </p>
        <p>
          <a className="cta cta-primary" href="/pricing">See pricing</a>{" "}
          <a className="cta cta-ghost" href="/signup">Set a budget cap</a>
        </p>
      </section>

      <section id="install">
        <h2>Install the SDK</h2>
        <pre className="install"><code>pip install agentops-monitor
agentops_monitor.init(api_key="aom_live_...")</code></pre>
        <p>
          The SDK ships ingestion for LangChain, CrewAI, OpenAI, and Anthropic. Capture every tool call and LLM decision and stream it to your dashboard.
        </p>
        <p>
          <a className="cta cta-primary" href="/docs">Read the docs</a>{" "}
          <a className="cta cta-ghost" href="/integrations">See integrations</a>
        </p>
      </section>

      <section id="pricing">
        <h2>Pricing</h2>
        <p>Free up to 10,000 runs a month. Team is $299 with 500,000 runs. Enterprise starts at $2,000.</p>
        <p>
          <a className="cta cta-primary" href="/pricing">See full pricing</a>{" "}
          <a className="cta cta-ghost" href="/signup">Start free</a>
        </p>
      </section>
    </>
  );
}
