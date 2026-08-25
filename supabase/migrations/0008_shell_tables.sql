-- Every table the study will report, with the cells empty.

create table if not exists public.shell_tables (
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

create index if not exists shell_tables_owner_created_idx on public.shell_tables (owner, created_at desc);
create index if not exists shell_tables_protocol_idx on public.shell_tables (protocol_id);

alter table public.shell_tables enable row level security;

create policy shell_tables_select on public.shell_tables
  for select to authenticated using ((select auth.uid()) = owner);
create policy shell_tables_insert on public.shell_tables
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy shell_tables_update on public.shell_tables
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy shell_tables_delete on public.shell_tables
  for delete to authenticated using ((select auth.uid()) = owner);
