-- Task 11: cache of validated AI extractions, keyed by SHA-256 of docType + redacted text.
-- Holds no personal details (the input was redacted on the device). Run in Supabase: SQL Editor → Run.

create table if not exists public.extractions (
  hash        text primary key check (hash ~ '^[0-9a-f]{64}$'),
  doc_type    text not null check (doc_type in ('bill', 'eob')),
  result      jsonb not null,
  provider    text not null,
  model       text not null,
  created_at  timestamptz not null default now()
);

-- Server-only (secret key). RLS on with no policies blocks publishable/anon keys.
alter table public.extractions enable row level security;
