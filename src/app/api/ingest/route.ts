import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@insforge/sdk";
import { appEnv } from "@/lib/env";
import { hashApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SpanSchema = z.object({
  id: z.string().uuid().optional(),
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
  spans: z.array(SpanSchema).max(1000).default([]),
});

const IngestResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    run_id: z.string().uuid(),
    span_count: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    code: z.enum(["invalid_api_key", "rate_limited"]),
    message: z.string(),
  }),
]);

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

  let payload: z.infer<typeof IngestSchema>;
  try {
    payload = IngestSchema.parse(await request.json());
  } catch (parseError) {
    const message =
      parseError instanceof Error ? parseError.message : "Invalid request payload.";
    return error(400, message, "invalid_payload");
  }

  const { data: rpcData, error: rpcError } = await admin.database.rpc(
    "ingest_agent_run",
    {
      p_key_hash: hash,
      p_payload: payload,
      p_rate_limit: env.INGEST_RATE_LIMIT_PER_MIN,
    },
  );
  if (rpcError) {
    return error(500, rpcError.message, "ingest_transaction_failed");
  }

  const result = IngestResultSchema.safeParse(rpcData);
  if (!result.success) {
    return error(500, "Ingest transaction returned an invalid result.", "invalid_ingest_result");
  }
  if (!result.data.ok) {
    const status = result.data.code === "rate_limited" ? 429 : 401;
    return error(status, result.data.message, result.data.code);
  }

  return NextResponse.json({
    ok: true,
    run_id: result.data.run_id,
    span_count: result.data.span_count,
  });
}
