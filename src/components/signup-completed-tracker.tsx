"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";

const SUCCESS_PARAM = "signup";

export function SignupCompletedTracker() {
  const router = useRouter();
  const pathname = usePathname();
  const firedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (firedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(SUCCESS_PARAM) === "success") {
      firedRef.current = true;
      trackEvent(ANALYTICS_EVENTS.SIGNUP_COMPLETED, {
        surface: "signup_success",
      });
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, "", cleanUrl);
      router.replace(pathname, { scroll: false });
    }
  }, [router, pathname]);

  return null;
}
