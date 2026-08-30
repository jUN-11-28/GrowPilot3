-- Project attachments: business plan / financials / concerns / verification
-- results, as an uploaded file (incl. photos) and/or a plain note. Attached to
-- a project (not a session) so every diagnosis round for that project sees it.

create table public.project_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (
    kind in ('business_plan', 'financials', 'concern', 'verification', 'other')
  ),
  note text check (note is null or char_length(btrim(note)) between 1 and 4000),
  file_name text,
  mime_type text,
  storage_path text,
  byte_size integer check (byte_size is null or byte_size > 0),
  created_at timestamptz not null default now(),
  -- at least one of a note or a file must be present
  check (note is not null or storage_path is not null)
);

create index project_attachments_project_idx
  on public.project_attachments (project_id, created_at desc);

alter table public.project_attachments enable row level security;

create policy "project_attachments_select_own" on public.project_attachments
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "project_attachments_insert_own" on public.project_attachments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

create policy "project_attachments_delete_own" on public.project_attachments
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- storage: private bucket, one folder per user (`${user_id}/${project_id}/...`)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  15728640,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do nothing;

create policy "attachments_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "attachments_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "attachments_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
