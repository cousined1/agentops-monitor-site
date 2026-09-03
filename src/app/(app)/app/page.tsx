import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/insforge";
import { SignupCompletedTracker } from "@/components/signup-completed-tracker";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "A live view of what your agents are doing right now.",
  alternates: { canonical: "/app" },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const insforge = await getServerClient();
  const { data: runs } = await insforge.database
    .from("runs")
    .select("id,external_id,agent_name,status,started_at,tokens_in,tokens_out,cost_usd")
    .order("started_at", { ascending: false })
    .limit(10);

  const { data: keys } = await insforge.database
    .from("api_keys")
    .select("id,name,is_active,last_used_at,created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const { count: totalRuns } = await insforge.database
    .from("runs")
    .select("id", { count: "exact", head: true });

  const { count: totalKeys } = await insforge.database
    .from("api_keys")
    .select("id", { count: "exact", head: true });

  return (
    <>
      <SignupCompletedTracker />
      <section>
        <h1>Dashboard</h1>
        <p className="lede">A live view of what your agents are doing right now.</p>
      </section>

      <section className="cards">
        <article className="card">
          <p className="card-label">Total runs</p>
          <p className="card-value">{totalRuns ?? 0}</p>
        </article>
        <article className="card">
          <p className="card-label">Active API keys</p>
          <p className="card-value">{totalKeys ?? 0}</p>
        </article>
      </section>

      <section>
        <h2>Recent runs</h2>
        {runs && runs.length > 0 ? (
          <table className="ledger">
            <thead>
              <tr>
                <th>Run</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Started</th>
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
                  <td>{run.started_at ? new Date(run.started_at).toLocaleString() : "-"}</td>
                  <td className="num">
                    {run.tokens_in + run.tokens_out}
                  </td>
                  <td className="num">${run.cost_usd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No runs yet. <Link href="/app/api-keys">Generate an API key</Link> to start ingesting.</p>
        )}
      </section>

      <section>
        <h2>API keys</h2>
        {keys && keys.length > 0 ? (
          <table className="ledger">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last used</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td>{key.is_active ? "active" : "disabled"}</td>
                  <td>{new Date(key.created_at).toLocaleString()}</td>
                  <td>
                    {key.last_used_at
                      ? new Date(key.last_used_at).toLocaleString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No keys yet. Visit <Link href="/app/api-keys">API keys</Link> to create one.</p>
        )}
      </section>
    </>
  );
}