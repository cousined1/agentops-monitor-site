"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { GTM_ID, initAnalytics, trackPageView } from "@/lib/analytics";

export function Analytics() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!GTM_ID) return;
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!GTM_ID || !pathname || typeof window === "undefined") return;
    const search = window.location.search.replace(/^\?/, "");
    const url = pathname + (search ? `?${search}` : "");
    if (lastPathRef.current === url) return;
    const referrer = lastPathRef.current ?? undefined;
    lastPathRef.current = url;
    trackPageView(url, undefined, referrer);
  }, [pathname]);

  return null;
}
