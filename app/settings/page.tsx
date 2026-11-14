import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { ProfileForm } from '../components/ProfileForm';
import { RequireUser } from '../components/RequireUser';

export const metadata: Metadata = { title: 'Settings · MedBill Checker' };

async function Account() {
  const user = await getCurrentUser();
  return (
    <section className="flex flex-col gap-1 rounded-xl border border-neutral-300 p-4 dark:border-neutral-700">
      <h2 className="font-semibold">Account</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Signed in as <span className="font-medium text-neutral-900 dark:text-neutral-100">{user?.email}</span>
      </p>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <Suspense fallback={<p className="text-neutral-600 dark:text-neutral-400">Loading…</p>}>
        <RequireUser next="/settings">
          <Account />
          <ProfileForm />
        </RequireUser>
      </Suspense>
    </main>
  );
}
