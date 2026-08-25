-- The analysis model behind a Statistical Analysis Plan.
-- One per protocol; the document is rendered from `spec` on demand.

create table if not exists public.sap_plans (
  id          uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.protocols (id) on delete cascade,
  review_id   uuid references public.reviews (id) on delete set null,
  owner       uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'ready' check (status in ('ready', 'failed')),
  spec        jsonb,
  model       text,
  usage       jsonb,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists sap_plans_owner_created_idx on public.sap_plans (owner, created_at desc);
create index if not exists sap_plans_protocol_idx on public.sap_plans (protocol_id);

alter table public.sap_plans enable row level security;

create policy sap_plans_select on public.sap_plans
  for select to authenticated using ((select auth.uid()) = owner);
create policy sap_plans_insert on public.sap_plans
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy sap_plans_update on public.sap_plans
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy sap_plans_delete on public.sap_plans
  for delete to authenticated using ((select auth.uid()) = owner);

-- The gate findings, stored with the plan so a problem is visible before download.
alter table public.sap_plans
  add column if not exists validation jsonb;
