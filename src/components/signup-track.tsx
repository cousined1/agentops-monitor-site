"use client";

import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";

export function SignupSubmitButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={() =>
        trackEvent(ANALYTICS_EVENTS.SIGNUP_STARTED, {
          surface: "signup_form",
        })
      }
    >
      {children}
    </button>
  );
}
