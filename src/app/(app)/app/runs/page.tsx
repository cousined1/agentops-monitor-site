import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/insforge";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Runs",
  description: "Every agent run ingested by your SDK.",
  alternates: { canonical: "/app/runs" },
};

export default async function RunsPage() {
  const insforge = await getServerClient();
  const { data: runs } = await insforge.database
    .from("runs")
    .select("id,external_id,agent_name,status,started_at,ended_at,duration_ms,tokens_in,tokens_out,cost_usd,span_count")
    .order("started_at", { ascending: false })
    .limit(100);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app" },
          { label: "Runs" },
        ]}
      />
      <section>
        <h1>Runs</h1>
        <p className="lede">Every agent run ingested by your SDK.</p>
      </section>

      <section>
        {runs && runs.length > 0 ? (
          <table className="ledger">
            <thead>
              <tr>
                <th>Run</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Started</th>
                <th className="num">Duration (ms)</th>
                <th className="num">Spans</th>
                <th className="num">Tokens</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link href={`/app/runs/${run.id}`}>{run.external_id}</Link>
                  </td>
                  <td>{run.agent_name}</td>
                  <td>{run.status}</td>
                  <td>{new Date(run.started_at).toLocaleString()}</td>
                  <td className="num">{run.duration_ms ?? "—"}</td>
                  <td className="num">{run.span_count}</td>
                  <td className="num">{run.tokens_in + run.tokens_out}</td>
                  <td className="num">${run.cost_usd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No runs yet.</p>
        )}
      </section>
    </>
  );
}