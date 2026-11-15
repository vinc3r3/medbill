-- Task 17: Stripe (test mode). Plan state per user, processed webhook events, and how each case's letter is paid.
-- Run in Supabase: SQL Editor → paste → Run.

create table if not exists public.billing (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  plan_status text,
  plan_period_start timestamptz,
  plan_period_end timestamptz,
  stripe_subscription_id text
);

-- Stripe retries webhooks; an event id stored here has been processed.
create table if not exists public.stripe_events (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table public.cases add column if not exists paid_via text check (paid_via in ('letter', 'plan'));
alter table public.cases add column if not exists stripe_payment_intent text;
create index if not exists cases_stripe_payment_intent_idx on public.cases (stripe_payment_intent);

-- Server-only tables (accessed with the secret key). Enable RLS with no policies so the public API can't read them.
alter table public.billing enable row level security;
alter table public.stripe_events enable row level security;
