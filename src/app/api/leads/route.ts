import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELTA-003 hardening (audit/08-delta-review.md): this endpoint is public by
// design (unauthenticated chat lead capture), so it validates strictly, caps
// payload size, rate-limits per client IP, and logs WITHOUT raw PII — the
// email is reduced to a short salt-free hash for correlation, the company
// name is reduced to a length, and the transcript is reduced to a byte count.
const MAX_BODY_BYTES = 16_000;
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
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

export async function POST(request: NextRequest) {
  // API-003: reject from the declared length before buffering the body.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Lead payload too large." }, { status: 413 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Lead payload too large." }, { status: 413 });
  }

  if (!allowRequest(clientIp(request))) {
    return NextResponse.json(
      { error: "Too many lead submissions; try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = LeadSchema.safeParse(rawJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lead payload." }, { status: 400 });
  }

  const { email, company, source, product, conversation } = parsed.data;
  const emailHash = createHash("sha256").update(email).digest("hex").slice(0, 16);
  const transcriptBytes =
    conversation === undefined ? 0 : Buffer.byteLength(JSON.stringify(conversation) ?? "", "utf8");

  console.log(
    `[lead received] id=${randomUUID()} emailHash=${emailHash} company=${
      company ? `provided(${scrubLogValue(company).length} chars)` : "absent"
    } source=${scrubLogValue(source ?? "-")} product=${scrubLogValue(product ?? "-")} transcriptBytes=${transcriptBytes}`,
  );

  return NextResponse.json({ status: "ok" });
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
