import { createBrowserClient, createServerClient, createAuthActions } from "@insforge/sdk/ssr";
import { cookies } from "next/headers";
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

export async function getAuthActions() {
  const env = appEnv();
  const cookieStore = await cookies();
  return createAuthActions({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    anonKey: env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    cookies: cookieStore,
  });
}