import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'MedBill Checker: catch overcharges on your medical bills',
  description: 'Compare your medical bill with your insurer’s EOB, see what to question, and send a certified dispute letter.',
};

/** Calls to action depend on whether someone is signed in (runtime data, so inside Suspense). */
async function Cta({ where }: { where: 'hero' | 'footer' }) {
  const user = await getCurrentUser();
  if (user) {
    return (
      <div className="flex flex-wrap gap-3">
        <Link href="/new" className="btn btn-primary">Check a bill</Link>
        <Link href="/dashboard" className="btn btn-secondary">Go to your dashboard</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/signup" className="btn btn-primary" data-testid={`cta-${where}`}>Check my bill for free</Link>
      <Link href="/signin" className="btn btn-secondary">Sign in</Link>
    </div>
  );
}

const CtaFallback = () => <div className="h-11" />;

const STEPS = [
  { title: 'Upload two photos', body: 'Your bill, and the Explanation of Benefits (EOB) your insurer sent you.' },
  { title: 'See what to question', body: 'We match every line on the bill against what your insurer says you owe.' },
  { title: 'Send one letter', body: 'Edit a polite, factual letter and send it by certified mail. Then track the reply.' },
];

const CHECKS = [
  { title: 'Billed more than your EOB says', body: 'The amount due is higher than your share after insurance.' },
  { title: 'Charged twice', body: 'The same service on the same day appears more than once.' },
  { title: 'Not on your EOB', body: 'A charge your insurer never saw, so it may not have been submitted.' },
  { title: 'Your EOB says $0', body: 'Your plan covers the service in full, but the bill still asks you to pay.' },
];

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-6">
          <p className="w-fit rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">For everyday medical bills</p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Is your medical bill right?</h1>
          <p className="text-lg text-muted">
            Compare your bill with your insurer&apos;s Explanation of Benefits in about a minute. If something doesn&apos;t
            match, we help you ask the billing office about it, and track the answer.
          </p>
          <Suspense fallback={<CtaFallback />}>
            <Cta where="hero" />
          </Suspense>
          <p className="text-sm text-muted">Checking is free. Your documents are read on your device.</p>
        </div>
        <ExampleResult />
      </section>

      <section aria-labelledby="how" className="border-y border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-14">
          <h2 id="how" className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white dark:text-neutral-950">{i + 1}</span>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="checks" className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-14">
        <div className="flex flex-col gap-2">
          <h2 id="checks" className="text-2xl font-semibold tracking-tight">What we look for</h2>
          <p className="text-muted">Each finding is a question to check with the provider, not an accusation.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {CHECKS.map((c) => (
            <li key={c.title} className="card flex flex-col gap-1">
              <h3 className="font-semibold">{c.title}</h3>
              <p className="text-muted">{c.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="privacy" className="border-y border-line bg-surface">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-14 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 id="privacy" className="text-2xl font-semibold tracking-tight">Your details stay with you</h2>
            <p className="text-muted">
              Text is read from your photos in your browser. Your name, date of birth, member ID, account numbers and
              address are removed before anything reaches our servers or the AI that reads the amounts.
            </p>
          </div>
          <ul className="flex flex-col gap-3 text-sm">
            {[
              'Documents never leave your device: only redacted text is sent',
              'Letters are drafted with placeholders and filled in on your device',
              'Only the mail service sees the finished letter, to print it',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-emerald-600" fill="currentColor">
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="pricing" className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-14">
        <h2 id="pricing" className="text-2xl font-semibold tracking-tight">Pricing</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Price name="Check" price="Free" body="Upload, compare, review every line and draft your letter." />
          <Price name="Single letter" price="$14.99" body="One certified letter to the billing office, with tracking." />
          <Price name="Annual plan" price="$39/year" body="Four certified letters a year. Cancel any time." />
        </div>
        <p className="text-sm text-muted">Payments aren&apos;t switched on in this demo, so letters are free to try.</p>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 px-4 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Got a bill on the table?</h2>
          <Suspense fallback={<CtaFallback />}>
            <Cta where="footer" />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

function Price({ name, price, body }: { name: string; price: string; body: string }) {
  return (
    <div className="card flex flex-col gap-2">
      <h3 className="font-semibold">{name}</h3>
      <p className="text-3xl font-bold tracking-tight">{price}</p>
      <p className="text-sm text-muted">{body}</p>
    </div>
  );
}

/** A static illustration of a result, using sample case C's numbers. */
function ExampleResult() {
  return (
    <figure aria-label="Example result" className="card flex flex-col gap-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Summit Urgent Care</p>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">Example</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-background p-3">
          <dt className="text-muted">Bill asks for</dt>
          <dd className="text-2xl font-bold tabular-nums">$412</dd>
        </div>
        <div className="rounded-xl bg-background p-3">
          <dt className="text-muted">EOB says you owe</dt>
          <dd className="text-2xl font-bold tabular-nums">$45</dd>
        </div>
      </dl>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
        <p className="font-semibold">$367 to question</p>
        <p className="text-sm text-muted">Could the provider check whether the insurance payment and adjustments were applied?</p>
      </div>
      <figcaption className="text-xs text-muted">Synthetic sample case. Your results depend on your bill.</figcaption>
    </figure>
  );
}
