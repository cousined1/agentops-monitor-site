-- ============================================================
-- AgentOps Monitor — lead capture table (AUDIT-RUN-20260930-202741)
--
-- Audit finding: FINDING-api-surface-001 / FINDING-H-002 (Critical).
-- POST /api/leads validated every field carefully and then discarded
-- the submission: it logged a one-way sha256(email) prefix plus a
-- company character count and returned {"status":"ok"}. The chatbot
-- tells the visitor "Our team will reach out within 24 hours", so every
-- inbound sales lead was silently and irrecoverably destroyed. The
-- hash is not reversible, so the leads could not be recovered from
-- Railway logs either.
--
-- This table gives the endpoint somewhere real to write. It follows the
-- exact pattern of billing_processed_events (20260911000000): RLS on,
-- no anon/authenticated privileges, explicit project_admin policy. Only
-- the server-side admin key can write, so this stays server-only.
--
-- GDPR note: this stores the email the visitor deliberately submitted in
-- order to be contacted. That is the lawful basis for retention, and it
-- is what public/privacy.html already claims happens — the notice was
-- false only because the write never existed. Retention/deletion is a
-- separate follow-up (see FINDING-H-004 / the privacy remediation item);
-- do not extend this table's use without revisiting that.
-- ============================================================

create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  company      text,
  source       text,
  product      text,
  conversation jsonb,
  created_at   timestamptz not null default now()
);

-- The endpoint is the only writer and it always supplies email; the
-- index supports the "newest leads for follow-up" query the team runs by
-- hand until a CRM integration exists.
create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

revoke all privileges on table public.leads from anon, authenticated;

create policy "project admin manages leads"
  on public.leads
  for all to project_admin
  using (true)
  with check (true);
