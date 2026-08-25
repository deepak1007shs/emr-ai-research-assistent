-- The investigator's answers to the issues the review raised.
--
-- These are decisions, not notes: they are passed into every ingest stage and
-- override the protocol where the two conflict, so the specification encodes the
-- study as corrected rather than as written.

alter table public.reviews
  add column if not exists answers text;
