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
  "/robots.txt",
  "/sitemap.xml",
  "/og-image.svg",
  "/styles.css",
  "/index.html",
  "/cookie-consent.js",
  "/aom-chatbot.js",
  "/login",
  "/signup",
  "/api/health",
]);

const PUBLIC_API_PREFIXES = ["/api/auth", "/api/ingest", "/_next", "/favicon"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next({ request });
  let session: Awaited<ReturnType<typeof updateSession>> | null = null;
  try {
    session = await updateSession({
      requestCookies: request.cookies,
      responseCookies: response.cookies,
    });
  } catch (error) {
    console.error("[middleware] updateSession failed:", error);
  }
  const accessToken = session?.accessToken ?? null;

  if (PUBLIC_PATHS.has(pathname)) return response;
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
    return response;

  if (!accessToken) {
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
