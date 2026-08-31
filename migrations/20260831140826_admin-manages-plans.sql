create policy "project admin manages plans" on public.plans
  for all to project_admin
  using (true)
  with check (true);
