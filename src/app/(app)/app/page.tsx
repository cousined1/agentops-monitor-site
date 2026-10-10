import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/insforge";
import { SignupCompletedTracker } from "@/components/signup-completed-tracker";
import { formatDate, formatTokens, formatUsd } from "@/lib/format";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "A live view of what your agents are doing right now.",
  alternates: { canonical: "/app" },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const insforge = await getServerClient();
  // PERF-002: these four reads are independent — issue them concurrently
  // instead of stacking five serial round trips with the layout's user check.
  let runs: Awaited<ReturnType<typeof loadDashboard>>["runs"] | null = null;
  let keys: Awaited<ReturnType<typeof loadDashboard>>["keys"] | null = null;
  let totalRuns: number | null = null;
  let totalKeys: number | null = null;
  let dbError: string | null = null;
  try {
    const result = await loadDashboard(insforge);
    runs = result.runs;
    keys = result.keys;
    totalRuns = result.totalRuns;
    totalKeys = result.totalKeys;
  } catch (error) {
    // REL-006/REL-007: an outage must look like an outage, not "no data".
    dbError = error instanceof Error ? error.message : "Database request failed.";
    console.error("[app/dashboard] InsForge query failed:", dbError);
  }

  return (
    <>
      <SignupCompletedTracker />
      {dbError ? (
        <section>
          <p className="auth-error">
            The dashboard could not reach the database. Data shown below may be stale.
          </p>
        </section>
      ) : null}
      <section>
        <h1>Dashboard</h1>
        <p className="lede">A live view of what your agents are doing right now.</p>
      </section>

      <section className="cards">
        <article className="card">
          <p className="card-label">Total runs</p>
          <p className="card-value">{totalRuns ?? "—"}</p>
        </article>
        <article className="card">
          <p className="card-label">Active API keys</p>
          <p className="card-value">{totalKeys ?? "—"}</p>
        </article>
      </section>

      <section>
        <h2>Recent runs</h2>
        {runs === null ? null : runs.length > 0 ? (
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
                  <td>{formatDate(run.started_at)}</td>
                  <td className="num">
                    {formatTokens(run.tokens_in, run.tokens_out)}
                  </td>
                  <td className="num">{formatUsd(run.cost_usd)}</td>
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
        {keys === null ? null : keys.length > 0 ? (
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

type InsforgeClient = Awaited<ReturnType<typeof getServerClient>>;

async function loadDashboard(insforge: InsforgeClient) {
  // PERF-002: fire the four independent reads concurrently.
  const [runs, keys, totalRuns, totalKeys] = await Promise.all([
    insforge.database
      .from("runs")
      .select("id,external_id,agent_name,status,started_at,tokens_in,tokens_out,cost_usd")
      .order("started_at", { ascending: false })
      .limit(10),
    insforge.database
      .from("api_keys")
      .select("id,name,is_active,last_used_at,created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    insforge.database.from("runs").select("id", { count: "exact", head: true }),
    insforge.database.from("api_keys").select("id", { count: "exact", head: true }),
  ]);
  if (runs.error) throw new Error(runs.error.message);
  if (keys.error) throw new Error(keys.error.message);
  return {
    runs: runs.data,
    keys: keys.data,
    totalRuns: totalRuns.count,
    totalKeys: totalKeys.count,
  };
}