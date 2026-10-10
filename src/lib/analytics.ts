// Single source of truth for the GTM container.
//
// This used to fall back to the production container id, which meant GTM_ID was
// never falsy: `isEnabled()` was always true, the inline loader in
// src/app/layout.tsx hardcoded the same id independently, and the documented
// kill-switch ("unset NEXT_PUBLIC_GTM_ID and no tag is injected") did not
// exist. The practical effect was that `npm run dev` shipped localhost traffic
// into the production analytics property.
//
// No fallback by design. Unset (or empty) means OFF everywhere, so local work
// never reaches production data. A deployment that wants analytics must set
// NEXT_PUBLIC_GTM_ID — see .env.example.
const CONFIGURED_GTM_ID = process.env.NEXT_PUBLIC_GTM_ID?.trim() ?? "";
export const GTM_ID =
  CONFIGURED_GTM_ID.toLowerCase() === "0" || CONFIGURED_GTM_ID.toLowerCase() === "off"
    ? ""
    : CONFIGURED_GTM_ID;

export const ANALYTICS_EVENTS = {
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",
  TRIAL_STARTED: "trial_started",
  SUBSCRIPTION_PURCHASED: "subscription_purchased",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type AnalyticsParams = Record<
  string,
  string | number | boolean | null | undefined
>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

function getDataLayer(): Array<Record<string, unknown>> | null {
  if (typeof window === "undefined") return null;
  if (!window.dataLayer) window.dataLayer = [];
  return window.dataLayer;
}

function isEnabled(): boolean {
  return Boolean(GTM_ID);
}

export function initAnalytics(): void {
  if (!isEnabled()) return;
  const dataLayer = getDataLayer();
  if (!dataLayer) return;
  dataLayer.push({ event: "analytics_init", gtm_id: GTM_ID });
}

export function trackPageView(
  url: string,
  title?: string,
  referrer?: string,
): void {
  if (!isEnabled()) return;
  const dataLayer = getDataLayer();
  if (!dataLayer) return;
  dataLayer.push({
    event: "page_view",
    page_path: url,
    page_title: title ?? (typeof document !== "undefined" ? document.title : undefined),
    page_referrer: referrer ?? (typeof document !== "undefined" ? document.referrer : undefined),
  });
}

export function trackEvent(
  name: AnalyticsEventName | string,
  params: AnalyticsParams = {},
): void {
  if (!isEnabled()) return;
  const dataLayer = getDataLayer();
  if (!dataLayer) return;
  dataLayer.push({
    event: name,
    ...params,
  });
}
