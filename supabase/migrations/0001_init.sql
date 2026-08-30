-- GrowPilot MVP schema
-- Every user-owned table carries user_id and is protected by RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  problem text not null check (char_length(btrim(problem)) between 1 and 4000),
  target_customer text not null check (char_length(btrim(target_customer)) between 1 and 2000),
  solution text not null check (char_length(btrim(solution)) between 1 and 4000),
  stage text not null check (
    stage in (
      'idea',
      'problem_validation',
      'mvp_building',
      'mvp_launched',
      'users',
      'revenue',
      'growth'
    )
  ),
  evidence text[] not null default '{}' check (
    evidence <@ array[
      'customer_interviews',
      'surveys',
      'mvp',
      'real_users',
      'signup_data',
      'payment_data',
      'revenue',
      'retention',
      'customer_feedback',
      'none'
    ]::text[]
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_created_idx on public.projects (user_id, created_at desc);

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- diagnosis_sessions
-- ---------------------------------------------------------------------------
create table public.diagnosis_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'questioning' check (
    status in ('questioning', 'analyzing', 'completed', 'failed')
  ),
  max_questions smallint not null default 8 check (max_questions between 1 and 8),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index diagnosis_sessions_project_idx
  on public.diagnosis_sessions (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- diagnosis_answers
-- One row per question. The row is written when the question is generated and
-- updated when the user answers, so a reloaded session resumes exactly where it
-- left off.
-- ---------------------------------------------------------------------------
create table public.diagnosis_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.diagnosis_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  order_index smallint not null check (order_index between 1 and 8),
  question text not null,
  question_reason text,
  question_type text not null default 'text' check (
    question_type in ('text', 'single_choice')
  ),
  options jsonb not null default '[]'::jsonb,
  answer text,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, order_index)
);

create index diagnosis_answers_session_idx
  on public.diagnosis_answers (session_id, order_index);

-- ---------------------------------------------------------------------------
-- diagnosis_results
-- Free-form agent output is kept in JSONB; the fields the report always renders
-- are promoted to columns.
-- ---------------------------------------------------------------------------
create table public.diagnosis_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.diagnosis_sessions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  current_stage text not null check (
    current_stage in ('problem', 'solution', 'validation', 'pmf', 'growth')
  ),
  stage_confidence smallint not null check (stage_confidence between 0 and 100),
  evidence_confidence smallint not null check (evidence_confidence between 0 and 100),
  critical_bottleneck text not null,
  bottleneck_reason text not null,
  supporting_evidence jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  lean_analyst_opinion text not null,
  red_team_counterargument text not null,
  next_experiment jsonb not null,
  recommended_resource_ids uuid[] not null default '{}',
  agent_trace jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index diagnosis_results_project_idx
  on public.diagnosis_results (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- resources — a shared, read-only catalogue (not user data)
-- ---------------------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  url text,
  -- 'expert' / 'tool' 은 실험을 실행하는 데 필요한 사람과 도구,
  -- 나머지는 판단에 필요한 지식 자원이다. 리포트는 이 셋으로 묶어 보여준다.
  resource_type text not null check (
    resource_type in (
      'book',
      'article',
      'framework',
      'template',
      'video',
      'tool',
      'expert'
    )
  ),
  stage_tags text[] not null default '{}',
  bottleneck_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index resources_stage_tags_idx on public.resources using gin (stage_tags);
create index resources_bottleneck_tags_idx on public.resources using gin (bottleneck_tags);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.diagnosis_sessions enable row level security;
alter table public.diagnosis_answers enable row level security;
alter table public.diagnosis_results enable row level security;
alter table public.resources enable row level security;

-- profiles: a user sees and edits only their own profile. Inserts come from the
-- security-definer trigger above, so no insert policy is granted.
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- projects
create policy "projects_select_own" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "projects_insert_own" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "projects_update_own" on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "projects_delete_own" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);

-- diagnosis_sessions: own row *and* the project must be owned by the same user,
-- so a forged project_id cannot attach a session to someone else's project.
create policy "diagnosis_sessions_select_own" on public.diagnosis_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "diagnosis_sessions_insert_own" on public.diagnosis_sessions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

create policy "diagnosis_sessions_update_own" on public.diagnosis_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "diagnosis_sessions_delete_own" on public.diagnosis_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- diagnosis_answers
create policy "diagnosis_answers_select_own" on public.diagnosis_answers
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "diagnosis_answers_insert_own" on public.diagnosis_answers
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.diagnosis_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

create policy "diagnosis_answers_update_own" on public.diagnosis_answers
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "diagnosis_answers_delete_own" on public.diagnosis_answers
  for delete to authenticated using ((select auth.uid()) = user_id);

-- diagnosis_results
create policy "diagnosis_results_select_own" on public.diagnosis_results
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "diagnosis_results_insert_own" on public.diagnosis_results
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.diagnosis_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

create policy "diagnosis_results_delete_own" on public.diagnosis_results
  for delete to authenticated using ((select auth.uid()) = user_id);

-- resources: shared catalogue, readable by any signed-in user, writable by none.
create policy "resources_select_authenticated" on public.resources
  for select to authenticated using (true);
