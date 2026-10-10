-- ============================================================
-- AgentOps Monitor — Stripe billing fields on profiles
--
-- DATA-003 (audit 2026-09-15): restored into migrations/ — this migration
-- was applied to the production DB on 2026-09-03 but only existed under
-- supabase/migrations/, leaving a gap in the canonical replay chain.
-- Filename matches the remote migration record (stripe-billing-fields).

-- Adds subscription state to profiles; plans.stripe_price_id
-- already exists (seeded null — real price IDs come from the
-- Stripe dashboard or the setup script).
-- ============================================================

alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists current_plan_name  text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end  timestamptz;

create unique index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- profiles RLS already exists ("own profile" policy); the webhook
-- writes via the admin key which bypasses RLS.