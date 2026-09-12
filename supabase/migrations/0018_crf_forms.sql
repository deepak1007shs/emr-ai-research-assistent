-- The case record form, and the note the investigator writes before a build.
--
-- `crf_forms` was dropped in 0014 with the documents this application no longer
-- built. It comes back for the rules-based Step 8: the form is built from the
-- stored plan by code, with no model call, so there is no `model`, no `usage`
-- and no `batch_id` here. That absence is the design statement - a row with a
-- usage column invites somebody to fill it.
--
-- `sap_plans.note` is what was typed in the box on the review page. It is kept
-- with the plan rather than with the review, so rebuilding a plan a month later
-- uses the same instruction it was built with the first time.

create table if not exists public.crf_forms (
  id          uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.protocols (id) on delete cascade,
  -- The plan this form was built from. The one column that makes "older than
  -- the plan" a fact rather than a guess from two timestamps.
  sap_id      uuid references public.sap_plans (id) on delete set null,
  owner       uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'ready' check (status in ('ready', 'failed')),
  -- The CrfForm: its sections, its fields with their traces, the checks and the
  -- open items. Whole, so the download route re-renders the Word file from this
  -- row alone and a form survives its plan being rebuilt or deleted.
  form        jsonb,
  markdown    text,
  counts      jsonb,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists crf_forms_owner_created_idx
  on public.crf_forms (owner, created_at desc);
create index if not exists crf_forms_protocol_idx
  on public.crf_forms (protocol_id, created_at desc);

alter table public.crf_forms enable row level security;

create policy "crf_forms are visible to their owner"
  on public.crf_forms for select using (auth.uid() = owner);
create policy "crf_forms are created by their owner"
  on public.crf_forms for insert with check (auth.uid() = owner);
create policy "crf_forms are updated by their owner"
  on public.crf_forms for update using (auth.uid() = owner);
create policy "crf_forms are deleted by their owner"
  on public.crf_forms for delete using (auth.uid() = owner);

alter table public.sap_plans add column if not exists note text;
