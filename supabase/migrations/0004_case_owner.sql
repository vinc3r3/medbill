-- Task 12: every case belongs to a user (Supabase Auth). Existing rows were ownerless synthetic test data
-- (the table was empty when this was written). Run in Supabase: SQL Editor → paste → Run.

delete from public.cases where true;
alter table public.cases add column if not exists user_id uuid not null references auth.users (id) on delete cascade;
create index if not exists cases_user_id_created_at_idx on public.cases (user_id, created_at desc);
