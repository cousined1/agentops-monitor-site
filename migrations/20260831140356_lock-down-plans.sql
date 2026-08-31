drop policy if exists "public read plans" on public.plans;
revoke select on table public.plans from anon, authenticated;
