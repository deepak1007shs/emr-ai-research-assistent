-- The single editable artifact: one study specification per protocol.
--
-- Documents are never stored as the source of truth; they are rendered from
-- `spec` on demand. `status` carries gate G0: nothing renders from a draft.

create table if not exists public.study_specs (
  id            uuid primary key default gen_random_uuid(),
  protocol_id   uuid not null references public.protocols (id) on delete cascade,
  review_id     uuid references public.reviews (id) on delete set null,
  owner         uuid not null references auth.users (id) on delete cascade,
  spec_version  text not null default '0.1.0',
  status        text not null default 'draft'
                  check (status in ('draft', 'signed', 'locked', 'failed')),
  spec          jsonb,
  validation    jsonb,
  model         text,
  usage         jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  signed_at     timestamptz
);

create index if not exists study_specs_owner_created_idx
  on public.study_specs (owner, created_at desc);
create index if not exists study_specs_protocol_idx
  on public.study_specs (protocol_id);

alter table public.study_specs enable row level security;

create policy study_specs_select on public.study_specs
  for select to authenticated using ((select auth.uid()) = owner);
create policy study_specs_insert on public.study_specs
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy study_specs_update on public.study_specs
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy study_specs_delete on public.study_specs
  for delete to authenticated using ((select auth.uid()) = owner);
