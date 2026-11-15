// Case tracking timeline shown on the case page. Pure.
import { formatUsd } from './format';
import { OUTCOME_LABELS } from './replies';
import { isReminderDue, reminderDate } from './tracking';
import type { Case } from './types';

export type StepState = 'done' | 'current' | 'attention' | 'upcoming';
export type Step = {
  key: string;
  label: string;
  /** ISO date or timestamp, or null when unknown / not yet. */
  date: string | null;
  state: StepState;
  detail?: string;
};

export function timeline(c: Case, now = new Date()): Step[] {
  const steps: Step[] = [{ key: 'checked', label: 'Bill checked against your EOB', date: c.createdAt, state: 'done' }];
  if (c.flags.length === 0) return steps; // nothing to question, nothing to track

  const sent = Boolean(c.sentAt);
  const resolved = c.status === 'resolved';
  // A logged reply means the letter arrived, even if no delivery event was reported.
  const delivered = c.status === 'delivered' || resolved || c.replies.length > 0;
  const next = (done: boolean, isNext: boolean): StepState => (done ? 'done' : isNext ? 'current' : 'upcoming');

  steps.push({ key: 'sent', label: 'Letter sent by certified mail', date: c.sentAt, state: next(sent, true) });
  steps.push({ key: 'delivered', label: 'Letter delivered', date: null, state: next(delivered, sent) });

  c.replies.forEach((r, i) =>
    steps.push({
      key: `reply-${i}`,
      label: `Reply: ${OUTCOME_LABELS[r.outcome].toLowerCase()}`,
      date: r.receivedAt,
      state: 'done',
      detail: r.bill ? `New amount due: ${formatUsd(r.bill.amountDue)}` : undefined,
    }),
  );
  if (c.replies.length === 0) {
    steps.push({
      key: 'reply',
      label: 'Reply from the billing office',
      date: reminderDate(c.sentAt),
      state: isReminderDue(c.sentAt, c.status, now) ? 'attention' : next(false, delivered),
      detail: c.sentAt ? 'No reply by this date? Send a follow-up.' : undefined,
    });
  }

  const corrected = c.replies.findLast((r) => r.outcome === 'corrected');
  steps.push({
    key: 'resolved',
    label: 'Resolved',
    date: resolved ? (corrected?.receivedAt ?? null) : null,
    state: resolved ? 'done' : 'upcoming',
    detail: resolved ? `${formatUsd(c.savedAmount)} saved` : undefined,
  });
  return steps;
}
