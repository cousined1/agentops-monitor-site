import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    sha:
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GIT_SHA ??
      "local",
    ts: new Date().toISOString(),
  });
}
