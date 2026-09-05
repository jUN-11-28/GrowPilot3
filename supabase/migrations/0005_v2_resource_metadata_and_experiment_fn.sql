-- v2 resource metadata + atomic experiment-result submission.
--
-- Additive only, same discipline as 0004: nullable columns, no backfill that
-- guesses at existing rows' state. Not applied to any database by this change.

-- ---------------------------------------------------------------------------
-- resources: minimum metadata to stop the Resource Agent (and the report)
-- from treating every catalogue row as equally "ready to use". Existing rows
-- get `availability = null` — "not classified yet", never a guessed value —
-- and the app falls back to a URL-presence heuristic for *display* only
-- (see src/lib/domain/resource-display.ts), which never writes back to the row.
-- ---------------------------------------------------------------------------
alter table public.resources
  add column availability text check (
    availability is null or availability in ('actionable', 'reference_only', 'needs_verification')
  ),
  add column cost_info jsonb,
  add column eligibility text,
  add column last_verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- submit_experiment_result: atomically records how a founder's execution of
-- next_experiment went AND starts the next diagnosis session, so a retry
-- (double click, network blip before the client saw the response) can never
-- create a duplicate experiment_runs row or a duplicate session.
--
-- security invoker (not definer): this runs under the caller's role, so the
-- table RLS policies from 0004 still apply — the explicit ownership checks
-- below are defense in depth, matching the rest of this codebase's pattern
-- (e.g. src/lib/data/projects.ts checks ownership again even though RLS
-- already scopes the query).
-- ---------------------------------------------------------------------------
create or replace function public.submit_experiment_result(
  p_source_result_id uuid,
  p_project_id uuid,
  p_user_id uuid,
  p_experiment_snapshot jsonb,
  p_execution_status text,
  p_outcome text,
  p_observed_result jsonb,
  p_interpretation text,
  p_evidence_refs jsonb,
  p_new_concern text,
  p_idempotency_key text,
  p_max_questions smallint,
  -- false = "저장만 하기": records the run but does not start a next round.
  -- A later call with the same idempotency_key and true=start can still
  -- start one — see the null-next_session_id branch below.
  p_start_next_session boolean default true
)
returns table (run_id uuid, next_session_id uuid, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_next_session_id uuid;
begin
  if not exists (
    select 1 from public.projects p where p.id = p_project_id and p.user_id = p_user_id
  ) then
    raise exception 'project % is not owned by user %', p_project_id, p_user_id;
  end if;

  if not exists (
    select 1 from public.diagnosis_results r
    where r.id = p_source_result_id and r.user_id = p_user_id and r.project_id = p_project_id
  ) then
    raise exception 'diagnosis result % is not owned by user % on project %',
      p_source_result_id, p_user_id, p_project_id;
  end if;

  insert into public.experiment_runs (
    source_result_id, project_id, user_id, experiment_snapshot, execution_status,
    outcome, observed_result, interpretation, evidence_refs, new_concern, idempotency_key
  ) values (
    p_source_result_id, p_project_id, p_user_id, p_experiment_snapshot, p_execution_status,
    p_outcome, p_observed_result, p_interpretation, p_evidence_refs, p_new_concern, p_idempotency_key
  )
  on conflict (source_result_id, idempotency_key) do nothing
  returning id, experiment_runs.next_session_id into v_run_id, v_next_session_id;

  if v_run_id is null then
    -- Someone already submitted this exact (result, idempotency_key) pair —
    -- the unique-index conflict above means this select sees the committed row.
    select id, experiment_runs.next_session_id into v_run_id, v_next_session_id
    from public.experiment_runs
    where source_result_id = p_source_result_id and idempotency_key = p_idempotency_key;
  end if;

  if v_next_session_id is not null then
    return query select v_run_id, v_next_session_id, false;
    return;
  end if;

  if not p_start_next_session then
    return query select v_run_id, null::uuid, false;
    return;
  end if;

  insert into public.diagnosis_sessions (project_id, user_id, max_questions)
  values (p_project_id, p_user_id, p_max_questions)
  returning id into v_next_session_id;

  update public.experiment_runs
  set next_session_id = v_next_session_id, updated_at = now()
  where id = v_run_id;

  return query select v_run_id, v_next_session_id, true;
end;
$$;

grant execute on function public.submit_experiment_result(
  uuid, uuid, uuid, jsonb, text, text, jsonb, text, jsonb, text, text, smallint, boolean
) to authenticated;
