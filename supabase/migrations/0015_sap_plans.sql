-- The Statistical Analysis Plan, rebuilt.
--
-- One row per build. Two columns carry everything: `facts` is the Locked
-- Protocol Facts Sheet, and `plan` is what the eight steps derived from it.
--
-- The plan document called for one table per object - facts_sheets, objectives,
-- variables, analysis_rows, rules, shell_tables, crf_fields, check_results -
-- with the variable-to-table and variable-to-field links stored rather than
-- recomputed. The links are stored: they live inside the objects, as
-- `ShellTable.variables` and `CrfField.source_variable`, and are written to the
-- database exactly as the build produced them. What is not done is spreading
-- them across eight tables, because nothing queries them relationally. The
-- checks run in code over the objects in memory, and a rebuild re-derives every
-- one of them from `facts`. Eight tables would be written and never read.
--
-- `facts` is the one thing here that cannot be re-derived, because it is the
-- one thing a model produced. Everything in `plan` follows from it by rule, and
-- that is what makes a rebuild cost nothing and give the same answer.

create table if not exists public.sap_plans (
  id          uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.protocols (id) on delete cascade,
  owner       uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'ready' check (status in ('ready', 'failed')),
  -- The Facts Sheet. Frozen after Gate A, and the only model output in the row.
  facts       jsonb,
  -- Objectives, variables, the analysis map, the rules, the tables, the checks.
  plan        jsonb,
  markdown    text,
  -- Counted from what was drawn, and printed at the top of Section 6.
  pinned      jsonb,
  model       text,
  usage       jsonb,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists sap_plans_owner_created_idx
  on public.sap_plans (owner, created_at desc);
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
