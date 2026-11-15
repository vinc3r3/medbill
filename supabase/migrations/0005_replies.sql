-- Task 15: replies from the provider, logged by the user on the case page (outcome + the corrected statement,
-- extracted from redacted text, so no personal details). Run in Supabase: SQL Editor → paste → Run.

alter table public.cases add column if not exists replies jsonb not null default '[]'::jsonb;
