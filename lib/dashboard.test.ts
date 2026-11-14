// Dashboard totals. Written before lib/dashboard.ts.
import { describe, expect, it } from 'vitest';
import { STATUS_LABELS, summarize } from './dashboard';
import type { Case, CaseStatus } from './types';

const c = (status: CaseStatus, savedAmount: number): Case => ({
  id: `${status}-${savedAmount}`, status, savedAmount, flags: [], letter: null, mailLetterId: null, previewUrl: null, sentAt: null,
  createdAt: '2026-11-15T00:00:00Z',
  bill: { provider: 'P', serviceDate: '2026-01-01', lines: [], amountDue: 0 },
  eob: { insurer: 'I', claimId: 'C', lines: [], totalPatientResponsibility: 0 },
});

describe('summarize', () => {
  it('counts letters on their way as "in dispute", resolved as "saved", unsent flagged cases as "to review"', () => {
    const s = summarize([c('checked', 28.75), c('letter_ready', 10), c('sent', 367), c('delivered', 12.5), c('resolved', 40), c('checked', 0), c('uploaded', 0)]);
    expect(s).toEqual({ cases: 7, inDispute: 379.5, saved: 40, toReview: 2, toReviewAmount: 38.75 });
  });

  it('adds money in cents (no float drift)', () => {
    expect(summarize([c('sent', 0.1), c('sent', 0.2)]).inDispute).toBe(0.3);
  });

  it('is all zeros for no cases', () => {
    expect(summarize([])).toEqual({ cases: 0, inDispute: 0, saved: 0, toReview: 0, toReviewAmount: 0 });
  });

  it('has a label for every status', () => {
    for (const s of ['uploaded', 'checked', 'letter_ready', 'sent', 'delivered', 'resolved'] as const) expect(STATUS_LABELS[s]).toBeTruthy();
  });
});
