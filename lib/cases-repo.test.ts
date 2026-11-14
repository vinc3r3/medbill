import { describe, expect, it } from 'vitest';
import { patchToRow, rowToCase, type CaseRow } from './cases-repo';

const row: CaseRow = {
  id: 'abc',
  status: 'uploaded',
  bill: { provider: 'Test Clinic', serviceDate: '2026-01-02', lines: [], amountDue: 0 },
  eob: { insurer: 'Test Health', claimId: 'C1', lines: [], totalPatientResponsibility: 0 },
  flags: [],
  letter: null,
  mail_letter_id: null,
  preview_url: null,
  sent_at: null,
  saved_amount: '367.00',
  created_at: '2026-01-02T00:00:00Z',
};

describe('rowToCase', () => {
  it('maps snake_case columns to the Case type and parses numeric strings', () => {
    const c = rowToCase(row);
    expect(c.mailLetterId).toBeNull();
    expect(c.sentAt).toBeNull();
    expect(c.savedAmount).toBe(367);
    expect(c.createdAt).toBe('2026-01-02T00:00:00Z');
  });
});

describe('patchToRow', () => {
  it('only includes fields that were given', () => {
    expect(patchToRow({ status: 'sent', mailLetterId: 'letter_1', sentAt: '2026-11-14T00:00:00Z' })).toEqual({
      status: 'sent', mail_letter_id: 'letter_1', sent_at: '2026-11-14T00:00:00Z',
    });
  });
});
