'use client'; // Error boundaries must be Client Components

import Link from 'next/link';
import { useEffect } from 'react';

/** Any unexpected error while showing a page: a readable message and a way forward. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <div role="alert" className="card flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong on our side</h1>
        <p className="text-muted">
          This page couldn&apos;t load. Your cases and your details are safe. Please try again; if it keeps happening,
          go back to the dashboard.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => retry()} className="btn btn-primary">Try again</button>
          <Link href="/dashboard" className="btn btn-secondary">Go to the dashboard</Link>
        </div>
      </div>
    </main>
  );
}
