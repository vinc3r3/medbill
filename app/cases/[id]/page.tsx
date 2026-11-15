import { Suspense } from 'react';
import { CaseSkeleton } from '../../components/Skeleton';
import { CaseReview } from './CaseReview';

// Not async: the case id is runtime data, read inside the Suspense boundary.
export default function CasePage({ params }: PageProps<'/cases/[id]'>) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={<CaseSkeleton />}>
        <CaseReview params={params} />
      </Suspense>
    </main>
  );
}
