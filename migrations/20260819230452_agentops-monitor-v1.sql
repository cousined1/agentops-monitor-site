-- ============================================================
-- AgentOps Monitor — v1 schema
-- InsForge provides the PostgreSQL database (auth.users etc.)
-- Scope: profiles, api_keys, runs, spans, usage_events, plus seed plans
-- Deferred to v2: subscriptions/budgets tables (Stripe + budgets UI later)
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  company       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.plans (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  stripe_price_id   text,
  included_runs     bigint not null default 0,
  price_usd_cents   integer not null default 0,
  overage_per_1k    integer not null default 0,
  created_at        timestamptz not null default now()
);

create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  key_prefix    text not null,
  key_hash      text not null unique,
  name          text not null default 'default',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create unique index if not exists api_keys_hash_idx on public.api_keys (key_hash);

create table if not exists public.runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  api_key_id    uuid references public.api_keys(id) on delete set null,
  external_id   text not null,
  agent_name    text not null,
  status        text not null default 'running',
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_ms   integer,
  span_count    integer not null default 0,
  tokens_in     bigint not null default 0,
  tokens_out    bigint not null default 0,
  cost_usd      numeric(12,4) not null default 0,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  constraint runs_external_id_unique unique (user_id, external_id)
);
create index if not exists runs_user_time_idx on public.runs (user_id, started_at desc);
create index if not exists runs_agent_idx    on public.runs (user_id, agent_name);

create table if not exists public.spans (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.runs(id) on delete cascade,
  parent_id   uuid references public.spans(id) on delete cascade,
  span_type   text not null,
  provider    text,
  model       text,
  tool_name   text,
  status      text not null default 'ok',
  started_at  timestamptz not null default now(),
  duration_ms integer,
  tokens_in   bigint not null default 0,
  tokens_out  bigint not null default 0,
  cost_usd    numeric(12,4) not null default 0,
  input       jsonb not null default '{}'::jsonb,
  output      jsonb not null default '{}'::jsonb,
  error       jsonb,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists spans_run_idx  on public.spans (run_id);
create index if not exists spans_tool_idx on public.spans (tool_name);

create table if not exists public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  run_id      uuid references public.runs(id) on delete set null,
  occurred_at timestamptz not null default now(),
  recorded    boolean not null default false
);
create index if not exists usage_user_time_idx on public.usage_events (user_id, occurred_at desc);

alter table public.profiles       enable row level security;
alter table public.api_keys       enable row level security;
alter table public.runs           enable row level security;
alter table public.spans          enable row level security;
alter table public.usage_events   enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own api_keys" on public.api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own runs" on public.runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.run_owned_by_uid(run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.runs r
    where r.id = run_id and r.user_id = auth.uid()
  );
$$;

revoke all on function public.run_owned_by_uid(uuid) from public;
grant execute on function public.run_owned_by_uid(uuid) to authenticated;

create policy "own spans" on public.spans
  for all using (public.run_owned_by_uid(run_id))
  with check (public.run_owned_by_uid(run_id));

create policy "own usage" on public.usage_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.plans (name, stripe_price_id, included_runs, price_usd_cents, overage_per_1k) values
  ('free',       null, 10000,      0,     0),
  ('team',       null, 500000,     29900, 100),
  ('enterprise', null, 0,          200000, 0),
  ('overage',    null, 0,          0,     0)
on conflict (name) do nothing;