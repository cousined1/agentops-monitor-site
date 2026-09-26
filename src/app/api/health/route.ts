import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HEADERS = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json",
} as const;

export function GET() {
  const sha =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_SHA ??
    "local";

  return NextResponse.json(
    {
      status: "ok",
      sha,
      ts: new Date().toISOString(),
    },
    {
      status: 200,
      headers: HEADERS,
    },
  );
}

export function HEAD() {
  return new Response(null, {
    status: 200,
    headers: HEADERS,
  });
}
