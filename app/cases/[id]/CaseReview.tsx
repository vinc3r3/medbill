import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { planIsActive, type PaymentView } from '@/lib/billing';
import { caseAccess } from '@/lib/billing-server';
import { getCase } from '@/lib/cases-repo';
import { formatUsd, formatUsDate } from '@/lib/format';
import { FLAG_LABELS, rowMarks } from '@/lib/review';
import { OUTCOME_LABELS, caseRef, questionedAmount, remainingFlags } from '@/lib/replies';
import type { Case, Flag } from '@/lib/types';
import { timeline } from '@/lib/timeline';
import { isReminderDue, reminderDate } from '@/lib/tracking';
import { StatusChip } from '../../components/StatusChip';
import { FlagBadge } from './FlagBadge';
import { SimulateDeliveryButton } from './SimulateDeliveryButton';
import { LetterEditor } from './LetterEditor';
import { ReplyPanel } from './ReplyPanel';
import { Timeline } from './Timeline';
import { isSampleC } from '@/lib/demo';
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
  return <ReviewView c={found} payment={found.status === 'letter_ready' || found.status === 'checked' ? await paymentView(found.id, user.id) : null} />;
}

async function paymentView(caseId: string, userId: string): Promise<PaymentView> {
  const a = await caseAccess(caseId, userId);
  if (!a) return { canSend: false, via: null, message: null, planActive: false, lettersLeft: 0 };
  return {
    canSend: a.access.ok,
    via: a.access.ok ? a.access.via : null,
    message: a.access.ok ? null : a.access.message,
    planActive: planIsActive(a.billing, new Date()),
    lettersLeft: a.lettersLeft,
  };
}

