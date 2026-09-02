-- One row per build, so a build outlives the tab that asked for it.
--
-- Until now the work happened inside the response stream: the route opened a
-- ReadableStream and did the whole build inside it, so closing the tab killed
-- the build after the model had already been paid for. The work now runs in
-- after(), and this table is where it says what it is doing. A connection that
-- comes and goes reads this row; nothing depends on it staying open.

create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users (id) on delete cascade,
  protocol_id uuid not null references public.protocols (id) on delete cascade,
  -- One document, or a chain of them in order. 'all' starts at the review;
  -- 'documents' starts at the plan, for a protocol already reviewed and whose
  -- issues the investigator has already answered.
  kind        text not null check (kind in ('review', 'sap', 'crf', 'tables', 'all', 'documents')),
  status      text not null default 'running' check (status in ('running', 'done', 'failed')),
  -- The stage in hand, and the line the button shows under it.
  stage       text,
  step        text,
  -- What the run has finished so far: [{ kind, id, errors, warnings }].
  -- A chain that fails at its third stage still says what its first two made.
  produced    jsonb not null default '[]'::jsonb,
  usage       jsonb,
  cost        numeric,
  error       text,
  created_at  timestamptz not null default now(),
  -- Written at every step. A running job whose updated_at has stopped moving is
  -- a job whose server died, which is the only way after() work disappears.
  updated_at  timestamptz not null default now()
);

create index if not exists jobs_owner_created_idx on public.jobs (owner, created_at desc);
create index if not exists jobs_protocol_idx on public.jobs (protocol_id, created_at desc);

alter table public.jobs enable row level security;

create policy jobs_select on public.jobs
  for select to authenticated using ((select auth.uid()) = owner);
create policy jobs_insert on public.jobs
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy jobs_update on public.jobs
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy jobs_delete on public.jobs
  for delete to authenticated using ((select auth.uid()) = owner);
