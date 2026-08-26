-- A proposed change to a document, and what became of it.
--
-- The artifact tables are insert-only, so accepting a revision inserts a new
-- row there exactly as a rebuild does. What was missing was the note saying
-- why that row exists: what was asked for, what changed, and what the document
-- looked like before. A supervisor can ask that of any document now.

create table if not exists public.revisions (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users (id) on delete cascade,
  protocol_id  uuid not null references public.protocols (id) on delete cascade,
  document     text not null check (document in ('sap', 'crf', 'tables')),
  -- The row this was proposed against. Kept even after that row is superseded,
  -- so the chain reads back.
  from_id      uuid,
  -- The plan whose registry the wording was copied from. Accepting must record
  -- this rather than whichever plan is current, or a form built against an
  -- older registry would be marked up to date.
  based_on_sap_id uuid,
  instruction  text not null,
  summary      text,
  spec         jsonb,
  validation   jsonb,
  changed      jsonb,
  status       text not null default 'proposed'
                 check (status in ('proposed', 'accepted', 'discarded', 'needs_rebuild')),
  -- The artifact row that accepting this created.
  accepted_id  uuid,
  model        text,
  usage        jsonb,
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);

create index if not exists revisions_owner_created_idx
  on public.revisions (owner, created_at desc);
create index if not exists revisions_protocol_document_idx
  on public.revisions (protocol_id, document, created_at desc);

alter table public.revisions enable row level security;

create policy "revisions are readable by their owner"
  on public.revisions for select to authenticated
  using ((select auth.uid()) = owner);

create policy "revisions are insertable by their owner"
  on public.revisions for insert to authenticated
  with check ((select auth.uid()) = owner);

create policy "revisions are updatable by their owner"
  on public.revisions for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

create policy "revisions are deletable by their owner"
  on public.revisions for delete to authenticated
  using ((select auth.uid()) = owner);
