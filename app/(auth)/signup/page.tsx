import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '../AuthForm';

export const metadata: Metadata = { title: 'Create your account · MedBill Checker' };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-neutral-600 dark:text-neutral-400">Free to try. Uses synthetic sample documents only in this demo.</p>
      </div>
      {/* The form reads ?next= from the URL, which is runtime data. */}
      <Suspense fallback={null}>
        <AuthForm mode="signup" />
      </Suspense>
    </main>
  );
}
