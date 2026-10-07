import { type NextRequest, NextResponse } from "next/server";
import { getAuthActions } from "@/lib/insforge";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await getAuthActions();
  await auth.signOut();
  return NextResponse.redirect(new URL("/login", request.nextUrl), 303);
}
