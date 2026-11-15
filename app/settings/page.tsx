import type { Metadata } from 'next';
import { Suspense } from 'react';
import { signOut } from '@/app/(auth)/actions';
import { getCurrentUser } from '@/lib/auth';
import { ProfileForm } from '../components/ProfileForm';
import { RequireUser } from '../components/RequireUser';
import { FormSkeleton } from '../components/Skeleton';

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

function Plan() {
  return (
    <section aria-labelledby="plan" data-testid="plan" className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plan" className="font-semibold">Plan</h2>
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">Free (demo)</span>
      </div>
      <p className="text-sm text-muted">
        Checking bills is always free. Certified letters will be $14.99 each, or $39 a year for four letters. Payments
        aren&apos;t switched on in this demo, so sending letters is free for now.
      </p>
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
