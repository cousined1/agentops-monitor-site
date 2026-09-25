import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs",
  description: "Install the SDK, generate an API key, and start ingesting runs.",
  alternates: { canonical: "/docs" },
};

export default function DocsPage() {
  return (
    <main>
      <section>
        <p className="eyebrow">Docs</p>
        <h1>Install the SDK. Generate a key. Start ingesting.</h1>
        <p className="lede">Three lines to your first trace.</p>
      </section>

      <section>
        <h2>1. Install</h2>
        <pre className="install"><code>pip install agentops-monitor</code></pre>
        <p>
          Planned adapters: LangChain, CrewAI, OpenAI, Anthropic. See <a href="/integrations">integrations</a>.
        </p>
      </section>

      <section>
        <h2>2. Generate an API key</h2>
        <p>
          Create an account, then go to <a href="/app/api-keys">API keys</a> to mint one. The full key value is shown only at creation and never again.
        </p>
      </section>

      <section>
        <h2>3. Initialize</h2>
        <pre className="install"><code>from agentops_monitor import monitor
monitor.init(api_key="aom_...", budget_usd=50)</code></pre>
        <p>
          The SDK captures tool calls, LLM calls, and tokens automatically once initialized.
        </p>
      </section>

      <section>
        <h2>View in the dashboard</h2>
        <p>
          Open the <a href="/app">dashboard</a> to see recent runs, spans, and cost. Click any run to inspect the trace.
        </p>
      </section>

      <section>
        <h2>Set budget caps</h2>
        <p>
          Hard caps stop a run at the limit you set. See <a href="/features">features</a> for the policy example.
        </p>
      </section>

      <section>
        <p className="eyebrow">SDK note</p>
        <p>
          Package name and adapter compatibility are verified against supported framework versions.
        </p>
      </section>
    </main>
  );
}
