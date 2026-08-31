# Security Audit Summary — Monthly Patch Cycle

**Date:** 2026-08-30
**Repository:** agentops-monitor-site
**Commit baseline:** `0ec6777` (main)
**Scanner corpus:** npm audit, OSV-Scanner v2.5.1, Trivy v0.74.0

## Executive Summary

The August patch cycle resolved **5 CVE findings** across two transitive npm dependencies (postcss, sharp). All fixes were applied via semver-safe upgrades and npm `overrides`, verified by a clean `npm audit` (0 vulnerabilities), `tsc --noEmit`, and a full `next build`. No application code changes were required. InsForge backend diagnostics are healthy: 3/30 connections, no slow queries, 0 application-log errors. One informational Postgres finding is tracked below and does not block release.

## Vulnerability Findings — Resolved

| Package | CVE / GHSA | Severity | Fixed In | Resolution |
|---------|--------------|----------|----------|------------|
| postcss | GHSA-6g55-p6wh-862q / CVE-2026-45623 | HIGH | 8.5.12 | override `postcss ^8.5.23` |
| postcss | GHSA-qx2v-qp2m-jg93 / CVE-2026-41305 | MEDIUM | 8.5.10 | override `postcss ^8.5.23` |
| postcss | GHSA-r28c-9q8g-f849 / CVE-2026-73646 | HIGH | 8.5.18 | override `postcss ^8.5.23` |
| postcss | GHSA-fxqj-rqcc-2cmp / CVE-2026-69153 | MEDIUM | 8.5.23 | override `postcss ^8.5.23` |
| sharp   | GHSA-f88m-g3jw-g9cj (libvips bundle) | HIGH | 0.35.0 | override `sharp ^0.35.3` |

- `next` and `eslint-config-next` were bumped to `^15.5.24` to stay on the latest 15.x line compatible with the overrides.
- All overrides were chosen to avoid a Next.js 16 major upgrade, keeping scope minimal.

## Verification

- `npm install` → 327 packages audited, **0 vulnerabilities**
- `npm audit` standalone → **0 vulnerabilities**
- `npm run typecheck` (`tsc --noEmit`) → clean
- `npm run build` → passes; routes `/api/ingest`, `/api/stripe/webhook`, `/app/*` compile; middleware 63.7 kB; first-load JS ~103 kB
- Trivy filesystem scan (secrets, misconfig) → clean
- Trivy vulnerability scan → no additional findings beyond npm corpus

## InsForge Backend Health

- **Advisor:** No critical or security-severity items at time of scan (display-only; server-side scans current).
- **Database:** Connections 3/30, no slow queries, no deadlock signatures.
- **Logs:** 0 errors in application scope.
- **Informational:** `postgres.logs` shows `relation "pg_stat_statements" does not exist`. This is an InsForge-managed extension absence, not an application bug. No action required this cycle; monitor next month.

## OWASP LLM Top-10 Review — aom-chatbot.js

The site embeds a zero-dependency sales chatbot (`aom-chatbot.js`). It is rule-based (keyword detection + static flows), not LLM-driven, so most LLM-specific categories are not applicable. Reviewed for applicable risks:

| Category | Status | Notes |
|----------|--------|-------|
| LLM01 Prompt Injection | N/A | No LLM call in widget. |
| LLM02 Insecure Output Handling | PASS | `formatMessage()` escapes HTML before markdown transforms; `escapeHtml()` used for user input. |
| LLM03 Training Data Poisoning | N/A | Static content only. |
| LLM04 Model DoS | N/A | No external LLM call. |
| LLM05 Supply Chain | PASS | No runtime LLM dependency; supply chain covered by npm scans above. |
| LLM06 Sensitive Info Disclosure | PASS | Only `email` + `company` collected; conversation state kept in-memory, not persisted to localStorage messages. |
| LLM07 Insecure Plugin Design | N/A | No plugins. |
| LLM08 Excessive Agency | N/A | No agentic actions. |
| LLM09 Overreliance | N/A | No generated advice. |
| LLM10 Model Theft | N/A | No model endpoint exposed. |

**Hardening notes (non-blocking):**
- `showBotMessage()` sets `innerHTML` from static flows + escaped user data; current sources are safe. If future flows interpolate raw input, sanitize first.
- Lead POST to `CONFIG.apiEndpoint` is optional and sends conversation transcript; endpoint must enforce its own validation and retention policy.
- `{{email}}` replacement in `lead_company` inserts raw `state.leadData.email`; keep flows static or escape before interpolation.

## Deliverables

- `vulnerability-backlog.csv` — line-item tracker for all findings (fixed and monitored).
- `security-audit-summary.md` — this document.

## Next Cycle (September 2026)

1. Re-run npm audit / OSV / Trivy against `main` after Railway deploy verification.
2. Check for Next.js 15.5.x patch releases and sharp 0.35.x updates.
3. Confirm whether InsForge has enabled `pg_stat_statements`; if still absent and diagnostics noise grows, open a support ticket.
4. Re-review `aom-chatbot.js` if lead-capture endpoint or flow content changes.
