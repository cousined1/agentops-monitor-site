-- Free-tier monthly run quota.
--
-- `plans.included_runs` and `plans.overage_per_1k` were seeded from day one
-- (migration 20260819230452, lines 132-135) but never read by any application
-- code. The pricing page advertises "10,000 runs / month" on the free tier and
-- "$1.00 per 1,000 runs after the first 500K (metered)" on Team, while ingest
-- enforced only a per-minute rate limit. A $0 customer could ingest without
-- limit, and Team overage was never measured, let alone billed.
--
-- SCOPE: the free tier only, by explicit decision.
--
--   * Free       -> hard-capped at plans.included_runs, because there is no
--                   revenue to lose and the cap is already advertised.
--   * Team/Ent   -> deliberately NOT enforced. There is no overage metering
--                   yet, so hard-blocking a paying customer at 500K would
--                   silently discard their ingest instead of billing them for
--                   it. Losing paying customers' telemetry is strictly worse
--                   than under-billing, so enforcement waits until the Stripe
--                   meter exists and overage can actually be charged.
--                   When that lands, widen the predicate below to
--                   `included_runs > 0` and emit a meter event on the excess.
--
-- The signature is UNCHANGED on purpose. `create or replace` keeps the same
-- (text, jsonb, integer) parameters, so applying this migration is safe, and
-- NOT applying it degrades to today's behaviour (no quota) rather than
-- breaking ingest with a PostgREST "function not found" error.
--
-- Failure posture: any error while resolving the plan fails OPEN (ingest
-- continues). A quota check must never be the reason a customer's telemetry
-- stops landing.

