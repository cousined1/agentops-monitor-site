# AgentOps Monitor Site

Next.js 15 SaaS and marketing site for an AI-agent observability product. The current brand name is provisional because `AgentOps.ai` already operates in this category.

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Health metadata is available at `http://localhost:3000/api/health`.

Required environment variables are documented in `.env.example`. Keep `.env.local` private.

## Application routes

- `/`, `/privacy`, and `/cookie-policy` preserve the static marketing and legal surfaces.
- `/signup` and `/login` establish an InsForge SSR session.
- `/app`, `/app/api-keys`, and `/app/runs` are authenticated dashboard routes.
- `/api/ingest` accepts agent run payloads authenticated with an `aom_live_*` API key.

## Validation

```powershell
npm run typecheck
npm run build
npm audit --omit=dev
```

## Google Tag Manager

Set `NEXT_PUBLIC_GTM_ID` in `.env.local` (use the value from `.env.example`). When unset the GTM script does not load and `trackPageView` / `trackEvent` are no-ops, so local development does not send analytics.

The GTM container is loaded by `src/components/Analytics.tsx` after the consent defaults set in the root layout (`gtag-consent-default`) and alongside the cookie banner at `public/cookie-consent.js`. GTM only loads on the client; server-rendered HTML never references it. The `<noscript>` fallback iframe is included for clients without JavaScript.

### Pageview ownership

This app is a Next.js single-page app. Pageviews are pushed to `window.dataLayer` from `src/components/Analytics.tsx` on every pathname (and query string) change, including the initial load. The push fires once per unique URL change.

To avoid duplicates, configure any GA4 tag in GTM **without** the built-in "Send a page view event when this tag loads" option and **without** a History Change trigger. The single source of `page_view` events is this app's client-side push.

### Consent

The existing cookie banner (`public/cookie-consent.js`) updates `gtag('consent', 'update', ...)` whenever the user saves a choice. GTM and its tags read those values, so GA4 stays denied until the user grants Analytics in the banner. Marketing and ad storage stay denied unless Marketing is granted. Global Privacy Control (GPC) forces `marketing` off even on Accept All.

### DataLayer events

`src/lib/analytics.ts` exposes:

- `initAnalytics()` — called once by `Analytics` on mount; pushes an `analytics_init` event with the configured GTM ID.
- `trackPageView(url, title?, referrer?)` — called on route change.
- `trackEvent(name, params?)` — call from any client component.

Event names are centralized in `ANALYTICS_EVENTS` in `src/lib/analytics.ts`:

| Event | Where it fires | Params |
|---|---|---|
| `signup_started` | When the user submits the initial signup form (`<SignupSubmitButton>` in `src/app/signup/page.tsx`) | `{ surface: "signup_form" }` |
| `signup_completed` | On first render of `/app` after a signup or email-verification redirect that appends `?signup=success` (`<SignupCompletedTracker>`) | `{ surface: "signup_success" }` |
| `trial_started` | Not wired — call `trackEvent(ANALYTICS_EVENTS.TRIAL_STARTED, { ... })` from the checkout/trial entry point when one ships | caller-defined |
| `subscription_purchased` | Not wired — call `trackEvent(ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED, { plan, amount_usd, ... })` from the Stripe success callback when it ships | caller-defined |

The signup server actions in `src/app/signup/page.tsx` redirect to `/app?signup=success` on both the initial signup success and the post-email-verification success paths.

### Verifying in GA4 DebugView

1. Install [GA Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna) or open GA4 > Admin > DebugView.
2. Set `NEXT_PUBLIC_GTM_ID` in `.env.local` and run `npm run dev`.
3. Open `http://localhost:3000` and interact.
4. Confirm in DebugView: an `analytics_init` event, a `page_view` for `/`, and (after signup) `signup_started` and `signup_completed` events.
5. Open the Network tab and confirm `www.googletagmanager.com/gtm.js?id=...` loads and a `collect?...&gcs=G100` or similar hits `region1.google-analytics.com` only after the cookie banner accepts Analytics.

### Testing route changes

1. Load `/`, then navigate to `/pricing` via the topbar nav. Confirm a second `page_view` fires with `page_path: "/pricing"`.
2. Click a footer link to `/docs`, then use browser back. Confirm `page_view` for `/docs` and then for `/pricing` (the prior path).
3. Visit a 404 path like `/does-not-exist`. Confirm `page_view` fires for `/does-not-exist` (Next.js renders `src/app/not-found.tsx`).
4. Disable analytics by unsetting `NEXT_PUBLIC_GTM_ID`. Confirm no GTM script tag is injected and no `dataLayer.push` calls fire (open DevTools Network and Console).

## Wave 2

The following product areas are intentionally deferred from v1: budget configuration, per-agent budget editing, Stripe Checkout and billing portal integration, usage overage metering, and an administrator panel. They require a separate schema and payment-security review before implementation.

Private source: https://github.com/cousined1/agentops-monitor-site

Live preview: https://agentops-monitor-site-production.up.railway.app

## Evidence

- `product-facts.md` records verified, owner-supplied, cut, and unverified claims.
- `SITE_SPEC.md` records the design and honesty constraints.
- `JUDGE.md` compares the three visual directions and names the winner.
- `RUN.json` records validation, visual, and deployment status.
- `shots/` is generated locally by the Site Forge screenshot harness and is not committed.
- `variants/` contains the three compared directions.

## Marketing validation

The shipped root page passes both Site Forge validators with zero errors and zero warnings. The screenshot harness reports no console errors, failed requests, or horizontal overflow at 1440px and 393px.
