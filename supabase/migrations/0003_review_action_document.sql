-- The short companion document: the blockers only, as a numbered action table.
-- Stored beside the full review because both come from the same analysis pass.
-- The existing RLS policies cover these columns — they sit on the same rows.

alter table public.reviews
  add column if not exists action_spec     jsonb,
  add column if not exists action_markdown text;
