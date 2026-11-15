import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '../AuthForm';

export const metadata: Metadata = { title: 'Sign in · MedBill Checker' };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-12 sm:py-16">
      <div className="card flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted">Check your medical bills and track your disputes.</p>
      </div>
      {/* The form reads ?next= from the URL, which is runtime data. */}
      <Suspense fallback={null}>
        <AuthForm mode="signin" />
      </Suspense>
      </div>
    </main>
  );
}
