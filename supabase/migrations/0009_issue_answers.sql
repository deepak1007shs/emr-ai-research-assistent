-- Per-issue answers, and the missing link from a set of shell tables to the
-- form it was built alongside.
--
-- The general answers box stays as `reviews.answers`: nothing already saved is
-- lost, and it remains the place for anything that does not belong to one
-- numbered issue.

alter table public.reviews
  add column if not exists issue_answers jsonb;

comment on column public.reviews.issue_answers is
  'Answers keyed by index into action_spec.issues_table.rows. A review is immutable once complete, so the indices are stable.';

-- Staleness of a form or a set of tables against the plan is already knowable
-- from sap_id. Staleness of the tables against the form was not, because
-- nothing recorded which form they were built from.
alter table public.shell_tables
  add column if not exists crf_id uuid references public.crf_forms (id) on delete set null;

-- When the decisions last changed. A document built before that timestamp was
-- built from answers the investigator has since revised, which is worth saying
-- rather than leaving them to notice.
alter table public.reviews
  add column if not exists answers_updated_at timestamptz;
