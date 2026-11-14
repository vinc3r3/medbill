import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listCases } from '@/lib/cases-repo';
import { summarize } from '@/lib/dashboard';
import { formatUsd, formatUsDate } from '@/lib/format';
import { isReminderDue } from '@/lib/tracking';
import type { Case } from '@/lib/types';
import { StatusChip } from '../components/StatusChip';

export async function DashboardContent() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect('/signin?next=%2Fdashboard');
  const cases = await listCases(user.id);
  const s = summarize(cases);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your cases</h1>
          <p className="text-neutral-600 dark:text-neutral-400">Every bill you&apos;ve checked, and where each dispute stands.</p>
        </div>
        <Link href="/new" className="rounded-lg bg-blue-700 px-5 py-2.5 font-medium text-white">
          New check
        </Link>
      </header>

      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3">
        <Stat testId="stat-in-dispute" label="In dispute" value={formatUsd(s.inDispute, { compact: true })} hint="Letters sent, waiting for a reply" />
        <Stat testId="stat-saved" label="Money saved" value={formatUsd(s.saved, { compact: true })} hint="Confirmed by a corrected bill" />
        <Stat testId="stat-to-review" label="To review" value={formatUsd(s.toReviewAmount, { compact: true })} hint={`${s.toReview} case${s.toReview === 1 ? '' : 's'} with no letter sent yet`} />
      </section>

      {cases.length === 0 ? (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-neutral-300 p-8 dark:border-neutral-700">
          <p className="text-lg font-semibold">No cases yet</p>
          <p className="text-neutral-600 dark:text-neutral-400">Upload a bill and your insurer&apos;s EOB to see if anything is worth questioning.</p>
          <Link href="/new" className="font-medium underline">Start your first check</Link>
        </section>
      ) : (
        <ul aria-label="Cases" className="flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-300 dark:divide-neutral-800 dark:border-neutral-700">
          {cases.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, hint, testId }: { label: string; value: string; hint: string; testId: string }) {
  return (
    <div className="rounded-xl border border-neutral-300 p-4 dark:border-neutral-700">
      <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">{label}</p>
      <p data-testid={testId} className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-neutral-500">{hint}</p>
    </div>
  );
}

function CaseRow({ c }: { c: Case }) {
  const due = isReminderDue(c.sentAt, c.status);
  const amount =
    c.savedAmount > 0
      ? `${formatUsd(c.savedAmount)} ${c.status === 'resolved' ? 'saved' : 'to question'}`
      : c.status === 'checked' ? 'Nothing to question' : '';
  return (
    <li data-testid="case-row" data-case-id={c.id}>
      <Link href={`/cases/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          <p className="truncate font-semibold">{c.bill.provider}</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Service {formatUsDate(c.bill.serviceDate)} · {c.eob.insurer}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {due && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">Follow up</span>}
          <span className="text-sm font-medium tabular-nums">{amount}</span>
          <StatusChip status={c.status} />
        </div>
      </Link>
    </li>
  );
}
