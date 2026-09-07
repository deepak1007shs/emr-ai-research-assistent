-- A dataset somebody has already collected, attached to a protocol.
--
-- The uploaded file is kept exactly as it arrived, and the cleaned workbook is
-- kept beside it, because the point of the change log is that a reader can go
-- back to the original and check it. Deleting either would make the log a
-- claim rather than evidence.
--
-- A protocol may have several: data arrives in instalments, and the newest
-- ready row wins, as every other artifact in this application resolves.

create table if not exists public.datasets (
  id            uuid primary key default gen_random_uuid(),
  protocol_id   uuid not null references public.protocols (id) on delete cascade,
  owner         uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending', 'ready', 'failed')),
  filename      text not null,
  mime          text,
  -- The file as uploaded, and the four-sheet workbook built from it.
  storage_path  text,
  cleaned_path  text,
  -- Which sheet was read and which of its rows held the headers. Recorded
  -- because both are judgements, and a wrong one is corrected by changing this
  -- rather than by editing the file.
  sheet         text,
  header_row    integer,
  row_count     integer,
  -- What the columns look like, what the model made of them, and what only the
  -- investigator can settle.
  profile       jsonb,
  mapping       jsonb,
  findings      jsonb,
  change_count  integer,
  model         text,
  usage         jsonb,
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists datasets_owner_created_idx on public.datasets (owner, created_at desc);
create index if not exists datasets_protocol_idx on public.datasets (protocol_id);

alter table public.datasets enable row level security;

create policy datasets_select on public.datasets
  for select to authenticated using ((select auth.uid()) = owner);
create policy datasets_insert on public.datasets
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy datasets_update on public.datasets
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy datasets_delete on public.datasets
  for delete to authenticated using ((select auth.uid()) = owner);

-- Private bucket, stored as `{user_id}/{dataset_id}/{filename}`, so the first
-- path segment is what the policies check. 25 MB: a spreadsheet of a thesis's
-- size is a few hundred kilobytes, and anything near the limit is a mistake.

insert into storage.buckets (id, name, public, file_size_limit)
values ('datasets', 'datasets', false, 26214400)
on conflict (id) do nothing;

create policy dataset_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy dataset_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy dataset_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
