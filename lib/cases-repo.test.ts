import { describe, expect, it } from 'vitest';
import { patchToRow, rowToCase, type CaseRow } from './cases-repo';

const row: CaseRow = {
  id: 'abc',
  status: 'uploaded',
  bill: { provider: 'Test Clinic', serviceDate: '2026-01-02', lines: [], amountDue: 0 },
  eob: { insurer: 'Test Health', claimId: 'C1', lines: [], totalPatientResponsibility: 0 },
  flags: [],
  letter: null,
  lob_letter_id: null,
  saved_amount: '367.00',
  created_at: '2026-01-02T00:00:00Z',
};

describe('rowToCase', () => {
  it('maps snake_case columns to the Case type and parses numeric strings', () => {
    const c = rowToCase(row);
    expect(c.lobLetterId).toBeNull();
    expect(c.savedAmount).toBe(367);
    expect(c.createdAt).toBe('2026-01-02T00:00:00Z');
  });
});

describe('patchToRow', () => {
  it('only includes fields that were given', () => {
    expect(patchToRow({ status: 'sent', lobLetterId: 'ltr_1' })).toEqual({ status: 'sent', lob_letter_id: 'ltr_1' });
  });
});
