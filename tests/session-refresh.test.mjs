import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// SESSION-TTL: the InsForge access token lives 900s. Middleware refreshes it
// before every route runs, but the request cookie still carries the expired
// value and the SDK's cookie adapter is typed `Pick<CookieStore, "get">`, so a
// route handler cannot rewrite it. Middleware therefore forwards the refreshed
// token to handlers in the same request, and getServerClient prefers it.
const { createServerClient, cookies, headers, updateSession } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  cookies: vi.fn(),
  headers: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("@insforge/sdk/ssr", () => ({
  createBrowserClient: vi.fn(),
  createServerClient,
  createAuthActions: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies, headers }));
vi.mock("@insforge/sdk/ssr/middleware", () => ({ updateSession }));

const BASE_ENV = {
  NEXT_PUBLIC_INSFORGE_URL: "https://backend.example",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key-with-at-least-twenty-characters",
  INSFORGE_API_KEY: "admin-key-with-at-least-twenty-characters",
};

const HEADER = "x-insforge-access-token";

function cookieStore(present = {}) {
  return {
    get: vi.fn((name) => (name in present ? { value: present[name] } : undefined)),
    set: vi.fn(),
    delete: vi.fn(),
  };
}

function headerStore(values = {}) {
  return { get: vi.fn((name) => values[name] ?? null) };
}

function makeRequest(pathname, { cookie = "session=stale", extraHeaders = {} } = {}) {
  return new NextRequest(`https://app.example${pathname}`, {
    headers: { cookie, ...extraHeaders },
  });
}

// NextResponse.next({ request: { headers } }) forwards the overridden request
// headers to the next handler via these internal response headers.
function forwardedRequestHeaders(response) {
  const names = response.headers.get("x-middleware-override-headers");
  if (!names) return {};
  const out = {};
  for (const name of names.split(",").map((n) => n.trim())) {
    const value = response.headers.get(`x-middleware-request-${name}`);
    if (value !== null) out[name] = value;
  }
  return out;
}

describe("SESSION-TTL: refreshed access token reaches handlers in the same request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, BASE_ENV);
    cookies.mockResolvedValue(cookieStore({ session: "stale-cookie-value" }));
    headers.mockResolvedValue(headerStore());
    updateSession.mockResolvedValue({ refreshed: true, accessToken: "fresh-token", error: null });
  });

  describe("getServerClient", () => {
    it("passes the middleware-refreshed token as accessToken", async () => {
      headers.mockResolvedValue(headerStore({ [HEADER]: "fresh-token" }));
      const { getServerClient } = await import("../src/lib/insforge.ts");

      await getServerClient();

      const config = createServerClient.mock.calls[0][0];
      expect(config.accessToken).toBe("fresh-token");
    });

    it("omits accessToken when no refreshed header is present, so the cookie path is unchanged", async () => {
      headers.mockResolvedValue(headerStore({ [HEADER]: null }));
      const { getServerClient } = await import("../src/lib/insforge.ts");

      await getServerClient();

      const config = createServerClient.mock.calls[0][0];
      expect("accessToken" in config).toBe(false);
    });

    it("treats the empty string as absent", async () => {
      headers.mockResolvedValue(headerStore({ [HEADER]: "" }));
      const { getServerClient } = await import("../src/lib/insforge.ts");

      await getServerClient();

      expect("accessToken" in createServerClient.mock.calls[0][0]).toBe(false);
    });

    it("still reads cookies, so an unauthenticated request is unaffected", async () => {
      headers.mockResolvedValue(headerStore({ [HEADER]: "fresh-token" }));
      const { getServerClient } = await import("../src/lib/insforge.ts");

      await getServerClient();

      const config = createServerClient.mock.calls[0][0];
      expect(config.cookies.get("session")).toEqual({ value: "stale-cookie-value" });
      expect(config.cookies.get("missing")).toBeUndefined();
    });
  });

  describe("middleware", () => {
    it("forwards the refreshed token to handlers in the same request", async () => {
      const { middleware } = await import("../src/middleware.ts");

      const response = await middleware(makeRequest("/app"));

      expect(forwardedRequestHeaders(response)[HEADER]).toBe("fresh-token");
    });

    it("forwards the token on protected API routes too, not just pages", async () => {
      const { middleware } = await import("../src/middleware.ts");

      const response = await middleware(makeRequest("/api/api-keys"));

      expect(forwardedRequestHeaders(response)[HEADER]).toBe("fresh-token");
    });

    it("never forwards a forged token when there is no session to replace it", async () => {
      updateSession.mockResolvedValue({ refreshed: false, accessToken: null, error: null });
      const { middleware } = await import("../src/middleware.ts");

      const response = await middleware(
        makeRequest("/api/api-keys", {
          extraHeaders: { [HEADER]: "attacker-forged-token" },
        }),
      );

      // With no session the request is short-circuited, so no handler runs and
      // nothing can read the forged value as an authenticated token.
      expect(response.status).toBe(401);
      expect(forwardedRequestHeaders(response)[HEADER]).not.toBe("attacker-forged-token");
    });

    it("overwrites a forged header even when a real session exists", async () => {
      const { middleware } = await import("../src/middleware.ts");

      const response = await middleware(
        makeRequest("/app", { extraHeaders: { [HEADER]: "attacker-forged-token" } }),
      );

      expect(forwardedRequestHeaders(response)[HEADER]).toBe("fresh-token");
    });

    it("still returns 401 on a protected API route with no session", async () => {
      updateSession.mockResolvedValue({ refreshed: false, accessToken: null, error: null });
      const { middleware } = await import("../src/middleware.ts");

      const response = await middleware(makeRequest("/api/api-keys"));

      expect(response.status).toBe(401);
    });

    it("fails closed when updateSession throws, without propagating the error", async () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        updateSession.mockRejectedValue(new Error("insforge unreachable"));
        const { middleware } = await import("../src/middleware.ts");

        const response = await middleware(makeRequest("/app"));

        // No session resolved, so the protected page fails closed to a login redirect.
        expect(response.status).toBe(307);
        expect(forwardedRequestHeaders(response)[HEADER]).not.toBe("attacker-forged-token");
      } finally {
        errSpy.mockRestore();
      }
    });
  });
});
