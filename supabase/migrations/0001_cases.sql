-- One table holding a whole case. Mirrors the `Case` type in lib/types.ts.
-- Run in the Supabase dashboard: SQL Editor → paste → Run.

create table if not exists public.cases (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'uploaded'
                 check (status in ('uploaded','checked','letter_ready','sent','delivered','resolved')),
  bill           jsonb not null,
  eob            jsonb not null,
  flags          jsonb not null default '[]'::jsonb,
  letter         text,
  lob_letter_id  text,
  saved_amount   numeric(10,2) not null default 0,
  created_at     timestamptz not null default now()
);

-- Only the server (secret key) touches this table. RLS on with no policies
-- blocks publishable/anon keys entirely.
alter table public.cases enable row level security;
