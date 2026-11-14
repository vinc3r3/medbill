// Dashboard totals and labels. Pure.
import type { Case, CaseStatus } from './types';

export const STATUS_LABELS: Record<CaseStatus, string> = {
  uploaded: 'Uploaded',
  checked: 'Checked',
  letter_ready: 'Letter ready',
  sent: 'Sent',
  delivered: 'Delivered',
  resolved: 'Resolved',
};

export type Summary = {
  cases: number;
  /** Amount questioned in letters that are sent or delivered and not yet resolved. */
  inDispute: number;
  /** Amount saved on resolved cases (actual savings once Task 15 records replies). */
  saved: number;
  /** Checked cases with something to question and no letter sent yet. */
  toReview: number;
  toReviewAmount: number;
};

const cents = (n: number) => Math.round(n * 100);

export function summarize(cases: Case[]): Summary {
  let inDispute = 0;
  let saved = 0;
  let toReviewAmount = 0;
  let toReview = 0;
  for (const c of cases) {
    const amount = cents(c.savedAmount);
    if (c.status === 'sent' || c.status === 'delivered') inDispute += amount;
    else if (c.status === 'resolved') saved += amount;
    else if ((c.status === 'checked' || c.status === 'letter_ready') && amount > 0) {
      toReview++;
      toReviewAmount += amount;
    }
  }
  return { cases: cases.length, inDispute: inDispute / 100, saved: saved / 100, toReview, toReviewAmount: toReviewAmount / 100 };
}
