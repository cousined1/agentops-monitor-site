// Mutation proof: every guard added in this session must actually FAIL when the
// bug it guards is reintroduced. A green suite only proves the mutants were
// reverted, not that the guard can fire.
//
// Safety: this harness snapshots every target file in a separate pass BEFORE
// mutating (snapshotting inside the apply step corrupts the backup as soon as a
// file is touched twice), and restores in a finally block. It never calls git.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();

const MUTANTS = [
  {
    name: "api-keys page: drop the SDK .error check (the H-04 false empty state)",
    file: "src/app/(app)/app/api-keys/page.tsx",
    test: "tests/p1-3-outage-gating.test.mjs",
    from: `const { data, error } = await insforge.database`,
    to: `const { data } = await insforge.database`,
  },
  {
    name: "runs list: render cost raw again ($null)",
    file: "src/app/(app)/app/runs/page.tsx",
    test: "tests/run-detail-null-guard.test.mjs",
    from: `{formatUsd(run.cost_usd)}`,
    to: `\${run.cost_usd}`,
  },
  {
    name: "dashboard: render cost raw again ($null)",
    file: "src/app/(app)/app/page.tsx",
    test: "tests/run-detail-null-guard.test.mjs",
    from: `{formatUsd(run.cost_usd)}`,
    to: `\${run.cost_usd}`,
  },
  {
    name: "billing: omit profiles.email from the upsert (NOT NULL 23502)",
    file: "src/lib/billing.ts",
    test: "tests/customer-workflow.test.mjs",
    from: `.upsert([{ id: userId, email: resolvedEmail, ...patch }]);`,
    to: `.upsert([{ id: userId, ...patch }]);`,
  },
  {
    name: "webhook: claim handled:true for unimplemented events",
    file: "src/app/api/stripe/webhook/route.ts",
    test: "tests/webhook-coverage.test.mjs",
    from: `const handled = IMPLEMENTED_EVENTS.has(event.type);`,
    to: `const handled = ACKNOWLEDGED_EVENTS.has(event.type);`,
  },
  {
    name: "webhook: silently drop a cancellation for an unlinked customer",
    file: "src/app/api/stripe/webhook/route.ts",
    test: "tests/webhook-coverage.test.mjs",
    from: `        if (!profile) {
          throw new Error(
            \`Subscription cancelled for Stripe customer \${customerId} but no profile is linked; entitlements were not revoked.\`,
          );
        }`,
    to: `        if (!profile) { /* silently dropped */ }`,
  },
  {
    name: "profile page: drop the SDK .error check (blank profile during outage)",
    file: "src/app/(app)/app/profile/page.tsx",
    test: "tests/p1-3-outage-gating.test.mjs",
    from: `    if (error) {
      profileError = true;`,
    to: `    if (false) {
      profileError = true;`,
  },
  {
    name: "profile page: revert to the raw session read (outage = logged out)",
    file: "src/app/(app)/app/profile/page.tsx",
    test: "tests/p1-3-outage-gating.test.mjs",
    from: `  const { user, unavailable } = await getSessionState();
  if (unavailable) {`,
    to: `  const { data: userData } = await insforge.auth.getCurrentUser();
  const user = userData?.user;
  if (false) {`,
  },
  {
    name: "runs list: disable Next when the count is unknown",
    file: "src/app/(app)/app/runs/page.tsx",
    test: "tests/p1-3-outage-gating.test.mjs",
    from: `const hasNext = countUnknown || page < totalPages;`,
    to: `const hasNext = page < totalPages;`,
  },
  {
    name: "billing portal: drop the sign-in affordance on 401",
    file: "src/app/(app)/billing/PortalButton.tsx",
    test: "tests/p1-3-outage-gating.test.mjs",
    from: `        setNeedsLogin(true);`,
    to: `        void 0;`,
  },
  {
    name: "homepage: re-claim budget caps as a shipped feature",
    file: "src/app/page.tsx",
    test: "tests/customer-workflow.test.mjs",
    from: `Catch the agent that loops 64K tokens before it invoices you.`,
    to: `Catch the agent that loops 64K tokens before it invoices you. Set a hard budget cap: the run stops at the limit you set.`,
  },
  {
    name: "features: re-claim budget caps as a shipped feature",
    file: "src/app/(marketing)/features/page.tsx",
    test: "tests/customer-workflow.test.mjs",
    from: `<h2>Every span, with the cost attached</h2>`,
    to: `<h2>Cap the spend with hard budget limits</h2>`,
  },
  {
    name: "help: re-claim budget caps as a shipped feature",
    file: "src/app/(marketing)/help/page.tsx",
    test: "tests/customer-workflow.test.mjs",
    from: `They are not available yet.`,
    to: `Hard caps at the workflow, agent, or user.`,
  },
  {
    name: "login: remove the password reset path (permanent lockout)",
    file: "src/app/login/page.tsx",
    test: "tests/customer-workflow.test.mjs",
    from: `<Link href="/reset-password">Forgot your password?</Link>`,
    to: `<span>Contact support.</span>`,
  },
  {
    name: "reset page: reveal whether an account exists",
    file: "src/app/reset-password/page.tsx",
    test: "tests/customer-workflow.test.mjs",
    from: `If an account exists for that address,`,
    to: `A code was sent to that address.`,
  },
  {
    name: "sign-out: let a throw escape (crash page instead of redirect)",
    file: "src/app/api/auth/sign-out/route.ts",
    test: "tests/customer-workflow.test.mjs",
    from: `  try {
    const auth = await getAuthActions();
    await auth.signOut();
  } catch (error) {`,
    to: `  {
    const auth = await getAuthActions();
    await auth.signOut();
  } catch (error) {`,
  },
  {
    name: "checkout: reject a mixed-case plan again (Unknown plan: unknown)",
    file: "src/app/api/billing/checkout/route.ts",
    test: "tests/billing-checkout-coverage.test.mjs",
    from: `const requested = (body.plan ?? "team").toString().trim().toLowerCase();
  return /^[a-z]{2,24}$/.test(requested) ? requested : "unknown";`,
    to: `return /^[a-z]{2,24}$/.test((body.plan ?? "team").toString())
    ? (body.plan ?? "team").toString().toLowerCase()
    : "unknown";`,
  },
  {
    name: "webhook: drop the ledger-write guard (unstructured 500)",
    file: "src/app/api/stripe/webhook/route.ts",
    test: "tests/customer-workflow.test.mjs",
    from: `if (!dedupAdmin) {`,
    to: `if (false) {`,
  },
  {
    name: "ingest: drop the 402 quota branch (reports a valid key as invalid)",
    file: "src/app/api/ingest/route.ts",
    test: "tests/api-error-codes.test.mjs",
    from: `    if (result.data.code === "quota_exceeded") {`,
    to: `    if (false) {`,
  },
  {
    name: "ingest: drop quota_exceeded from the result schema",
    file: "src/app/api/ingest/route.ts",
    test: "tests/api-error-codes.test.mjs",
    from: `z.enum(["invalid_api_key", "rate_limited", "quota_exceeded"])`,
    to: `z.enum(["invalid_api_key", "rate_limited"])`,
  },
  {
    name: "quota migration: change the RPC signature (breaks live ingest)",
    file: "migrations/20261009120000_free-tier-run-quota.sql",
    test: "tests/api-error-codes.test.mjs",
    from: `  p_rate_limit integer
)
returns jsonb`,
    to: `  p_rate_limit integer,
  p_quota integer
)
returns jsonb`,
  },
  {
    name: "quota migration: fail closed on a broken quota check",
    file: "migrations/20261009120000_free-tier-run-quota.sql",
    test: "tests/api-error-codes.test.mjs",
    from: `  exception
    when others then`,
    to: `  exception
    when no_data_found then`,
  },
  {
    name: "pricing: re-promise metered overage billing",
    file: "src/app/(marketing)/pricing/page.tsx",
    test: "tests/customer-workflow.test.mjs",
    from: `Team overage is not charged yet.`,
    to: `Overage is metered and billed at $1.00 per 1,000 runs after the first 500K (metered).`,
  },
  {
    name: "static index.html: re-claim enforced caps in the FAQ structured data",
    file: "index.html",
    test: "tests/customer-workflow.test.mjs",
    from: `records the token counts and USD cost of every run and span, and surfaces the most expensive runs in a dashboard.`,
    to: `enforces spending caps, and records an audit trail of prompts, outputs, tool calls, and human approvals.`,
  },
  {
    name: "chatbot: re-claim budget caps as current",
    file: "public/aom-chatbot.js",
    test: "tests/customer-workflow.test.mjs",
    from: `'It tracks: cost per run, token counts (in/out), every LLM call, and every tool call (Stripe, Slack, vectorstore, etc.).',`,
    to: `'It tracks: cost per run, token counts (in/out), every LLM call, every tool call (Stripe, Slack, vectorstore, etc.), and budget caps.',`,
  },
  {
    name: "llms-full.txt: claim no quota is enforced (stale after the free cap)",
    file: "public/llms-full.txt",
    test: "tests/customer-workflow.test.mjs",
    from: `**One quota is enforced: the Free-tier monthly run cap.**`,
    to: `**Quotas are not enforced.**`,
  },
  {
    name: "docs: drop the 402 quota error code (breaks ingest/doc parity)",
    file: "src/app/(marketing)/docs/page.tsx",
    test: "tests/customer-workflow.test.mjs",
    from: `413. Rate limit exceeded: 429. Free-tier monthly run limit reached: 402 with`,
    to: `413. Rate limit exceeded: 429. Nothing else is returned.`,
  },
  {
    name: "legacy migration home drifts from canonical again",
    file: "supabase/migrations/20260903100000_stripe_billing_fields.sql",
    test: "tests/migration-chain-integrity.test.mjs",
    from: `-- Adds subscription state to profiles;`,
    to: `-- Adds subscription state to profiles (edited in the legacy home only).`,
  },
  {
    name: "analytics: send the full query string again (auth error text + PII)",
    file: "src/components/Analytics.tsx",
    test: "tests/analytics-privacy-and-a11y.test.mjs",
    from: `    const url = analyticsUrl(pathname, window.location.search);`,
    to: `    const search = window.location.search.replace(/^\\?/, "");
    const url = pathname + (search ? \`?\${search}\` : "");`,
  },
  {
    name: "analytics: bake the production container id back into the layout",
    file: "src/app/layout.tsx",
    test: "tests/audit-remediation.test.mjs",
    from: `})(window,document,'script','dataLayer',\${JSON.stringify(GTM_ID)});`,
    to: `})(window,document,'script','dataLayer','GTM-KL4BW5F2');`,
  },
  {
    name: "analytics: restore the hardcoded fallback id",
    file: "src/lib/analytics.ts",
    test: "tests/audit-remediation.test.mjs",
    from: `const CONFIGURED_GTM_ID = process.env.NEXT_PUBLIC_GTM_ID?.trim() ?? "";`,
    to: `const CONFIGURED_GTM_ID = process.env.NEXT_PUBLIC_GTM_ID?.trim() ?? "GTM-KL4BW5F2";`,
  },
  {
    name: "auth-errors: loosen the allowlist back to bare /required/",
    file: "src/lib/auth-errors.ts",
    test: "tests/analytics-privacy-and-a11y.test.mjs",
    from: `  /(email|password|code|otp) is required/i,`,
    to: `  /required/i,`,
  },
  {
    name: "not-found: drop the #main skip-link target",
    file: "src/app/not-found.tsx",
    test: "tests/analytics-privacy-and-a11y.test.mjs",
    from: `    <main id="main" tabIndex={-1} className="not-found">`,
    to: `    <main className="not-found">`,
  },
  {
    name: "error boundary: stop surfacing the digest",
    file: "src/app/error.tsx",
    test: "tests/analytics-privacy-and-a11y.test.mjs",
    from: `        {error.digest ? (`,
    to: `        {false ? (`,
  },
  {
    name: "meta description: re-claim governance and audit",
    file: "src/app/layout.tsx",
    test: "tests/analytics-privacy-and-a11y.test.mjs",
    from: `    "Trace every tool call your AI agent makes, with the token counts and USD cost of every run and span attached.",`,
    to: `    "Trace every tool call. Govern every dollar. Audit every decision.",`,
  },
  {
    name: "reset: point customer reset links at localhost",
    file: "src/app/reset-password/page.tsx",
    test: "tests/customer-workflow.test.mjs",
    from: `    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();`,
    to: `    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "http://localhost:3000";`,
  },
  {
    name: "design variant v3: re-claim hard caps (one copy-paste from production)",
    file: "variants/v3/index.html",
    test: "tests/customer-workflow.test.mjs",
    from: `<h2 id="cost-h">Spend you can defend in a budget meeting</h2>
        <p>Every run and span records`,
    to: `<h2 id="cost-h">Spend you can defend in a budget meeting</h2>
        <p>Hard caps at the workflow, the agent, and the user. A run stops at the limit you set.`,
  },
  {
    name: "design variant v1: re-claim governance in the social share text",
    file: "variants/v1/index.html",
    test: "tests/customer-workflow.test.mjs",
    from: `<meta property="og:description" content="Trace every tool call your AI agent makes, with the token counts and USD cost of every run and span attached.">`,
    to: `<meta property="og:description" content="Trace every tool call. Govern every dollar. Audit every decision.">`,
  },
];

