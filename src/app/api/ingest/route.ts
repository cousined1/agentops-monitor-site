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
  // Bounds match the SQL column types (API-002): duration_ms is int4, cost is
  // numeric(12,4). Without these caps a valid key can trigger a raw Postgres
  // overflow error through the RPC.
  duration_ms: z.number().int().nonnegative().nullable().optional().refine((v) => v === null || v === undefined || v <= 2_147_483_647, "duration_ms too large"),
  tokens_in: z.number().int().nonnegative().max(1_000_000_000_000).default(0),
  tokens_out: z.number().int().nonnegative().max(1_000_000_000_000).default(0),
  cost_usd: z.number().nonnegative().max(9_999_999_999).default(0),
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
  duration_ms: z.number().int().nonnegative().nullable().optional().refine((v) => v === null || v === undefined || v <= 2_147_483_647, "duration_ms too large"),
  tokens_in: z.number().int().nonnegative().max(1_000_000_000_000).default(0),
  tokens_out: z.number().int().nonnegative().max(1_000_000_000_000).default(0),
  cost_usd: z.number().nonnegative().max(9_999_999_999).default(0),
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

// P0 hardening (API-B-01/PERF-003): bound ingest payload sizes.
// App Router route handlers have no default body limit, so the limit is ours.
const MAX_BODY_BYTES = 1_000_000;   // 1 MB total request body
const MAX_SPAN_JSON_BYTES = 65_536; // 64 KB per span across input+output+error+metadata
const MAX_RUN_JSON_BYTES = 65_536;  // 64 KB for run-level metadata

function jsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return Number.MAX_SAFE_INTEGER; // unserializable => treat as oversized
  }
}
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

  // API-003: reject oversized uploads from Content-Length before buffering.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return error(413, "Request body exceeds the size limit.", "payload_too_large");
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return error(413, "Request body exceeds the size limit.", "payload_too_large");
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawBody);
  } catch {
    return error(400, "Request body is not valid JSON.", "invalid_json");
  }

  let payload: z.infer<typeof IngestSchema>;
  try {
    payload = IngestSchema.parse(rawJson);
  } catch (parseError) {
    // API-R01: the zod issue list leaks the schema shape; keep details in logs.
    console.error(
      "[ingest] payload validation failed:",
      parseError instanceof Error ? parseError.message : parseError,
    );
    return error(400, "Invalid request payload.", "invalid_payload");
  }

  if (jsonBytes(payload.metadata) > MAX_RUN_JSON_BYTES) {
    return error(413, "Run metadata exceeds the size limit.", "payload_too_large");
  }
  const oversizedSpan = payload.spans.some(
    (span) =>
      jsonBytes(span.input) +
        jsonBytes(span.output) +
        jsonBytes(span.error ?? {}) +
        jsonBytes(span.metadata) >
      MAX_SPAN_JSON_BYTES,
  );
  if (oversizedSpan) {
    return error(413, "Span payload exceeds the size limit.", "payload_too_large");
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
    // API-002/AUTHN-R01: raw Postgres error text must not reach the client.
    console.error("[ingest] RPC failed:", rpcError.message);
    return error(500, "Ingest failed. Please retry.", "ingest_transaction_failed");
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
