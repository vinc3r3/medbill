import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ProfileForm } from '../components/ProfileForm';
import { RequireUser } from '../components/RequireUser';
import { FormSkeleton } from '../components/Skeleton';
import { UploadForm } from '../components/UploadForm';

export const metadata: Metadata = { title: 'New check · MedBill Checker' };

export default function NewCheckPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">New check</h1>
        <p className="text-lg text-muted">
          Upload your medical bill and your insurer&apos;s Explanation of Benefits (EOB). We&apos;ll point out charges
          worth a second look and help you ask about them.
        </p>
      </header>
      <Suspense fallback={<FormSkeleton />}>
        <RequireUser next="/new">
          <ProfileForm />
          <UploadForm />
        </RequireUser>
      </Suspense>
      <p className="text-sm text-neutral-500">Demo build. Uses synthetic sample documents only.</p>
    </main>
  );
}
