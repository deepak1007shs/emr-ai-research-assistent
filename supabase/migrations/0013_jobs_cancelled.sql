-- A build you stopped on purpose is not a build that failed.
--
-- Without a status of its own, stopping one left it reading as a crash in the
-- history, and the difference matters: a failure is something to look into and
-- a cancel is something you did.

alter table public.jobs drop constraint if exists jobs_status_check;

alter table public.jobs
  add constraint jobs_status_check
  check (status in ('running', 'done', 'failed', 'cancelled'));
