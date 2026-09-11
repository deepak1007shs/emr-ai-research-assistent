-- The batch a build sent, on the row it will fill.
--
-- Builds are batched now, at half the price of a live call. A batch keeps
-- running at Anthropic when the server that sent it dies, and is billed in full
-- when it ends. Without its id nobody can collect it, and the next build pays
-- for the same document a second time. The runner writes the id here the moment
-- the batch exists, and a later build of the same protocol collects it.
--
-- Nullable and additive: every existing row was a live call and has no batch.

alter table public.reviews   add column if not exists batch_id text;
alter table public.sap_plans add column if not exists batch_id text;
