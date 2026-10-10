import { updateSession } from "@insforge/sdk/ssr/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { REFRESHED_ACCESS_TOKEN_HEADER } from "@/lib/session-header";
import { apiError } from "@/lib/api-error";

const PUBLIC_PATHS = new Set([
  "/",
  "/features",
  "/pricing",
  "/about",
  "/contact",
  "/blog",
  "/help",
  "/docs",
  "/integrations",
  "/terms",
  "/privacy",
  "/privacy.html",
  "/cookie-policy",
  "/cookie-policy.html",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/og-image.svg",
  "/styles.css",
  "/cookie-consent.js",
  "/aom-chatbot.js",
  "/login",
  "/signup",
  "/reset-password",
  "/not-found",
  "/api/health",
  "/api/auth/refresh",
  "/api/auth/sign-out",
  "/api/ingest",
  "/api/stripe/webhook",
  "/api/leads",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookies = NextResponse.next({ request });
  let session: Awaited<ReturnType<typeof updateSession>> | null = null;
  try {
    session = await updateSession({
      requestCookies: request.cookies,
      responseCookies: sessionCookies.cookies,
    });
  } catch (error) {
    console.error(
      "[middleware] updateSession failed:",
      error instanceof Error ? error : new Error("Unknown session refresh failure"),
    );
  }

  // SESSION-TTL: handlers in this request need the refreshed token, since their
  // cookie still holds the expired value. Always set, even when empty — guarding
  // this with `if (accessToken)` would let a client forge this header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REFRESHED_ACCESS_TOKEN_HEADER, session?.accessToken ?? "");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const cookie of sessionCookies.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  const accessToken = session?.accessToken ?? null;

  const isProtectedPath =
    pathname.startsWith("/app") ||
    pathname === "/billing" ||
    pathname.startsWith("/billing/") ||
    (pathname.startsWith("/api/") && !PUBLIC_PATHS.has(pathname));

  if (!isProtectedPath) return response;

  if (!accessToken) {
    // REL-008: API consumers can't follow HTML redirects — return a JSON 401
    // so client-side 401 handling (SubscribeButton, PortalButton) works.
    if (pathname.startsWith("/api/")) {
      return apiError(401, "Unauthorized", "unauthorized");
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    const redirectResponse = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
