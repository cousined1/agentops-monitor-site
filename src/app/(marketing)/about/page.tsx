import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "AgentOps Monitor is observability for AI agents in production. Find the call that cost you four hundred dollars.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main>
      <section>
        <p className="eyebrow">About</p>
        <h1>Find the call that cost you four hundred dollars.</h1>
        <p className="lede">
          AgentOps Monitor replays every tool call, every LLM decision, and every dollar an agent spends, so an on-call engineer at 2 a.m. can stop guessing and start fixing.
        </p>
        <p>
          <a className="cta cta-primary" href="/features">See features</a>{" "}
          <a className="cta cta-ghost" href="/signup">Start monitoring</a>
        </p>
      </section>

      <section>
        <h2>What we do</h2>
        <p>
          An agent with no budget is an incident waiting to be invoiced. AgentOps Monitor catches that: you see the exact call that cost you, and you see it before the invoice arrives.
        </p>
        <p>We turn every run into a replayable trace with a hard budget cap.</p>
      </section>

      <section>
        <h2>Status</h2>
        <p>
          General availability MVP. Adapters and features ship continuously.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Sales: <a href="/contact">contact</a> or <a href="mailto:support@agentopsmonitor.com">support@agentopsmonitor.com</a>.
        </p>
        <p>Privacy: <a href="mailto:privacy@agentopsmonitor.com">privacy@agentopsmonitor.com</a>.</p>
      </section>
    </main>
  );
}
