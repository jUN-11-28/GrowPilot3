-- Evidence records: what a founder actually registered as detail for one
-- selected Evidence 종류 (customer interviews, MVP, revenue, ...) — separate
-- from project_attachments' coarse categories (business_plan/financials/
-- concern/verification/other/evidence). A record can carry free text,
-- zero-or-more linked attachments (via evidence_record_attachments — files
-- are never copied, only linked), an AI-extracted draft, and the founder's
-- own confirmed summary, kept in separate columns so the AI can never
-- overwrite what the founder wrote or confirmed.
--
-- Additive only, same discipline as 0004/0005: nullable/defaulted columns,
-- no backfill that guesses at existing rows' state. Not applied to any
-- database by this change — see the completion report for apply order.

-- ---------------------------------------------------------------------------
-- project_attachments: allow a new 'evidence' kind for files uploaded
-- through the evidence-record flow. Existing kinds/rows are untouched —
-- this only widens the allowed set.
-- ---------------------------------------------------------------------------
alter table public.project_attachments
  drop constraint project_attachments_kind_check,
  add constraint project_attachments_kind_check check (
    kind in ('business_plan', 'financials', 'concern', 'verification', 'other', 'evidence')
  );

-- ---------------------------------------------------------------------------
-- evidence_records
-- ---------------------------------------------------------------------------
create table public.evidence_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'none' has no detail to record — it is never a valid value here.
  evidence_type text not null check (
    evidence_type in (
      'customer_interviews',
      'surveys',
      'mvp',
      'real_users',
      'signup_data',
      'payment_data',
      'revenue',
      'retention',
      'customer_feedback'
    )
  ),
  -- Always server-populated (user title, or a generated fallback from the
  -- file name / evidence type) — never left blank.
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- The founder's own original text. Never touched by an AI write.
  body text check (body is null or char_length(btrim(body)) between 1 and 20000),
  -- Founder-declared/confirmed date · target · headcount facts only — never
  -- AI-guessed. A missing key (or null) means "모름", not zero.
  user_context jsonb not null default '{}'::jsonb,
  analysis_status text not null default 'not_analyzed' check (
    analysis_status in ('not_analyzed', 'analyzing', 'completed', 'failed')
  ),
  -- Analysis-run lease, same shape as diagnosis_sessions' question/analysis
  -- locks (service.ts) — claimed by the one request allowed to call the model.
  analysis_run_id uuid,
  analysis_lock_expires_at timestamptz,
  -- The model's own extraction (EvidenceRecordDraftV2). Only a fresh analysis
  -- run may write this column — a founder's edit never lands here.
  ai_draft jsonb,
  ai_draft_prompt_version text,
  ai_draft_model_version text,
  -- source_version at analysis time, so the UI/pipeline can tell "this draft
  -- was extracted before the latest edit" without deleting the draft.
  ai_draft_source_version integer,
  -- The founder's own confirmed/edited version of the extraction. Confirming
  -- is the founder saying "this reads correctly" — not an objective
  -- verification, so callers must not treat it as one.
  user_confirmed_summary jsonb,
  confirmed_at timestamptz,
  -- source_version this confirmation was made against; a later body/file edit
  -- makes source_version > confirmed_source_version, which is how the UI and
  -- the diagnosis pipeline detect a stale confirmation.
  confirmed_source_version integer,
  -- Bumped whenever title/body/user_context changes or an attachment is
  -- linked/unlinked. Never bumped by an AI-only write.
  source_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evidence_records_confirmed_needs_summary check (
    (confirmed_at is null and confirmed_source_version is null)
    or (confirmed_at is not null and confirmed_source_version is not null and user_confirmed_summary is not null)
  )
);

create index evidence_records_project_idx
  on public.evidence_records (project_id, evidence_type, created_at desc);

create trigger evidence_records_set_updated_at
before update on public.evidence_records
for each row execute function public.set_updated_at();

alter table public.evidence_records enable row level security;

create policy "evidence_records_select_own" on public.evidence_records
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "evidence_records_insert_own" on public.evidence_records
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

create policy "evidence_records_update_own" on public.evidence_records
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "evidence_records_delete_own" on public.evidence_records
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- evidence_record_attachments: many-to-many link, no file duplication. The
-- same project_attachments row can be linked from more than one evidence
-- record and keeps working from the plain attachments panel either way —
-- deleting a record only removes the link (on delete cascade on the
-- evidence_record side), never the underlying attachment or its storage
-- object.
-- ---------------------------------------------------------------------------
create table public.evidence_record_attachments (
  evidence_record_id uuid not null references public.evidence_records (id) on delete cascade,
  attachment_id uuid not null references public.project_attachments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (evidence_record_id, attachment_id)
);

create index evidence_record_attachments_attachment_idx
  on public.evidence_record_attachments (attachment_id);

alter table public.evidence_record_attachments enable row level security;

create policy "evidence_record_attachments_select_own" on public.evidence_record_attachments
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "evidence_record_attachments_insert_own" on public.evidence_record_attachments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.evidence_records r
      where r.id = evidence_record_id and r.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.project_attachments a
      where a.id = attachment_id and a.user_id = (select auth.uid())
    )
  );

create policy "evidence_record_attachments_delete_own" on public.evidence_record_attachments
  for delete to authenticated using ((select auth.uid()) = user_id);
