-- ============================================================
-- AgentOps Monitor — webhook event idempotency ledger (DELTA-005)
--
-- Audit: audit/08-delta-review.md. Stripe retries deliveries on non-2xx;
-- the webhook now fails closed (500) on handler errors, so repeated
-- deliveries are expected. This ledger lets the webhook short-circuit
-- already-processed events instead of re-running their effects.
--
-- Row lifecycle: the webhook inserts one row per verified event after
-- successful processing (via the admin key, which bypasses RLS and
-- grants). event_id is the Stripe event id (globally unique, evt_...).
--
-- Pattern follows ingest_rate_limits (20260831141600): RLS on, no
-- anon/authenticated privileges, explicit project_admin policy. The
-- applying role owns the table and therefore also bypasses RLS.
-- ============================================================

create table if not exists public.billing_processed_events (
  event_id    text primary key,
  event_type  text not null,
  received_at timestamptz not null default now()
);

alter table public.billing_processed_events enable row level security;

revoke all privileges on table public.billing_processed_events from anon, authenticated;

create policy "project admin manages billing processed events"
  on public.billing_processed_events
  for all to project_admin
  using (true)
  with check (true);
