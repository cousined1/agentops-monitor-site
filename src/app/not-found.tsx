import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    // id="main" + tabIndex={-1} mirror every other page: the layout's skip link
    // targets #main, and without this anchor a keyboard user pressing
    // "Skip to content" on a 404 stayed at the top of the nav.
    <main id="main" tabIndex={-1} className="not-found">
      <section>
        <p className="eyebrow">404</p>
        <h1>This page is not on the dashboard.</h1>
        <p className="lede">
          The page you requested does not exist or was moved. Try one of the
          routes below.
        </p>
        <p className="not-found-actions">
          <Link className="cta cta-primary" href="/">
            Back to home
          </Link>
          <Link className="cta cta-ghost" href="/app">
            Open dashboard
          </Link>
          <Link className="cta cta-ghost" href="/#pricing">
            See pricing
          </Link>
          <Link className="cta cta-ghost" href="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
