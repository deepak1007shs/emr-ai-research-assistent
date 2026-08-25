-- The case report form, built after the analysis plan it must serve.

create table if not exists public.crf_forms (
  id          uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.protocols (id) on delete cascade,
  sap_id      uuid references public.sap_plans (id) on delete set null,
  owner       uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'ready' check (status in ('ready', 'failed')),
  spec        jsonb,
  validation  jsonb,
  model       text,
  usage       jsonb,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists crf_forms_owner_created_idx on public.crf_forms (owner, created_at desc);
create index if not exists crf_forms_protocol_idx on public.crf_forms (protocol_id);

alter table public.crf_forms enable row level security;

create policy crf_forms_select on public.crf_forms
  for select to authenticated using ((select auth.uid()) = owner);
create policy crf_forms_insert on public.crf_forms
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy crf_forms_update on public.crf_forms
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy crf_forms_delete on public.crf_forms
  for delete to authenticated using ((select auth.uid()) = owner);
