import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCase } from '@/lib/cases-repo';
import { formatUsd, formatUsDate } from '@/lib/format';
import { FLAG_LABELS, rowMarks } from '@/lib/review';
import type { Case, Flag } from '@/lib/types';
import { FlagBadge } from './FlagBadge';
import { LetterEditor } from './LetterEditor';
import { BillTable, EobTable } from './LineTables';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function CaseReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection(); // always read the latest case
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/cases/${id}`)}`);
  if (!UUID.test(id)) notFound();
  const found = await getCase(id, user.id); // someone else's case → 404, same as a missing one
  if (!found) notFound();
  return <ReviewView c={found} />;
}

function ReviewView({ c }: { c: Case }) {
  const marks = rowMarks(c.flags);
  const toQuestion = c.savedAmount;

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm underline">
          ← Check another bill
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{c.bill.provider}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Service date {formatUsDate(c.bill.serviceDate)} · {c.eob.insurer} · Claim {c.eob.claimId}
        </p>
      </header>

      <section
        aria-label="Summary"
        className={`rounded-xl border p-5 ${toQuestion > 0 ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30' : 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'}`}
      >
        {toQuestion > 0 ? (
          <>
            <p data-testid="to-question" className="text-3xl font-bold">
              {formatUsd(toQuestion, { compact: true })} to question
            </p>
            <p className="mt-1 text-neutral-700 dark:text-neutral-300">
              {c.flags.length} item{c.flags.length === 1 ? '' : 's'} worth asking the provider about. These are questions to
              verify, not proof of an error.
            </p>
          </>
        ) : (
          <>
            <p data-testid="to-question" className="text-3xl font-bold">
              Nothing to question
            </p>
            <p className="mt-1 text-neutral-700 dark:text-neutral-300">Your bill matches what your EOB says you owe.</p>
          </>
        )}
      </section>

      {c.flags.length > 0 && (
        <section aria-label="Items to question" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">What to ask about</h2>
          <ol className="flex flex-col gap-3">
            {c.flags.map((flag, i) => (
              <FlagCard key={i} n={i + 1} flag={flag} />
            ))}
          </ol>
        </section>
      )}

      <section aria-label="Bill and EOB side by side" className="grid gap-6 lg:grid-cols-2">
        <BillTable bill={c.bill} marks={marks.bill} totalsMarks={marks.totals} />
        <EobTable eob={c.eob} marks={marks.eob} totalsMarks={marks.totals} />
      </section>

      {c.mailLetterId && <SentPanel c={c} />}

      {c.flags.length > 0 && (c.status === 'checked' || c.status === 'letter_ready') && (
        <LetterEditor caseId={c.id} initialLetter={c.letter} providerName={c.bill.provider} />
      )}
    </>
  );
}

function FlagCard({ n, flag }: { n: number; flag: Flag }) {
  return (
    <li data-testid="flag-card" className="flex gap-3 rounded-xl border border-neutral-300 p-4 dark:border-neutral-700">
      <FlagBadge n={n} />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold">{FLAG_LABELS[flag.kind]}</p>
        <p>{flag.explanation}</p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Billed {formatUsd(flag.billed)} · Expected {formatUsd(flag.expected)} ·{' '}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">Difference {formatUsd(flag.difference)}</span>
        </p>
      </div>
    </li>
  );
}

function SentPanel({ c }: { c: Case }) {
  const sentOn = c.sentAt ? new Date(c.sentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  return (
    <section
      aria-label="Letter sent"
      data-testid="sent-panel"
      className="flex flex-col gap-2 rounded-xl border border-emerald-400 bg-emerald-50 p-5 dark:border-emerald-700 dark:bg-emerald-950/30"
    >
      <p className="text-lg font-semibold">
        Letter sent by certified mail{sentOn ? ` on ${sentOn}` : ''}{' '}
        <span className="text-sm font-normal text-neutral-600 dark:text-neutral-400">(test mode: not actually mailed)</span>
      </p>
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        Status: <span data-testid="case-status" className="font-semibold">{c.status}</span> · Letter ID{' '}
        <code className="text-xs">{c.mailLetterId}</code>
      </p>
      <a href={`/api/cases/${c.id}/preview`} target="_blank" rel="noopener" className="self-start text-sm font-medium underline">
        View the letter as mailed (PDF)
      </a>
    </section>
  );
}
