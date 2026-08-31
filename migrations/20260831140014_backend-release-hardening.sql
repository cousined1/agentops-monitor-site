alter table public.plans enable row level security;

drop policy if exists "public read plans" on public.plans;
create policy "public read plans" on public.plans
  for select to anon, authenticated
  using (true);

alter table public.spans add column if not exists user_id uuid;

update public.spans as span
set user_id = run.user_id
from public.runs as run
where run.id = span.run_id
  and span.user_id is null;

alter table public.spans alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spans_user_id_fkey'
      and conrelid = 'public.spans'::regclass
  ) then
    alter table public.spans
      add constraint spans_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end;
$$;

create index if not exists api_keys_user_idx on public.api_keys (user_id);
create index if not exists runs_api_key_idx on public.runs (api_key_id);
create index if not exists spans_parent_idx on public.spans (parent_id);
create index if not exists spans_user_idx on public.spans (user_id);
create index if not exists usage_run_idx on public.usage_events (run_id);

drop policy if exists "own spans" on public.spans;
create policy "own spans" on public.spans
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop function if exists public.run_owned_by_uid(uuid);
