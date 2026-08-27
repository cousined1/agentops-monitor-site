import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@insforge/sdk";
import { appEnv } from "@/lib/env";
import { hashApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SpanSchema = z.object({
  id: z.string().min(1).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  span_type: z.enum(["llm", "tool", "workflow"]),
  provider: z.string().max(64).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  tool_name: z.string().max(160).nullable().optional(),
  status: z
    .enum(["ok", "error", "held", "blocked", "retried"])
    .default("ok"),
  started_at: z.string().datetime().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  tokens_in: z.number().int().nonnegative().default(0),
  tokens_out: z.number().int().nonnegative().default(0),
  cost_usd: z.number().nonnegative().default(0),
  input: z.object({}).passthrough().default({}),
  output: z.object({}).passthrough().default({}),
  error: z.object({}).passthrough().nullable().optional(),
  metadata: z.object({}).passthrough().default({}),
});

const IngestSchema = z.object({
  external_id: z.string().min(1).max(120),
  agent_name: z.string().min(1).max(120),
  status: z
    .enum(["running", "completed", "failed"])
    .default("completed"),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().nullable().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  tokens_in: z.number().int().nonnegative().default(0),
  tokens_out: z.number().int().nonnegative().default(0),
  cost_usd: z.number().nonnegative().default(0),
  metadata: z.object({}).passthrough().default({}),
  spans: z.array(SpanSchema).default([]),
});

function error(status: number, message: string, code: string) {
  return NextResponse.json({ error: { message, code } }, { status });
}

export async function POST(request: NextRequest) {
  const env = appEnv();

  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return error(401, "Missing or invalid Authorization header.", "missing_bearer");
  }
  const rawKey = match[1].trim();
  const hash = hashApiKey(rawKey);

  const admin = createAdminClient({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    apiKey: env.INSFORGE_API_KEY,
  });

  const { data: keyRow, error: keyError } = await admin.database
    .from("api_keys")
    .select("id,user_id,is_active")
    .eq("key_hash", hash)
    .maybeSingle() as { data: { id: string; user_id: string; is_active: boolean } | null; error: { message: string } | null };

  if (keyError) return error(500, keyError.message, "key_lookup_failed");
  if (!keyRow || keyRow.is_active === false) {
    return error(401, "Unknown or disabled API key.", "invalid_api_key");
  }

  let payload: z.infer<typeof IngestSchema>;
  try {
    payload = IngestSchema.parse(await request.json());
  } catch (parseError) {
    return error(400, (parseError as Error).message, "invalid_payload");
  }

  const { data: upserted, error: runError } = await admin.database
    .from("runs")
    .upsert(
      [
        {
          user_id: keyRow.user_id,
          api_key_id: keyRow.id,
          external_id: payload.external_id,
          agent_name: payload.agent_name,
          status: payload.status,
          started_at: payload.started_at,
          ended_at: payload.ended_at,
          duration_ms: payload.duration_ms,
          tokens_in: payload.tokens_in,
          tokens_out: payload.tokens_out,
          cost_usd: payload.cost_usd,
          span_count: payload.spans.length,
          metadata: payload.metadata,
        },
      ],
      { onConflict: "user_id,external_id" },
    )
    .select("id")
    .single();

  if (runError || !upserted) {
    return error(500, runError?.message ?? "Run upsert failed.", "run_upsert_failed");
  }

  if (payload.spans.length > 0) {
    const { error: spansError } = await admin.database.from("spans").insert(
      payload.spans.map((span) => ({
        run_id: upserted.id,
        parent_id: span.parent_id ?? null,
        span_type: span.span_type,
        provider: span.provider ?? null,
        model: span.model ?? null,
        tool_name: span.tool_name ?? null,
        status: span.status,
        started_at: span.started_at,
        duration_ms: span.duration_ms ?? null,
        tokens_in: span.tokens_in,
        tokens_out: span.tokens_out,
        cost_usd: span.cost_usd,
        input: span.input,
        output: span.output,
        error: span.error ?? null,
        metadata: span.metadata,
      })),
    );
    if (spansError) return error(500, spansError.message, "span_insert_failed");
  }

  const { error: usageError } = await admin.database.from("usage_events").insert({
    user_id: keyRow.user_id,
    run_id: upserted.id,
  });
  if (usageError) return error(500, usageError.message, "usage_insert_failed");

  await admin.database
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  return NextResponse.json({
    ok: true,
    run_id: upserted.id,
    span_count: payload.spans.length,
  });
}