// Pure helpers for the review screen.
import type { Flag, FlagKind } from './types';

export const FLAG_LABELS: Record<FlagKind, string> = {
  duplicate: 'Possible duplicate charge',
  not_on_eob: 'Not on your EOB',
  eob_says_zero: 'Your EOB says you owe $0',
  over_patient_responsibility: 'Bill is more than your EOB says you owe',
};

export type RowMarks = {
  bill: Map<number, number[]>; // bill line index → flag numbers (1-based)
  eob: Map<number, number[]>; // EOB line index → flag numbers
  totals: number[]; // flags about the totals (case-level)
};

/** Which table rows each flag points at, numbered in display order (1, 2, …). */
export function rowMarks(flags: Flag[]): RowMarks {
  const marks: RowMarks = { bill: new Map(), eob: new Map(), totals: [] };
  const add = (map: Map<number, number[]>, idx: number, n: number) => map.set(idx, [...(map.get(idx) ?? []), n]);
  flags.forEach((flag, i) => {
    const n = i + 1;
    if (flag.kind === 'over_patient_responsibility') marks.totals.push(n);
    if (flag.billLineIdx !== null) add(marks.bill, flag.billLineIdx, n);
    if (flag.eobLineIdx !== null) add(marks.eob, flag.eobLineIdx, n);
  });
  return marks;
}
