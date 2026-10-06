import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@insforge/sdk";
import { z } from "zod";
import { appEnv } from "@/lib/env";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELTA-003 hardening (audit/08-delta-review.md): this endpoint is public by
// design (unauthenticated chat lead capture), so it validates strictly, caps
// payload size, and rate-limits per client IP.
//
// AUDIT-RUN-20260930-202741 / FINDING-api-surface-001 (Critical): the endpoint
// previously logged WITHOUT raw PII and then persisted NOTHING — a one-way
// sha256(email) prefix, a company character count and a transcript byte count,
// followed by {"status":"ok"}. The chatbot promises a 24-hour follow-up, so
// every inbound sales lead was destroyed and, because the hash is one-way, was
// unrecoverable from logs too.
//
// It now WRITES the lead to public.leads using the server-side admin key
// (migrations/20261002004624_create-leads.sql). The console line is kept but
// stays PII-free — it is a correlation breadcrumb, not the record of truth.
// If the write fails we return 503 rather than "ok": telling a visitor their
// details were captured when they were not is the specific defect this fixes,
// so a storage failure must never look like success.
const MAX_BODY_BYTES = 100_000;
const LEAD_RATE_LIMIT_PER_MIN = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LeadSchema = z.object({
  email: z.string().trim().max(254).regex(EMAIL_PATTERN, "Must be a valid email address."),
  company: z.string().trim().max(120).optional(),
  source: z.string().trim().max(64).optional(),
  product: z.string().trim().max(64).optional(),
  timestamp: z.string().max(40).optional(),
  conversation: z.unknown().optional(),
});

const buckets = new Map<string, { count: number; windowStart: number }>();

const MAX_BUCKETS = 20_000;

function allowRequest(key: string): boolean {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (now - v.windowStart >= 60_000) buckets.delete(k);
    }
  }
  // API-004: expired-entry pruning alone still allows unbounded growth within
  // a single window flood; drop the oldest windows once the map is at cap.
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= 60_000) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= LEAD_RATE_LIMIT_PER_MIN;
}

function clientIp(request: NextRequest): string {
  // API-004: X-Forwarded-For is client-spoofable; Cloudflare (the edge in
  // front of Railway) overwrites CF-Connecting-IP with the real client IP,
  // so prefer it and only fall back down the proxy chain.
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

function scrubLogValue(value: string): string {
  // Strip control characters so a crafted field cannot forge log lines.
  return value.replace(/[\x00-\x1F\x7F]+/g, " ").trim();
}

// F-04 (dos-defense): stream the body through a capped reader instead of
// buffering request.text(). A payload past the cap cancels the stream and
// returns null so the caller answers 413 without holding the overrun in
// memory; a mid-stream read failure is rethrown after cancelling so the
// handler cannot silently treat a truncated body as the whole lead.
async function readBody(request: NextRequest | Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: NextRequest) {
  // API-003: reject from the declared length before buffering the body.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return apiError(413, "Lead payload too large.", "payload_too_large");
  }
  const rawBody = await readBody(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return apiError(413, "Lead payload too large.", "payload_too_large");
  }

  if (!allowRequest(clientIp(request))) {
    return apiError(429, "Too many lead submissions; try again shortly.", "rate_limited", {
      headers: { "Retry-After": "60" },
    });
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawBody);
  } catch {
    return apiError(400, "Invalid JSON", "invalid_json");
  }

  const parsed = LeadSchema.safeParse(rawJson);
  if (!parsed.success) {
    return apiError(400, "Invalid lead payload.", "invalid_body");
  }

  const { email, company, source, product, conversation } = parsed.data;
  const emailHash = createHash("sha256").update(email).digest("hex").slice(0, 16);
  const transcriptBytes =
    conversation === undefined ? 0 : Buffer.byteLength(JSON.stringify(conversation) ?? "", "utf8");

  const correlationId = randomUUID();

  // Persist FIRST. Returning "ok" while the lead was dropped is the exact
  // defect this audit found, so a storage failure is surfaced to the caller
  // instead of being swallowed.
  let persisted = false;
  let persistError: string | null = null;
  try {
    const env = appEnv();
    const admin = createAdminClient({
      baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
      apiKey: env.INSFORGE_API_KEY,
    });
    const { error } = await admin.database.from("leads").insert([
      {
        email,
        company: company ?? null,
        source: source ?? null,
        product: product ?? null,
        conversation: conversation ?? null,
      },
    ]);
    if (error) {
      persistError = error.message;
    } else {
      persisted = true;
    }
  } catch (err) {
    persistError = err instanceof Error ? err.message : "unknown persistence error";
  }

  // PII-free breadcrumb: correlation id plus lengths, never the values.
  console.error(
    `[lead ${persisted ? "stored" : "LOST"}] id=${correlationId} emailHash=${emailHash} company=${
      company ? `provided(${scrubLogValue(company).length} chars)` : "absent"
    } source=${scrubLogValue(source ?? "-")} product=${scrubLogValue(product ?? "-")} transcriptBytes=${transcriptBytes}` +
      (persistError ? ` persistError=${scrubLogValue(persistError)}` : ""),
  );

  if (!persisted) {
    // 503 + Retry-After: the visitor's details were NOT captured, so the
    // chatbot should offer to retry rather than repeat the 24-hour promise.
    return apiError(
      503,
      "We could not record your details. Please try again in a moment.",
      "write_failed",
      { headers: { "Retry-After": "30" } },
    );
  }

  return NextResponse.json({ status: "ok", id: correlationId });
}

export async function OPTIONS(request: NextRequest | Request) {
  // Same-origin chatbot needs no CORS; scope any cross-origin preflight to
  // our own origins instead of reflecting a wildcard.
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  const origin = request.headers.get("origin");
  if (origin && /^https:\/\/(www\.)?agentopsmonitor\.com$/.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return new NextResponse(null, { status: 204, headers });
}
