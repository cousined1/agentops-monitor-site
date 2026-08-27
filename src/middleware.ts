import { updateSession } from "@insforge/sdk/ssr/middleware";
import { type NextRequest, NextResponse } from "next/server";

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
  "/login",
  "/signup",
  "/api/health",
]);

const PUBLIC_API_PREFIXES = ["/api/auth", "/api/ingest", "/_next", "/favicon"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next({ request });
  const session = await updateSession({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  if (PUBLIC_PATHS.has(pathname)) return response;
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
    return response;

  if (!session.accessToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
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
