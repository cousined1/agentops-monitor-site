import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs",
  description: "Generate an API key and post your first agent trace over HTTPS.",
  alternates: { canonical: "/docs" },
};

const PYTHON_QUICKSTART = `import requests

response = requests.post(
    "https://agentopsmonitor.com/api/ingest",
    headers={"Authorization": "Bearer aom_live_..."},
    json={
        "external_id": "run-001",
        "agent_name": "refund-triage",
        "status": "completed",
        "spans": [
            {"span_type": "llm", "provider": "openai", "model": "gpt-4o",
             "tool_name": "openai.chat", "tokens_in": 8204, "tokens_out": 512,
             "cost_usd": 0.08, "duration_ms": 600},
        ],
    },
)
print(response.status_code, response.json())`;

export default function DocsPage() {
  return (
    <main>
      <section>
        <p className="eyebrow">Docs</p>
        <h1>Generate a key. Post a trace. See it live.</h1>
        <p className="lede">
          Ingestion is a plain HTTPS endpoint. No package install, no agent to run.
        </p>
      </section>

      <section>
        <h2>1. Generate an API key</h2>
        <p>
          Create an account, then go to <a href="/app/api-keys">API keys</a> to mint one. Keys
          start with <code>aom_live_</code>. The full key value is shown only at creation and never
          again.
        </p>
      </section>

      <section>
        <h2>2. Post a trace</h2>
        <p>
          Send your run as JSON to <code>POST /api/ingest</code> with your key in the{" "}
          <code>Authorization</code> header. Python with <code>requests</code>:
        </p>
        <pre className="install"><code>{PYTHON_QUICKSTART}</code></pre>
        <p>
          The same call works with <code>urllib</code>, <code>curl</code>, or any HTTP client. A
          200 response returns the stored <code>run_id</code> and <code>span_count</code>.
        </p>
      </section>

      <section>
        <h2>3. Handle errors</h2>
        <p>
          Missing or invalid key: 401. Malformed JSON or schema violations: 400. Body over 1 MB:
          413. Rate limit exceeded: 429.
        </p>
      </section>

      <section>
        <h2>View in the dashboard</h2>
        <p>
          Open the <a href="/app">dashboard</a> to see recent runs, spans, and cost. Click any run
          to inspect the trace.
        </p>
      </section>

      <section>
        <h2>Set budget caps</h2>
        <p>
          Hard caps stop a run at the limit you set. See <a href="/features">features</a> for the
          policy example.
        </p>
      </section>
    </main>
  );
}