function ReviewView({ c, payment }: { c: Case; payment: PaymentView | null }) {
  const marks = rowMarks(c.flags);
  const toQuestion = questionedAmount(c);

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href="/dashboard" className="link w-fit text-sm">
          ← Dashboard
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{c.bill.provider}</h1>
          <StatusChip status={c.status} />
        </div>
        <p className="text-muted">
          Service date {formatUsDate(c.bill.serviceDate)} · {c.eob.insurer} · Claim {c.eob.claimId}
        </p>
      </header>

      <div className={`grid gap-4 ${c.flags.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start' : ''}`}>
      {c.status === 'resolved' ? (
        <ResolvedSummary c={c} />
      ) : (
        <section
          aria-label="Summary"
          className={`rounded-2xl border p-5 ${toQuestion > 0 ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30' : 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'}`}
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
      )}
      {c.flags.length > 0 && <Timeline steps={timeline(c)} />}
      </div>

      {/* Once the letter is out, tracking comes first: status, replies, and the next action. */}
      {c.mailLetterId && <SentPanel c={c} />}

      {c.replies.length > 0 && <ReplyHistory c={c} />}

      {(c.status === 'sent' || c.status === 'delivered') && <ReplyPanel caseId={c.id} caseRef={caseRef(c.id)} sampleReply={isSampleC(c)} />}

      {c.flags.length > 0 && (
        <section aria-label="Items to question" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{c.status === 'resolved' ? 'What the letter asked about' : 'What to ask about'}</h2>
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


      {c.flags.length > 0 && (c.status === 'checked' || c.status === 'letter_ready') && (
        <LetterEditor caseId={c.id} initialLetter={c.letter} providerName={c.bill.provider} payment={payment} />
      )}
    </>
  );
}

function FlagCard({ n, flag }: { n: number; flag: Flag }) {
  return (
    <li data-testid="flag-card" className="flex gap-3 card p-4">
      <FlagBadge n={n} />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold">{FLAG_LABELS[flag.kind]}</p>
        <p>{flag.explanation}</p>
        <p className="text-sm text-muted">
          Billed {formatUsd(flag.billed)} · Expected {formatUsd(flag.expected)} ·{' '}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">Difference {formatUsd(flag.difference)}</span>
        </p>
      </div>
    </li>
  );
}

function SentPanel({ c }: { c: Case }) {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const sentOn = c.sentAt ? fmt(c.sentAt) : null;
  // A resolved case needs no follow-up; it may also have been resolved before delivery was reported.
  const followUp = c.status === 'resolved' ? null : reminderDate(c.sentAt);
  const due = isReminderDue(c.sentAt, c.status);
  const delivered = c.status === 'delivered';
  return (
    <section
      aria-label="Letter sent"
      data-testid="sent-panel"
      className="flex flex-col gap-2 rounded-2xl border border-emerald-400 bg-emerald-50 p-5 dark:border-emerald-700 dark:bg-emerald-950/30"
    >
      <p className="text-lg font-semibold">
        {delivered ? 'Your letter was delivered' : 'Letter sent by certified mail'}
        {sentOn ? ` · sent ${sentOn}` : ''}{' '}
        <span className="text-sm font-normal text-muted">(test mode: not actually mailed)</span>
      </p>
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        Status: <span data-testid="case-status" className="font-semibold">{c.status}</span> · Ref{' '}
        <span className="font-mono font-semibold">{caseRef(c.id)}</span> · Letter ID{' '}
        <code className="text-xs">{c.mailLetterId}</code>
      </p>
      {followUp && (
        <p data-testid="reminder" className={`text-sm ${due ? 'font-semibold text-amber-800 dark:text-amber-300' : 'text-neutral-700 dark:text-neutral-300'}`}>
          {due
            ? `Follow up now: it's been 30 days since you sent the letter (${fmt(followUp)})${c.replies.length ? '' : ' and no reply is logged'}. Send a follow-up letter or call the billing office, quoting ${caseRef(c.id)}.`
            : `Reminder: if you haven't heard back by ${fmt(followUp)}, send a follow-up letter quoting ${caseRef(c.id)}.`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <a href={`/api/cases/${c.id}/preview`} target="_blank" rel="noopener" className="text-sm font-medium underline">
          View the letter as mailed (PDF)
        </a>
        {c.status === 'sent' && <SimulateDeliveryButton caseId={c.id} />}
      </div>
    </section>
  );
}

function ResolvedSummary({ c }: { c: Case }) {
  const latest = c.replies.findLast((r) => r.outcome === 'corrected' && r.bill)?.bill ?? null;
  const left = remainingFlags(c) ?? [];
  const stillOver = left.find((f) => f.kind === 'over_patient_responsibility')?.difference ?? 0;
  return (
    <section
      aria-label="Summary"
      className="rounded-2xl border border-emerald-400 bg-emerald-50 p-5 dark:border-emerald-700 dark:bg-emerald-950/30"
    >
      <p data-testid="saved-amount" className="text-3xl font-bold">
        {formatUsd(c.savedAmount, { compact: true })} saved
      </p>
      {latest && (
        <p className="mt-1 text-neutral-700 dark:text-neutral-300">
          The corrected statement asks for {formatUsd(latest.amountDue)} instead of {formatUsd(c.bill.amountDue)}.{' '}
          {left.length === 0
            ? 'It now matches what your EOB says you owe.'
            : `It still differs from your EOB${stillOver > 0 ? ` by ${formatUsd(stillOver)}` : ''}: worth another look.`}
        </p>
      )}
    </section>
  );
}

function ReplyHistory({ c }: { c: Case }) {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return (
    <section aria-label="Replies" data-testid="reply-history" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Replies from the provider</h2>
      <ol className="flex flex-col gap-2">
        {c.replies.map((r, i) => (
          <li key={i} data-outcome={r.outcome} className="rounded-xl border border-neutral-300 p-4 text-sm dark:border-neutral-700">
            <p className="font-semibold">
              {fmt(r.receivedAt)} · {OUTCOME_LABELS[r.outcome]}
            </p>
            {r.bill && <p className="text-muted">New amount due: {formatUsd(r.bill.amountDue)}</p>}
            {r.outcome === 'denied' && (
              <p className="text-muted">
                You can ask {c.eob.insurer} to confirm what you owe, or request an itemized bill if you haven&apos;t received one.
              </p>
            )}
            {r.outcome === 'more_info' && (
              <p className="text-muted">Send what they asked for, quoting {caseRef(c.id)}, then log their next reply here.</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
