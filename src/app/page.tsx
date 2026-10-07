import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/insforge";

export const metadata: Metadata = {
  title: "Find the call that cost you four hundred dollars",
  description:
    "AgentOps Monitor replays every tool call, every LLM decision, every dollar an agent spends, so an on-call engineer at 2 a.m. can stop guessing and start fixing.",
  alternates: { canonical: "/" },
};

const CURL_QUICKSTART = `curl -X POST https://agentopsmonitor.com/api/ingest \\
  -H "Authorization: Bearer aom_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"external_id":"run-001","agent_name":"refund-triage","spans":[{"span_type":"llm","provider":"openai","model":"gpt-4o","tokens_in":8204,"tokens_out":512,"cost_usd":0.08,"duration_ms":600}]}'`;

const traceLines = [
  { t: "+0 ms", kind: "start", text: "refund-triage-v3 start" },
  { t: "+12 ms", kind: "llm", text: "llm openai.chat        8,204 tok" },
  { t: "+612 ms", kind: "tool", text: "tool vectorstore.query" },
  { t: "+820 ms", kind: "hold", text: "tool stripe.refunds.create  HELD" },
  { t: "+5,402 ms", kind: "warn", text: "tool retries × 3" },
  { t: "+11,008 ms", kind: "llm", text: "llm openai.chat        64,118 tok" },
  { t: "+18,402 ms", kind: "tool", text: "tool slack.postMessage" },
  { t: "+48,219 ms", kind: "fail", text: "end · budget exceeded" },
];

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
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/">
            <span aria-hidden="true">▲</span>
            <span>AgentOps Monitor</span>
          </Link>
          <nav className="nav" aria-label="Primary">
            <Link href="/features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/login">Sign in</Link>
            <Link className="nav-cta" href="/signup">Start monitoring</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-grid">
            <div>
              <p className="eyebrow">Live from your fleet</p>
              <h1>Find the call that cost you four hundred dollars.</h1>
              <p className="lede">
                AgentOps Monitor replays every tool call, every LLM decision, every dollar an agent spends, so an on-call engineer at 2 a.m. can stop guessing and start fixing.
              </p>
              <p className="hero-actions">
                <a className="cta cta-primary" href="/signup">Start monitoring</a>{" "}
                <a className="cta cta-ghost" href="/login">Sign in</a>
              </p>
              <p className="hero-meta">
                Already have a key? Generate or paste it on the <a href="/app/api-keys">API keys</a> page.
              </p>
              {recentRuns !== null ? (
                <p className="hero-meta">{recentRuns.toLocaleString()} runs ingested so far.</p>
              ) : null}
            </div>
            <div className="trace-card" aria-label="Example agent run trace">
              <div className="trace-card-head">
                <span className="dot" />
                <span>02:14:11Z · run r_9f2c1a4e · refund-triage-v3</span>
              </div>
              <pre className="trace-body"><code>{traceLines.map((l) => (
                <span key={l.t + l.text} className={`trace-line trace-${l.kind}`}>
                  {`${l.t.padEnd(10)} ${l.text}\n`}
                </span>
              ))}</code></pre>
            </div>
          </div>
        </section>

        <section id="features">
          <p className="eyebrow">Why AgentOps Monitor</p>
          <h2 className="section-title">Observability built for agents, not requests.</h2>
          <div className="feature-grid">
            <article className="feature-card" id="trace">
              <h3>Replay every decision</h3>
              <p>
                Every run becomes a replayable timeline: model output, tool calls, latencies, errors. Click any span to see the prompt, the model output, and what the agent changed in the world.
              </p>
              <p>
                <a href="/features">See features →</a>
              </p>
            </article>
            <article className="feature-card" id="cost">
              <h3>Track every dollar</h3>
              <p>
                Tokens in and out, USD per span, total per run. Catch the agent that loops 64K tokens before it invoices you. Set a hard budget cap at the workflow, the agent, or the user.
              </p>
              <p>
                <a href="/pricing">See pricing →</a>
              </p>
            </article>
            <article className="feature-card" id="install">
              <h3>Send your first trace</h3>
              <pre className="install"><code>{CURL_QUICKSTART}</code></pre>
              <p>
                A plain HTTPS endpoint — Python, Node, curl, or any framework adapter.
              </p>
              <p>
                <a href="/docs">Read the docs →</a>
              </p>
            </article>
          </div>
        </section>

        <section id="pricing">
          <div className="pricing-band">
            <div>
              <p className="eyebrow">Pricing</p>
              <h2 className="section-title">Free to start. Hard caps included.</h2>
              <p className="lede">Free up to 10,000 runs a month. Team is $299 with 500,000 runs. Enterprise starts at $2,000.</p>
            </div>
            <p className="hero-actions">
              <a className="cta cta-primary" href="/signup">Start free</a>{" "}
              <a className="cta cta-ghost" href="/pricing">Full pricing</a>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
