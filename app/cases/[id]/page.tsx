import { Suspense } from 'react';
import { CaseReview } from './CaseReview';

// Not async: the case id is runtime data, read inside the Suspense boundary.
export default function CasePage({ params }: PageProps<'/cases/[id]'>) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-muted">Loading your case…</p>}>
        <CaseReview params={params} />
      </Suspense>
    </main>
  );
}
