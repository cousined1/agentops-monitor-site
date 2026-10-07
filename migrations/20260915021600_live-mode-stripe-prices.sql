-- ============================================================
-- AgentOps Monitor — point plans at live-mode Stripe prices (P0-2)
--
-- QA 2026-09-14: /api/billing/checkout returned 500 on every click —
-- the app authenticates to Stripe with a LIVE secret key but the plans
-- table held price IDs from a later-created test-mode batch
-- (price_1UBhDN... / price_1UBhIj...), so checkout.sessions.create
-- failed with "No such price" and no hosted checkout could ever open.
--
-- Fix: repoint every plan at the corresponding ACTIVE live-mode price
-- that already exists on the account (Agent Ops Monitor Team /
-- Enterprise / Free products, price_1U8s* batch). The metered overage
-- price (price_1U8svcKGNA0NaemqOWyYnxCU) was already live and stays.
--
-- The app also reads STRIPE_TEAM_PRICE_ID / STRIPE_ENTERPRISE_PRICE_ID
-- env overrides (src/lib/billing.ts), which are set on Railway, so a
-- future price rotation does not require a DB migration.
-- ============================================================

update public.plans set stripe_price_id = 'price_1U8snxKGNA0NaemqZls4GeOK'
  where name = 'team';

update public.plans set stripe_price_id = 'price_1U8svcKGNA0NaemqeEw11OM5'
  where name = 'enterprise';

update public.plans set stripe_price_id = 'price_1U8slxKGNA0Naemq7LR8Psj7'
  where name = 'free';