create or replace function public.ingest_agent_run(
  p_key_hash text,
  p_payload jsonb,
  p_rate_limit integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_api_key public.api_keys%rowtype;
  v_now timestamptz := clock_timestamp();
  v_request_count integer;
  v_run_id uuid;
  v_span_count integer := jsonb_array_length(coalesce(p_payload->'spans', '[]'::jsonb));
  v_plan_name text;
  v_included_runs bigint;
  v_runs_this_month bigint;
begin
  select key.*
  into v_api_key
  from public.api_keys as key
  where key.key_hash = p_key_hash
    and key.is_active = true;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_api_key',
      'message', 'Unknown or disabled API key.'
    );
  end if;

  insert into public.ingest_rate_limits (
    api_key_id,
    window_started_at,
    request_count
  ) values (
    v_api_key.id,
    date_trunc('minute', v_now),
    1
  )
  on conflict (api_key_id) do update
  set window_started_at = case
        when public.ingest_rate_limits.window_started_at = date_trunc('minute', v_now)
          then public.ingest_rate_limits.window_started_at
        else date_trunc('minute', v_now)
      end,
    request_count = case
        when public.ingest_rate_limits.window_started_at = date_trunc('minute', v_now)
          then public.ingest_rate_limits.request_count + 1
        else 1
      end
  returning request_count into v_request_count;

  if v_request_count > p_rate_limit then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'message', 'Ingest rate limit exceeded.'
    );
  end if;

  -- --- free-tier monthly quota -------------------------------------------
  -- runs_user_time_idx (user_id, started_at desc) already covers this count.
  -- Wrapped so that a plan/profile lookup failure fails open rather than
  -- rejecting ingest.
  begin
    select profile.current_plan_name
    into v_plan_name
    from public.profiles as profile
    where profile.id = v_api_key.user_id;

    if coalesce(v_plan_name, 'free') = 'free' then
      select plan.included_runs
      into v_included_runs
      from public.plans as plan
      where plan.name = 'free';

      -- included_runs <= 0 means "no configured cap"; treat it as unlimited
      -- rather than blocking every ingest.
      if v_included_runs is not null and v_included_runs > 0 then
        select count(*)
        into v_runs_this_month
        from public.runs as run
        where run.user_id = v_api_key.user_id
          and run.started_at >= date_trunc('month', v_now);

        if v_runs_this_month >= v_included_runs then
          return jsonb_build_object(
            'ok', false,
            'code', 'quota_exceeded',
            'message', format(
              'Monthly run limit reached (%s of %s runs). Upgrade your plan to keep ingesting.',
              v_runs_this_month,
              v_included_runs
            ),
            'runs_used', v_runs_this_month,
            'runs_included', v_included_runs
          );
        end if;
      end if;
    end if;
  exception
    when others then
      -- Fail open: never drop telemetry because the quota check itself broke.
      raise warning 'ingest_agent_run: quota check failed, allowing ingest: %', sqlerrm;
  end;

  insert into public.runs (
    user_id,
    api_key_id,
    external_id,
    agent_name,
    status,
    started_at,
    ended_at,
    duration_ms,
    tokens_in,
    tokens_out,
    cost_usd,
    span_count,
    metadata
  ) values (
    v_api_key.user_id,
    v_api_key.id,
    p_payload->>'external_id',
    p_payload->>'agent_name',
    p_payload->>'status',
    coalesce((p_payload->>'started_at')::timestamptz, v_now),
    (p_payload->>'ended_at')::timestamptz,
    (p_payload->>'duration_ms')::integer,
    (p_payload->>'tokens_in')::bigint,
    (p_payload->>'tokens_out')::bigint,
    (p_payload->>'cost_usd')::numeric,
    v_span_count,
    coalesce(p_payload->'metadata', '{}'::jsonb)
  )
  on conflict (user_id, external_id) do update
  set api_key_id = excluded.api_key_id,
      agent_name = excluded.agent_name,
      status = excluded.status,
      started_at = case
        when p_payload ? 'started_at' then excluded.started_at
        else runs.started_at
      end,
      ended_at = case
        when p_payload ? 'ended_at' then excluded.ended_at
        else runs.ended_at
      end,
      duration_ms = case
        when p_payload ? 'duration_ms' then excluded.duration_ms
        else runs.duration_ms
      end,
      tokens_in = excluded.tokens_in,
      tokens_out = excluded.tokens_out,
      cost_usd = excluded.cost_usd,
      span_count = excluded.span_count,
      metadata = excluded.metadata
  returning id into v_run_id;

  delete from public.spans where run_id = v_run_id;

  insert into public.spans (
    id,
    run_id,
    user_id,
    parent_id,
    span_type,
    provider,
    model,
    tool_name,
    status,
    started_at,
    duration_ms,
    tokens_in,
    tokens_out,
    cost_usd,
    input,
    output,
    error,
    metadata
  )
  select
    coalesce(nullif(span.value->>'id', '')::uuid, gen_random_uuid()),
    v_run_id,
    v_api_key.user_id,
    nullif(span.value->>'parent_id', '')::uuid,
    span.value->>'span_type',
    span.value->>'provider',
    span.value->>'model',
    span.value->>'tool_name',
    span.value->>'status',
    coalesce((span.value->>'started_at')::timestamptz, v_now),
    (span.value->>'duration_ms')::integer,
    (span.value->>'tokens_in')::bigint,
    (span.value->>'tokens_out')::bigint,
    (span.value->>'cost_usd')::numeric,
    coalesce(span.value->'input', '{}'::jsonb),
    coalesce(span.value->'output', '{}'::jsonb),
    span.value->'error',
    coalesce(span.value->'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_payload->'spans', '[]'::jsonb)) as span(value);

  insert into public.usage_events (user_id, run_id)
  values (v_api_key.user_id, v_run_id)
  on conflict (run_id) do nothing;

  update public.api_keys
  set last_used_at = v_now
  where id = v_api_key.id;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'span_count', v_span_count
  );
end;
$$;

revoke all on function public.ingest_agent_run(text, jsonb, integer) from public;
grant execute on function public.ingest_agent_run(text, jsonb, integer) to project_admin;