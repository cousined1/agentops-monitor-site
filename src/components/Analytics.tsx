"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { GTM_ID, initAnalytics, trackPageView } from "@/lib/analytics";

// Campaign parameters are safe and useful. Everything else is dropped: the
// previous `pathname + window.location.search` sent the ENTIRE query string to
// the analytics vendor, and /login and /signup place provider error text in
// `?error=` - a message the auth allowlist passes through verbatim can contain
// the address the visitor typed.
const ALLOWED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

function analyticsUrl(pathname: string, search: string): string {
  if (!search) return pathname;
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  const kept = new URLSearchParams();
  for (const key of ALLOWED_PARAMS) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function Analytics() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!GTM_ID) return;
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!GTM_ID || !pathname || typeof window === "undefined") return;
    const url = analyticsUrl(pathname, window.location.search);
    if (lastPathRef.current === url) return;
    const referrer = lastPathRef.current ?? undefined;
    lastPathRef.current = url;
    trackPageView(url, undefined, referrer);
  }, [pathname]);

  return null;
}
