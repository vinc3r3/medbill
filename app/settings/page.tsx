import type { Metadata } from 'next';
import { Suspense } from 'react';
import { signOut } from '@/app/(auth)/actions';
import { getCurrentUser } from '@/lib/auth';
import { PLAN_LETTERS_PER_YEAR, PRICES, planIsActive } from '@/lib/billing';
import { accountPlan } from '@/lib/billing-server';
import { ProfileForm } from '../components/ProfileForm';
import { RequireUser } from '../components/RequireUser';
import { FormSkeleton } from '../components/Skeleton';
import { PlanActions } from './PlanActions';

export const metadata: Metadata = { title: 'Settings · MedBill Checker' };

async function Account() {
  const user = await getCurrentUser();
  return (
    <section aria-labelledby="account" className="card flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 id="account" className="font-semibold">Account</h2>
        <p className="truncate text-sm text-muted">
          Signed in as <span data-testid="settings-email" className="font-medium text-foreground">{user?.email}</span>
        </p>
      </div>
      <form action={signOut}>
        <button type="submit" className="btn btn-secondary px-3 py-1.5 text-sm">Sign out</button>
      </form>
    </section>
  );
}

const STATUS_LABELS: Record<string, string> = {
  past_due: 'Payment failed',
  unpaid: 'Payment failed',
  canceled: 'Cancelled',
  incomplete: 'Payment not completed',
  incomplete_expired: 'Payment not completed',
  paused: 'Paused',
};

async function Plan() {
  const user = await getCurrentUser();
  const { billing, lettersLeft } = await accountPlan(user!.id);
  const active = planIsActive(billing, new Date());
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const badge = active ? 'Annual plan' : billing.status && STATUS_LABELS[billing.status] ? STATUS_LABELS[billing.status] : 'Pay per letter';
  return (
    <section aria-labelledby="plan" data-testid="plan" data-plan-status={billing.status ?? 'none'} className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plan" className="font-semibold">Plan</h2>
        <span data-testid="plan-badge" className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">{badge}</span>
      </div>
      {active ? (
        <p className="text-sm">
          <span data-testid="plan-letters-left" className="font-semibold">{lettersLeft} of {PLAN_LETTERS_PER_YEAR}</span> certified letters left
          this plan year.{billing.periodEnd && <> Renews on {fmt(billing.periodEnd)}.</>}
        </p>
      ) : (
        <p className="text-sm text-muted">
          Checking bills is always free. A certified letter is {PRICES.letter.label}, or get the annual plan for {PRICES.plan.label}{' '}
          with {PLAN_LETTERS_PER_YEAR} letters a year.
          {billing.status && STATUS_LABELS[billing.status] && ' Your plan has no letters available until the payment is sorted out.'}
        </p>
      )}
      <PlanActions planActive={active} hasCustomer={!!billing.customerId} />
      <p className="text-xs text-muted">Test mode: payments use Stripe test cards (4242 4242 4242 4242); nothing is charged.</p>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted">Your personal details, account and plan.</p>
      </header>
      <Suspense fallback={<FormSkeleton />}>
        <RequireUser next="/settings">
          <ProfileForm />
          <Plan />
          <Account />
        </RequireUser>
      </Suspense>
    </main>
  );
}
