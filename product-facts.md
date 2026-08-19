# Product Facts

Capture date: 2026-08-18

This ledger separates owner-supplied product intent from externally verified facts. Any claim that is not verified is either labelled as planned on the page or omitted.

## Naming collision

Verdict: CONFIRMED, launch blocker

`AgentOps.ai` already markets an observability and developer platform for AI agents. Its public site advertises event tracking, replay debugging, audit trails, spending visibility, and framework integrations. Its open-source repository publishes the `agentops` Python package.

Sources:

- https://www.agentops.ai/
- https://github.com/AgentOps-AI/agentops
- https://docs.agentops.ai/v2/introduction

Decision: Treat `AgentOps Monitor` as a provisional internal name. Do not claim the `agentops` package name. Use `agentops_monitor` only as illustrative pre-launch syntax pending naming and package checks.

## Product data shape

Verdict: OWNER-SUPPLIED CONCEPT

The run identifier, timestamps, spans, costs, tokens, tool names, policy rule, and trace values shown in the UI come from the supplied product brief. They are sample values for concept surfaces, not production telemetry.

Source: `site-forge/briefs/agentops-monitor.md`, lines 71-89.

Decision: Every product surface is marked `data-fidelity="concept"` and visibly labelled.

## Pricing

Verdict: OWNER-SUPPLIED PRE-LAUNCH INTENT

The Free, Team, Enterprise, and metered overage structure comes from the supplied brief. No billing system or published price page was provided.

Source: `site-forge/briefs/agentops-monitor.md`, lines 104-113.

Decision: Keep the numbers because the owner explicitly supplied them, but treat them as planned launch pricing.

## Framework compatibility

Verdict: UNVERIFIED FOR THIS PRODUCT

The brief names LangChain, CrewAI, and the OpenAI SDK as intended adapters. No shipping package, repository, or compatibility test for this product was provided.

Decision: Replace "wired" and "wraps" with "planned" and "designed for". Do not claim partnership.

## Anthropic revenue claim

Claim: "Anthropic is at $65B ARR."

Verdict: CUT

Reason: No primary source was captured in this run, and ARR, run-rate, revenue, and valuation are not interchangeable. The claim does not appear on the page.

## Databricks valuation claim

Claim: "Databricks at $190B valuation."

Verdict: CUT

Reason: No primary source was captured in this run. The claim does not appear on the page.

## Stripe and OpenRouter

Verdict: VERIFIED PARTNERSHIP; REPORTED ACQUISITION NOT USED

Stripe announced on 2026-01-29 that OpenRouter uses Stripe Invoicing, Tax, and Radar and that the companies partnered on usage tracking and billing. Bloomberg reported on 2026-08-16 that Stripe had finalized an agreement to acquire OpenRouter for more than $7B, citing unnamed sources; Stripe had not publicly confirmed the acquisition in the captured sources.

Sources:

- https://stripe.com/newsroom/news/openrouter-and-stripe
- https://www.bloomberg.com/news/articles/2026-08-16/stripe-nears-deal-to-buy-ai-firm-openrouter-for-over-7-billion

Decision: Omit from the page. It does not prove this product's value.

## Competitor set

Verdict: CONFIRMED CATEGORY, NOT USED AS PAGE PROOF

Publicly visible competitors include AgentOps.ai, Langfuse, LangSmith, Arize Phoenix/AX, Braintrust, Datadog LLM Observability, Helicone, and others. Because the provisional brand directly overlaps AgentOps.ai, competitive and legal naming review is required before public launch.

Sources:

- https://www.agentops.ai/
- https://langfuse.com/
- https://www.langchain.com/langsmith
- https://arize.com/pricing/

Decision: Do not include a competitor comparison on this landing page.

## Compliance

Verdict: NOT CLAIMED

No evidence was provided for SOC 2, HIPAA, GDPR, ISO, or FedRAMP certification.

Decision: The page explicitly says these certifications are not claimed and describes only the intended audit-trail data.
