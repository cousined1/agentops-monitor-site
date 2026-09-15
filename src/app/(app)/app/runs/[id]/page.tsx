import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/insforge";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Run ${id}`,
    alternates: { canonical: `/app/runs/${id}` },
  };
}

const MAX_SPANS_RENDERED = 500;

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const insforge = await getServerClient();
  // PERF-R02: run + spans are independent reads — fetch concurrently.
  const [runResult, spansResult] = await Promise.all([
    insforge.database
      .from("runs")
      .select("id,external_id,agent_name,status,started_at,ended_at,duration_ms,tokens_in,tokens_out,cost_usd,span_count")
      .eq("id", id)
      .maybeSingle(),
    // PERF-001: never fetch all spans with heavy payload columns; the trace
    // UI renders a bounded window of the summary columns only.
    insforge.database
      .from("spans")
      .select("id,span_type,provider,model,tool_name,status,started_at,duration_ms,cost_usd")
      .eq("run_id", id)
      .order("started_at", { ascending: true })
      .limit(MAX_SPANS_RENDERED),
  ]);

  const run = runResult.data;
  const spans = spansResult.data;
  const spansTruncated = spans !== null && spans.length === MAX_SPANS_RENDERED;

  if (!run) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app" },
          { label: "Runs", href: "/app/runs" },
          { label: run.external_id },
        ]}
      />
      <section>
        <h1>Run {run.external_id}</h1>
        <p className="lede">
          {run.agent_name} · {run.status} · {new Date(run.started_at).toLocaleString()}
        </p>
      </section>

      <section className="cards">
        <article className="card">
          <p className="card-label">Duration</p>
          <p className="card-value">{run.duration_ms ?? "-"} ms</p>
        </article>
        <article className="card">
          <p className="card-label">Spans</p>
          <p className="card-value">{run.span_count ?? spans?.length ?? 0}</p>
        </article>
        <article className="card">
          <p className="card-label">Tokens</p>
          <p className="card-value">{(run.tokens_in ?? 0) + (run.tokens_out ?? 0)}</p>
        </article>
        <article className="card">
          <p className="card-label">Cost</p>
          <p className="card-value">${run.cost_usd}</p>
        </article>
      </section>

      <section>
        <h2>Spans</h2>
        {spansTruncated ? (
          <p className="lede">
            Showing the first {MAX_SPANS_RENDERED} spans of {run.span_count ?? "many"}.
          </p>
        ) : null}
        {spans && spans.length > 0 ? (
          <ol className="trace-spans">
            {spans.map((span) => (
              <li key={span.id} className="span">
                <span className="time">{span.started_at ? new Date(span.started_at).toLocaleTimeString() : "-"}</span>
                <span className="agent">{span.span_type}</span>
                <span className="tool">
                  {span.tool_name ?? span.model ?? span.provider ?? "-"} ·{" "}
                  {span.status} ·{" "}
                  {span.duration_ms ?? "-"} ms ·{" "}
                  ${span.cost_usd}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>No spans recorded.</p>
        )}
      </section>
    </>
  );
}