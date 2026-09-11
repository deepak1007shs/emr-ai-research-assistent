-- The tables behind the documents this application no longer builds.
--
-- The Statistical Analysis Plan, its shell tables, the case record form, the
-- revision flow and the spreadsheet cleaner were removed from the code in
-- d7fd31e. These held what they produced: 18 plans, 13 sets of shell tables,
-- 18 forms, 2 revisions and 1 dataset. Dropping them destroys all of it, and
-- unlike the code, nothing anywhere else has a copy.
--
-- `protocols` and `reviews` are untouched. They are what the application is
-- now, and they are what every one of those rows was built from.
--
-- Order matters, and not the obvious one: shell_tables references crf_forms as
-- well as sap_plans, so the tables go before the form. Written out rather than
-- dropped with CASCADE, so that anything depending on these which is not listed
-- here fails loudly instead of being taken silently.

drop table if exists public.revisions;
drop table if exists public.shell_tables;
drop table if exists public.crf_forms;
drop table if exists public.sap_plans;
drop table if exists public.datasets;
