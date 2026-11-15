import Link from 'next/link';

/** Unknown pages, and cases that don't exist or belong to someone else (same answer for both). */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <div className="card flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find that page</h1>
        <p className="text-muted">The link may be wrong, or this case isn&apos;t in your account.</p>
        <Link href="/dashboard" className="btn btn-primary self-start">Go to the dashboard</Link>
      </div>
    </main>
  );
}
