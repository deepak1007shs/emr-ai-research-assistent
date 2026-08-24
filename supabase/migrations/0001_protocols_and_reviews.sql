-- Step 1 schema: an uploaded protocol, and the review generated from it.

create table if not exists public.protocols (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users (id) on delete cascade,
  filename     text not null,
  storage_path text,
  mime         text,
  char_count   integer,
  created_at   timestamptz not null default now()
);

create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  protocol_id  uuid not null references public.protocols (id) on delete cascade,
  owner        uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'complete', 'failed')),
  spec         jsonb,
  markdown     text,
  model        text,
  usage        jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists protocols_owner_created_idx
  on public.protocols (owner, created_at desc);
create index if not exists reviews_owner_created_idx
  on public.reviews (owner, created_at desc);
create index if not exists reviews_protocol_idx
  on public.reviews (protocol_id);

alter table public.protocols enable row level security;
alter table public.reviews   enable row level security;

-- `(select auth.uid())` rather than a bare call: it is evaluated once per
-- statement instead of once per row.

create policy protocols_select on public.protocols
  for select to authenticated using ((select auth.uid()) = owner);
create policy protocols_insert on public.protocols
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy protocols_update on public.protocols
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy protocols_delete on public.protocols
  for delete to authenticated using ((select auth.uid()) = owner);

create policy reviews_select on public.reviews
  for select to authenticated using ((select auth.uid()) = owner);
create policy reviews_insert on public.reviews
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy reviews_update on public.reviews
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy reviews_delete on public.reviews
  for delete to authenticated using ((select auth.uid()) = owner);
