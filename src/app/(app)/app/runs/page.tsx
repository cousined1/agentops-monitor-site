import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/insforge";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Runs",
  description: "Every agent run ingested by your SDK.",
  alternates: { canonical: "/app/runs" },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const insforge = await getServerClient();
  // PERF-006: page through runs instead of a hard 100-row cap with no total.
  const [runsResult, countResult] = await Promise.all([
    insforge.database
      .from("runs")
      .select("id,external_id,agent_name,status,started_at,ended_at,duration_ms,tokens_in,tokens_out,cost_usd,span_count")
      .order("started_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    insforge.database.from("runs").select("id", { count: "exact", head: true }),
  ]);
  if (runsResult.error) {
    console.error("[app/runs] list query failed:", runsResult.error.message);
  }
  const runs = runsResult.error ? null : runsResult.data;
  const total = countResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dbError = runsResult.error ? runsResult.error.message : null;

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

      {dbError ? (
        <section>
          <p className="auth-error">Could not load runs from the database.</p>
        </section>
      ) : null}

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
                  <td>{run.started_at ? new Date(run.started_at).toLocaleString() : "-"}</td>
                  <td className="num">{run.duration_ms ?? "-"}</td>
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

      <section>
        <p>
          Page {page} of {totalPages} · {total} run{total === 1 ? "" : "s"} total{" "}
        </p>
        <p>
          {page > 1 ? <Link href={`/app/runs?page=${page - 1}`}>Previous</Link> : <span>Previous</span>}
          {" · "}
          {page < totalPages ? <Link href={`/app/runs?page=${page + 1}`}>Next</Link> : <span>Next</span>}
        </p>
      </section>
    </>
  );
}