import { createBrowserClient, createServerClient, createAuthActions } from "@insforge/sdk/ssr";
import { cookies, headers } from "next/headers";
import * as React from "react";
import { publicAppEnv } from "./env";
import { REFRESHED_ACCESS_TOKEN_HEADER } from "./session-header";

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
  const env = publicAppEnv();
  const cookieStore = await cookies();
  // SESSION-TTL: the 900s access token is stale in the request cookie by the time a
  // route runs, and the SDK's read-only cookie adapter cannot rewrite it. Use the
  // token middleware refreshed for this same request.
  const refreshed = (await headers()).get(REFRESHED_ACCESS_TOKEN_HEADER);
  return createServerClient({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    anonKey: env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    ...(refreshed ? { accessToken: refreshed } : {}),
    cookies: {
      get: (name: string) => {
        const cookie = cookieStore.get(name);
        return cookie ? { value: cookie.value } : undefined;
      },
    },
  });
}

type CacheLike = <T extends (...args: never[]) => unknown>(fn: T) => T;
const reactCache = (React as unknown as { cache?: CacheLike }).cache;
const withRequestCache: CacheLike = reactCache ?? ((fn) => fn);

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
} | null;

export type SessionState = {
  user: SessionUser;
  unavailable: boolean;
};

export const getSessionState = withRequestCache(async (): Promise<SessionState> => {
  const insforge = await getServerClient();
  try {
    const { data, error } = await insforge.auth.getCurrentUser();
    if (error) throw new Error(error.message);
    return {
      user: (data?.user as SessionUser) ?? null,
      unavailable: false,
    };
  } catch (error) {
    console.error("[insforge] getCurrentUser failed:", error instanceof Error ? error.message : error);
    return { user: null, unavailable: true };
  }
});

export async function getSessionUser() {
  return (await getSessionState()).user;
}

export async function getAuthActions() {
  const env = publicAppEnv();
  const cookieStore = await cookies();
  return createAuthActions({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    anonKey: env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    cookies: cookieStore,
  });
}
