-- A job may now ask for the review and the analysis plan together.
--
-- The old values are kept rather than tidied away. Thirty job rows exist, and
-- thirteen of them are runs of documents this application no longer builds: the
-- case record form, the shell tables, and one run of all of them. Narrowing the
-- constraint to what the app writes today would reject its own history, and
-- those rows are the record of what was spent.

alter table public.jobs drop constraint if exists jobs_kind_check;

alter table public.jobs add constraint jobs_kind_check
  check (kind in ('review', 'sap', 'both', 'crf', 'tables', 'all', 'documents'));
