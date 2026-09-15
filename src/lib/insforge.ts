import { createBrowserClient, createServerClient, createAuthActions } from "@insforge/sdk/ssr";
import { cookies } from "next/headers";
import * as React from "react";
import { appEnv } from "./env";

export function getBrowserClient() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

  if (!baseUrl || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_INSFORGE_URL and NEXT_PUBLIC_INSFORGE_ANON_KEY must be defined for the browser client.",
    );
  }

  return createBrowserClient({ baseUrl, anonKey });
}

export async function getServerClient() {
  const env = appEnv();
  const cookieStore = await cookies();
  return createServerClient({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    anonKey: env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    cookies: {
      get: (name: string) => {
        const c = cookieStore.get(name);
        return c ? { value: c.value } : undefined;
      },
    },
  });
}

// PERF-003: every `auth.getCurrentUser()` call is a network GET to InsForge.
// React `cache()` dedupes it per request (app page + layout + nested route
// components share one round trip). React 18.3.1 stable does not ship
// `cache`, so fall back to a passthrough — behavior stays correct either way.
type CacheLike = <T extends (...args: never[]) => unknown>(fn: T) => T;
const reactCache = (React as unknown as { cache?: CacheLike }).cache;
const withRequestCache: CacheLike = reactCache ?? ((fn) => fn);

export const getSessionUser = withRequestCache(async () => {
  const insforge = await getServerClient();
  try {
    const { data } = await insforge.auth.getCurrentUser();
    return data?.user ?? null;
  } catch (error) {
    // REL-R01/REL-007: a backend outage must not hard-500 protected pages;
    // treat it as "no session" and let the auth gate render its fallback.
    console.error("[insforge] getCurrentUser failed:", error instanceof Error ? error.message : error);
    return null;
  }
});

export async function getAuthActions() {
  const env = appEnv();
  const cookieStore = await cookies();
  return createAuthActions({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    anonKey: env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    cookies: cookieStore,
  });
}