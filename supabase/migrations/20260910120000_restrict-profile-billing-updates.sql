-- ============================================================
-- AgentOps Monitor — lock billing columns on profiles (DELTA-001)
--
-- Audit: audit/08-delta-review.md (DELTA-001, Medium).
--
-- Problem: the 20260820060710 hardening migration granted table-level
-- INSERT and UPDATE on public.profiles to `authenticated`. The billing
-- migration (20260903100000) then added stripe_customer_id and the
-- subscription columns to the same table, so any signed-in user could
-- set their own stripe_customer_id to another user's customer id. The
-- webhook resolves profiles by customer id (billing.ts
-- getProfileByCustomerId), which would then sync the other user's plan
-- onto the attacker's profile (the unique partial index blocks the real
-- owner's sync), and /api/billing/portal would open the Stripe portal
-- for that customer.
--
-- Fix: revoke the table-level INSERT/UPDATE and re-grant them
-- column-scoped so billing columns are admin/webhook-write-only
-- (createAdminClient uses the admin key and bypasses grants, so
-- src/lib/billing.ts is unaffected).
--
-- App writes covered by the INSERT grant: the signup/verify server
-- action upserts {id, email, full_name, company} (src/app/signup/
-- page.tsx:96,132). updated_at is granted for forward compatibility.
-- ============================================================

revoke insert, update on table public.profiles from authenticated;

grant insert (id, email, full_name, company, updated_at)
  on table public.profiles to authenticated;

grant update (email, full_name, company, updated_at)
  on table public.profiles to authenticated;
