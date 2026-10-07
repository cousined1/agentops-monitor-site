"use client";

import { useEffect } from "react";
import Link from "next/link";

// F-06: catch unexpected render throws inside the signed-in app shell with a
// friendly recovery UI instead of the Next.js unhandled-error page.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled render error:", error);
  }, [error]);

  return (
    <main>
      <section>
        <h1>Something went wrong</h1>
        <p className="lede">
          An unexpected error interrupted this page. Your data is safe. Try again.
        </p>
        <p>
          <button className="cta cta-primary" onClick={reset}>
            Try again
          </button>{" "}
          <Link className="cta cta-ghost" href="/app">
            Back to dashboard
          </Link>
        </p>
      </section>
    </main>
  );
}
