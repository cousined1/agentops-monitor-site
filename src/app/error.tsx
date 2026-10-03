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
    <main>
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
      </section>
    </main>
  );
}
