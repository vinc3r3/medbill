import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DashboardContent } from './DashboardContent';

export const metadata: Metadata = { title: 'Dashboard · MedBill Checker' };

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-neutral-600 dark:text-neutral-400">Loading your cases…</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
