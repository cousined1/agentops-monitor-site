import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Analytics } from "@/components/Analytics";
import { Footer } from "@/components/footer";
import { GTM_ID } from "@/lib/analytics";

export const metadata: Metadata = {
  title: {
    default: "AgentOps Monitor",
    template: "%s · AgentOps Monitor",
  },
  // This is the fallback description for any page that does not set its own,
  // so it is what most search results and social cards show. It used to read
  // "Govern every dollar. Audit every decision." - the same over-promise
  // corrected on the marketing pages, still shipping as site metadata.
  description:
    "Trace every tool call your AI agent makes, with the token counts and USD cost of every run and span attached.",
  metadataBase: new URL("https://agentopsmonitor.com"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          AUDIT-RUN-20260930-202741 / FINDING-privacy-002 (High): the consent
          default was emitted in <body>, AFTER the inline GTM loader had
          already run in <head>. Google Consent Mode only protects a tag if
          the default state exists before the container loads, so the ordering
          made the "denied by default" claim in the cookie policy
          unenforced: GTM fired with no consent signal set. The default is now
          the FIRST thing in <head>, ahead of the GTM snippet.
        */}
        <script
          id="gtag-consent-default"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag("consent", "default", {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  functionality_storage: "denied",
  personalization_storage: "denied",
  security_storage: "granted",
  wait_for_update: 500
});
// Re-apply a stored choice here in the head, not only from
// /cookie-consent.js after it loads: a returning visitor who already
// allowed analytics would otherwise stay denied for the whole
// wait_for_update window.
try {
  var stored = JSON.parse(localStorage.getItem("aom_cookie_consent"));
  if (stored && stored.categories && stored.policyVersion === "2026-08-19-v1") {
    var c = stored.categories;
    gtag("consent", "update", {
      analytics_storage: c.analytics ? "granted" : "denied",
      functionality_storage: c.preferences ? "granted" : "denied",
      personalization_storage: c.preferences ? "granted" : "denied",
      ad_storage: c.marketing ? "granted" : "denied",
      ad_user_data: c.marketing ? "granted" : "denied",
      ad_personalization: c.marketing ? "granted" : "denied"
    });
  }
} catch (e) {}`,
          }}
        />
        {/* Google Tag Manager.
            Injected only when NEXT_PUBLIC_GTM_ID is set, and using that value
            rather than a hardcoded container id. It previously always rendered a
            hardcoded production container, so the documented kill-switch did
            nothing and every `npm run dev` sent localhost traffic to production
            analytics. Keep the raw inline <script>: audit finding AUDIT-008d
            recorded that strategy="beforeInteractive" only serialized the code
            into the RSC payload and never executed it in this app's build.
            Converting this to next/script needs a real browser check that
            analytics still fire and still load AFTER the consent default above -
            do not do it blind. */}
        {GTM_ID ? (
          <>
            {/* eslint-disable-next-line @next/next/next-script-for-ga */}
            <script
              dangerouslySetInnerHTML={{
                __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer',${JSON.stringify(GTM_ID)});`,
              }}
            />
            {/* End Google Tag Manager */}
          </>
        ) : null}
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {/* Google Tag Manager (noscript) */}
        {GTM_ID ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        ) : null}
        {/* End Google Tag Manager (noscript) */}
        <Script src="/cookie-consent.js" strategy="afterInteractive" />
        <Script src="/aom-chatbot.js" strategy="lazyOnload" />
        <Analytics />
        {children}
        <Footer />
      </body>
    </html>
  );
}
