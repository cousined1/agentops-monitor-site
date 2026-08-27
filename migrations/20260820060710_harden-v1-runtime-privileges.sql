grant usage on schema public to anon, authenticated;

revoke all privileges on table public.plans from anon, authenticated;
revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges on table public.api_keys from anon, authenticated;
revoke all privileges on table public.runs from anon, authenticated;
revoke all privileges on table public.spans from anon, authenticated;
revoke all privileges on table public.usage_events from anon, authenticated;

grant select on table public.plans to anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;

grant select (id, user_id, key_prefix, name, is_active, created_at, last_used_at)
  on table public.api_keys to authenticated;
grant insert (user_id, key_prefix, key_hash, name)
  on table public.api_keys to authenticated;
grant update (name, is_active)
  on table public.api_keys to authenticated;
grant delete on table public.api_keys to authenticated;

grant select on table public.runs to authenticated;
grant select on table public.spans to authenticated;
grant select on table public.usage_events to authenticated;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "own api_keys" on public.api_keys;
create policy "own api_keys" on public.api_keys
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own runs" on public.runs;
create policy "own runs" on public.runs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own spans" on public.spans;
create policy "own spans" on public.spans
  for all to authenticated
  using (public.run_owned_by_uid(run_id))
  with check (public.run_owned_by_uid(run_id));

drop policy if exists "own usage" on public.usage_events;
create policy "own usage" on public.usage_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
