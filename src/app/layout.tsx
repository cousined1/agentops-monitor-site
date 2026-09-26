import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Analytics } from "@/components/Analytics";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: {
    default: "AgentOps Monitor",
    template: "%s · AgentOps Monitor",
  },
  description: "Trace every tool call. Govern every dollar. Audit every decision.",
  metadataBase: new URL("https://agentopsmonitor.com"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KL4BW5F2');`,
          }}
        />
        {/* End Google Tag Manager */}
      </head>
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KL4BW5F2"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        <Script id="gtag-consent-default" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
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
          `}
        </Script>
        <Script src="/cookie-consent.js" strategy="afterInteractive" />
        <Script src="/aom-chatbot.js" strategy="lazyOnload" />
        <Analytics />
        {children}
        <Footer />
      </body>
    </html>
  );
}
