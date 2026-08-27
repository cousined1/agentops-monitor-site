import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="not-found">
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
