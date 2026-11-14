import { describe, expect, it } from 'vitest';
import { rowMarks } from './review';
import type { Flag } from './types';

const f = (kind: Flag['kind'], billLineIdx: number | null, eobLineIdx: number | null): Flag => ({
  kind, billLineIdx, eobLineIdx, expected: 0, billed: 1, difference: 1, explanation: '?',
});

describe('rowMarks', () => {
  it('numbers flags from 1 and maps them to bill rows, EOB rows and totals', () => {
    const marks = rowMarks([f('over_patient_responsibility', null, null), f('duplicate', 2, 1), f('eob_says_zero', 3, 1)]);
    expect(marks.totals).toEqual([1]);
    expect([...marks.bill]).toEqual([[2, [2]], [3, [3]]]);
    expect([...marks.eob]).toEqual([[1, [2, 3]]]);
  });

  it('is empty for no flags', () => {
    const marks = rowMarks([]);
    expect(marks.totals).toEqual([]);
    expect(marks.bill.size + marks.eob.size).toBe(0);
  });
});
