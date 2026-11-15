// Reply tracking rules (docs/spec.md, "Replies"). Pure: no I/O, no AI. Money is compared in cents.
import { checkFlags, savedAmount } from './flags';
import { formatUsd } from './format';
import type { BillDoc, Case, CaseStatus, Flag, Reply, ReplyOutcome } from './types';

/** A rule violation the user can fix; routes answer 409 with the message. */
export class ReplyError extends Error {}

const cents = (n: number) => Math.round(n * 100);

/** Printed on every letter so a reply can be matched to its case: "MB-" + first 4 hex of the id, uppercased. */
export function caseRef(caseId: string): string {
  return `MB-${caseId.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

/** What the letter questioned (from the flags), even after `savedAmount` became the actual saving. */
export function questionedAmount(c: Pick<Case, 'flags'>): number {
  return savedAmount(c.flags);
}

const OPEN: ReadonlySet<CaseStatus> = new Set(['sent', 'delivered']);

/**
 * Logs a reply. `corrected` (with the corrected statement) resolves the case; savedAmount becomes the actual
 * saving = original amountDue − new amountDue, between 0 and the amount questioned. `denied` and `more_info`
 * keep the case open as it is.
 */
export function applyReply(
  c: Case,
  input: { outcome: ReplyOutcome; bill: BillDoc | null },
  nowIso: string,
): Pick<Case, 'status' | 'savedAmount' | 'replies'> {
  if (c.status === 'resolved') throw new ReplyError('This case is already resolved.');
  if (!OPEN.has(c.status)) throw new ReplyError('Send the letter first. Replies can be logged once it has been mailed.');

  const reply: Reply = { outcome: input.outcome, receivedAt: nowIso, bill: input.bill };
  const replies = [...c.replies, reply];
  if (input.outcome !== 'corrected') return { status: c.status, savedAmount: c.savedAmount, replies };

  if (!input.bill) throw new ReplyError('Upload the corrected statement so we can compare it with your EOB.');
  const reduction = cents(c.bill.amountDue) - cents(input.bill.amountDue);
  if (reduction <= 0) {
    throw new ReplyError(
      `This statement asks for ${formatUsd(input.bill.amountDue)}, which is not lower than the original ` +
        `${formatUsd(c.bill.amountDue)}. If the provider kept the same amount, choose "Denied" instead.`,
    );
  }
  const saved = Math.min(reduction, cents(questionedAmount(c)));
  return { status: 'resolved', savedAmount: saved / 100, replies };
}

/** The latest corrected statement compared with the EOB (empty = it now matches), or null if there is none. */
export function remainingFlags(c: Pick<Case, 'eob' | 'replies'>): Flag[] | null {
  const latest = c.replies.findLast((r) => r.outcome === 'corrected' && r.bill);
  return latest?.bill ? checkFlags(latest.bill, c.eob) : null;
}

export const OUTCOME_LABELS: Record<ReplyOutcome, string> = {
  corrected: 'Corrected the bill',
  denied: 'Kept the bill as it is',
  more_info: 'Asked for more information',
};
