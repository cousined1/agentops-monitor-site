"use client";

import Script from "next/script";
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

  if (!GTM_ID) return null;

  return (
    <>
      <Script id="gtm-init" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height={0}
          width={0}
          style={{ display: "none", visibility: "hidden" }}
        />
      </noscript>
    </>
  );
}
