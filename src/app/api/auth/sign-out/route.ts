import { NextResponse } from "next/server";
import { getAuthActions } from "@/lib/insforge";

export async function POST() {
  const auth = await getAuthActions();
  await auth.signOut();
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"));
}