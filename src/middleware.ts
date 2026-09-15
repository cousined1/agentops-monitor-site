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
  "/llms.txt",
  "/llms-full.txt",
  "/og-image.svg",
  "/styles.css",
  "/index.html",
  "/cookie-consent.js",
  "/aom-chatbot.js",
  "/login",
  "/signup",
  "/api/health",
  "/api/auth/refresh",
  "/api/auth/sign-out",
  "/api/ingest",
  "/api/stripe/webhook",
  "/api/leads",
]);

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
    console.error(
      "[middleware] updateSession failed:",
      error instanceof Error ? error : new Error("Unknown session refresh failure"),
    );
  }
  const accessToken = session?.accessToken ?? null;

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/blog/")) return response;

  if (!accessToken) {
    // REL-008: API consumers can't follow HTML redirects — return a JSON 401
    // so client-side 401 handling (SubscribeButton, PortalButton) works.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
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
