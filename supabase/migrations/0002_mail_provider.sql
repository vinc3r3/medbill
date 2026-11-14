-- Task 10: mail provider is PostGrid, not Lob. Neutral column names, plus the preview link and send time
-- (the 30-day reminder is sent_at + 30 days). Run in the Supabase dashboard: SQL Editor → paste → Run.

alter table public.cases rename column lob_letter_id to mail_letter_id;
alter table public.cases add column if not exists preview_url text;
alter table public.cases add column if not exists sent_at timestamptz;
