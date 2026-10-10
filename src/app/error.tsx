"use client";

import { useEffect } from "react";

// F-06: catch unexpected render throws with a friendly recovery UI instead of
// crashing to the Next.js unhandled-error page.
export default function GlobalError({
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
    // id="main" so the layout's skip link resolves here too.
    <main id="main" tabIndex={-1}>
      <section>
        <h1>Something went wrong</h1>
        <p className="lede">
          An unexpected error interrupted this page. Your data is safe. Try again.
        </p>
        <p>
          <button className="cta cta-primary" onClick={reset}>
            Try again
          </button>
        </p>
        {error.digest ? (
          // The digest is Next's correlation id between the browser render and
          // the server log. Without showing it, a customer reporting a failure
          // gives support nothing to search for.
          <p className="lede">
            If this keeps happening, quote reference{" "}
            <code>{error.digest}</code> when you contact support.
          </p>
        ) : null}
      </section>
    </main>
  );
}
