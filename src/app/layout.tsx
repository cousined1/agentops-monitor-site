import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
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
      <body>
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
        {children}
        <Footer />
      </body>
    </html>
  );
}