// --- snapshot pass: every file the mutants will touch, before any edit -------
const targets = [...new Set(MUTANTS.map((m) => join(ROOT, m.file)))];
const saved = new Map(targets.map((t) => [t, readFileSync(t, "utf8")]));
console.log(`snapshotted ${saved.size} file(s)`);

function runTest(testFile) {
  try {
    execFileSync("npx", ["vitest", "run", testFile, "--reporter=dot"], {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8",
    });
    return { killed: false, out: "" };
  } catch (err) {
    return { killed: true, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const results = [];
try {
  for (const m of MUTANTS) {
    const abs = join(ROOT, m.file);
    if (!existsSync(abs)) {
      results.push({ ...m, verdict: "MISSING FILE" });
      continue;
    }
    const original = saved.get(abs);
    // This repo is CRLF on disk, so multi-line anchors written with \n never
    // match. Normalise for the search/replace only — the file is restored from
    // the untouched snapshot afterwards, so the original bytes always win.
    const normalized = original.replace(/\r\n/g, "\n");
    if (!normalized.includes(m.from)) {
      results.push({ ...m, verdict: "ANCHOR NOT FOUND" });
      continue;
    }
    const mutated = normalized.split(m.from).join(m.to).replace(/\n/g, "\r\n");
    writeFileSync(abs, mutated, "utf8");
    const { killed, out } = runTest(m.test);
    writeFileSync(abs, original, "utf8"); // restore before the next mutant
    results.push({
      name: m.name,
      test: m.test,
      verdict: killed ? "KILLED (guard fires)" : "SURVIVED (guard is inert)",
      detail: killed ? "" : out.split(/\r?\n/).filter((l) => /Tests\s+\d/.test(l)).slice(-1).join(""),
    });
  }
} finally {
  for (const [t, content] of saved) writeFileSync(t, content, "utf8");
  console.log("restored all snapshots");
}

console.log("");
for (const r of results) {
  const ok = String(r.verdict).startsWith("KILLED");
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.verdict.padEnd(26)} ${r.name}`);
  if (r.detail) console.log(`      ${r.detail}`);
}
const survived = results.filter((r) => !String(r.verdict).startsWith("KILLED"));
console.log("");
console.log(`${results.length - survived.length}/${results.length} mutants killed`);
process.exit(survived.length === 0 ? 0 : 1);