import { type NextRequest, NextResponse } from "next/server";
import { getAuthActions } from "@/lib/insforge";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Sign-out must never leave the customer on an error page. A throw from
  // signOut() used to escape the handler and render an unstructured Next 500
  // instead of the redirect, so clicking "Sign out" could crash the page. Log
  // the cause and complete the redirect the user asked for.
  try {
    const auth = await getAuthActions();
    await auth.signOut();
  } catch (error) {
    console.error(
      "[sign-out] signOut failed; redirecting anyway:",
      error instanceof Error ? error.message : error,
    );
  }
  return NextResponse.redirect(new URL("/login", request.nextUrl), 303);
}
