# Site Spec

## Product

Provisional name: AgentOps Monitor

Archetype: SaaS

Launch state: pre-launch concept

## Thesis

An agent without a budget is an incident waiting to be invoiced.

## Audience and feeling

Engineering and operations leaders at mid-market SaaS, fintech, healthtech, and AI-tool companies. Within three seconds, they should feel recognised as the person on call when an agent loops, spends, or makes a decision no one can explain.

## Takeaway

Replay exactly what the agent did, then stop it before it spends again.

## Direction set

1. A2 Tufte data-ink: light ground, hairline rules, small multiples, colour only for cost and failure.
2. A3 Financial terminal: mono, tabular numerals, semantic colour, zero radius.
3. D3 Blueprint: technical linework, callouts, and trace annotations.

Current provisional draft: A3 Financial terminal.

## Scene sentence

At 2:14 a.m., an on-call engineer opens the trace of an agent that spent four hundred dollars in nine minutes and needs the exact call where it looped.

## Surface map

1. Hero trace replay
2. Core loop span detail and timeline
3. Money and risk ledger
4. Install block
5. Integration identity kit

Every surface uses `data-fidelity="concept"` until shipping software and real telemetry exist.

## Copy constraints

- One CTA verb: Install
- No em dashes
- Short headlines
- Future or provisional language for unshipped behavior
- No customer logos or testimonials
- No compliance certification claims
- All numbers accounted for in `product-facts.md`

## Launch constraint

The name collides with the existing AgentOps.ai product and `agentops` package. GitHub publication and public deployment require a naming decision or explicit acceptance of that risk.
