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

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const insforge = await getServerClient();
  const { data: run } = await insforge.database
    .from("runs")
    .select("id,external_id,agent_name,status,started_at,ended_at,duration_ms,tokens_in,tokens_out,cost_usd,metadata")
    .eq("id", id)
    .maybeSingle();

  if (!run) notFound();

  const { data: spans } = await insforge.database
    .from("spans")
    .select("id,span_type,provider,model,tool_name,status,started_at,duration_ms,tokens_in,tokens_out,cost_usd,input,output,error")
    .eq("run_id", id)
    .order("started_at", { ascending: true });

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
          <p className="card-value">{spans?.length ?? 0}</p>
        </article>
        <article className="card">
          <p className="card-label">Tokens</p>
          <p className="card-value">{run.tokens_in + run.tokens_out}</p>
        </article>
        <article className="card">
          <p className="card-label">Cost</p>
          <p className="card-value">${run.cost_usd}</p>
        </article>
      </section>

      <section>
        <h2>Spans</h2>
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