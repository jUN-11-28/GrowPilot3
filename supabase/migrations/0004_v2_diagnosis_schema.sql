-- v2 diagnosis schema: additive only.
--
-- Nothing here is dropped, renamed, or backfilled destructively. Every new
-- column is nullable (or has a default that preserves existing behaviour), so
-- every row written by the pre-v2 pipeline keeps reading exactly as before —
-- schema_version defaults to 1 and report_v2 stays null until Stage 2's
-- pipeline change starts writing v2 rows. This migration only prepares the
-- schema; it does not switch anything over.
--
-- Not applied to any database by this change — see the completion report for
-- the apply order (local/dev first, never straight to a shared/prod DB).

-- ---------------------------------------------------------------------------
-- projects: technical context the v2 prompts need (technology type, business
-- model, execution constraints) that the current intake form doesn't collect.
-- Structured as JSONB with server-side (Zod) validation on write, not a SQL
-- CHECK, so shape changes don't require a migration each time — see
-- src/lib/ai/schemas-v2.ts's TechnicalContext / ExecutionConstraints.
-- ---------------------------------------------------------------------------
alter table public.projects
  add column technical_context jsonb,
  add column execution_constraints jsonb;

-- ---------------------------------------------------------------------------
-- diagnosis_sessions: question-batch generation state (separate from
-- session `status`, which is about the overall run) and an analysis-run
-- lease, both needed so a duplicate/late request cannot regenerate the
-- interview or clobber an in-flight or already-completed analysis. Stage 4
-- wires the actual locking logic; this migration only adds the columns.
-- ---------------------------------------------------------------------------
alter table public.diagnosis_sessions
  add column question_status text not null default 'pending' check (
    question_status in ('pending', 'generating', 'completed', 'failed')
  ),
  add column question_run_id uuid,
  add column question_started_at timestamptz,
  add column analysis_run_id uuid,
  add column analysis_lock_expires_at timestamptz;

-- Backfill: a session that already has questions (or has moved past
-- "questioning") was already generated under the old code path, including
-- the zero-question case where a session went straight to analyzing.
update public.diagnosis_sessions s
set question_status = 'completed'
where question_status = 'pending'
  and (
    exists (select 1 from public.diagnosis_answers a where a.session_id = s.id)
    or s.status in ('analyzing', 'completed', 'failed')
  );

-- ---------------------------------------------------------------------------
-- diagnosis_results: v2 report + version metadata.
--
-- current_stage / stage_confidence / evidence_confidence become nullable —
-- v2 allows current_stage = null when no evidence supports ranking a stage,
-- and v2 has no percentage-confidence field at all. A `CHECK (x IN (...))`
-- already passes on NULL in Postgres, so the existing enum CHECKs on
-- current_stage need no change.
-- ---------------------------------------------------------------------------
alter table public.diagnosis_results
  alter column current_stage drop not null,
  alter column stage_confidence drop not null,
  alter column evidence_confidence drop not null,
  add column schema_version smallint not null default 1 check (schema_version in (1, 2)),
  add column report_v2 jsonb,
  add column input_snapshot jsonb,
  add column prompt_version text,
  add column model_version text,
  add constraint diagnosis_results_v2_report_matches_version check (
    (schema_version = 1 and report_v2 is null)
    or (schema_version = 2 and report_v2 is not null)
  );

-- ---------------------------------------------------------------------------
-- experiment_runs: how a founder's execution of a previously issued
-- next_experiment turns into evidence for the *next* diagnosis round.
-- Linked to the diagnosis_results row it reports on (not directly to a
-- session), since a result's next_experiment is what is actually being
-- executed and verified.
-- ---------------------------------------------------------------------------
create table public.experiment_runs (
  id uuid primary key default gen_random_uuid(),
  source_result_id uuid not null references public.diagnosis_results (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Frozen copy of next_experiment at issue time, so a later re-diagnosis
  -- never changes what an in-flight or already-reported run is judged against.
  experiment_snapshot jsonb not null,
  execution_status text not null default 'not_started' check (
    execution_status in ('not_started', 'in_progress', 'completed', 'stopped')
  ),
  -- Whether the run supports/contradicts/leaves inconclusive its hypothesis —
  -- kept separate from the founder's own `interpretation`, which is a claim,
  -- not a fact the system has verified.
  outcome text check (
    outcome is null or outcome in ('supports', 'does_not_support', 'inconclusive', 'incomplete')
  ),
  observed_result jsonb,
  interpretation text check (
    interpretation is null or char_length(btrim(interpretation)) between 1 and 4000
  ),
  evidence_refs jsonb,
  new_concern text check (
    new_concern is null or char_length(btrim(new_concern)) between 1 and 4000
  ),
  -- Scoped per source result: a retried submission for the same result with
  -- the same key must not create a second row or a second next_session_id.
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  next_session_id uuid references public.diagnosis_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_result_id, idempotency_key)
);

create index experiment_runs_project_idx
  on public.experiment_runs (project_id, created_at desc);

create trigger experiment_runs_set_updated_at
before update on public.experiment_runs
for each row execute function public.set_updated_at();

alter table public.experiment_runs enable row level security;

create policy "experiment_runs_select_own" on public.experiment_runs
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "experiment_runs_insert_own" on public.experiment_runs
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.diagnosis_results r
      where r.id = source_result_id
        and r.user_id = (select auth.uid())
        and r.project_id = project_id
    )
  );

create policy "experiment_runs_update_own" on public.experiment_runs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
