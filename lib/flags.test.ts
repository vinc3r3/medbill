// Flag rules from docs/spec.md ("Flag rules"). Written before lib/flags.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFlags, descriptionSimilarity, savedAmount } from './flags';
import type { BillDoc, BillLine, EobDoc, EobLine, Flag } from './types';

// ---- helpers ---------------------------------------------------------------------------------
const D = '2026-05-12';
const bl = (code: string | null, billed: number, description = `Service ${code}`, date = D): BillLine => ({ date, code, description, billed });
const el = (code: string | null, pr: number, description = `Service ${code}`, date = D): EobLine => ({
  date, code, description, billed: pr + 100, allowed: pr + 50, planPaid: 50, patientResponsibility: pr,
});
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
function docs(billLines: BillLine[], eobLines: EobLine[], amountDue?: number, totalPR?: number): [BillDoc, EobDoc] {
  return [
    { provider: 'Clinic', serviceDate: D, lines: billLines, amountDue: amountDue ?? sum(billLines.map((l) => l.billed)) },
    { insurer: 'Plan', claimId: 'C-1', lines: eobLines, totalPatientResponsibility: totalPR ?? sum(eobLines.map((l) => l.patientResponsibility)) },
  ];
}
/** Flag without the free-text explanation, for comparisons. */
const shape = ({ explanation: _e, ...rest }: Flag) => (void _e, rest);

// ---- spec sample table -----------------------------------------------------------------------
describe.each(['a', 'b', 'c'])('sample case %s', (key) => {
  const exp = JSON.parse(readFileSync(join(__dirname, '..', 'samples', key, 'expected.json'), 'utf8'));
  const flags = checkFlags(exp.bill, exp.eob);

  it('produces the expected flags', () => {
    expect(flags.map(shape)).toEqual(exp.flags.map(shape));
  });

  it('produces the expected savedAmount', () => {
    expect(savedAmount(flags)).toBe(exp.savedAmount);
  });
});

it('Task 7 check: A → 0 flags, B → 1 duplicate, C → over_patient_responsibility with $367', () => {
  const load = (k: string) => JSON.parse(readFileSync(join(__dirname, '..', 'samples', k, 'expected.json'), 'utf8'));
  const [a, b, c] = ['a', 'b', 'c'].map(load).map((e) => checkFlags(e.bill, e.eob));
  expect(a).toHaveLength(0);
  expect(b.map((f) => f.kind)).toEqual(['duplicate']);
  expect(c).toHaveLength(1);
  expect(c[0]).toMatchObject({ kind: 'over_patient_responsibility', difference: 367 });
});

// ---- duplicate -----------------------------------------------------------------------------------
describe('duplicate', () => {
  it('flags the second of two lines with the same date, code and amount', () => {
    const flags = checkFlags(...docs([bl('80053', 28.75), bl('80053', 28.75)], [el('80053', 28.75)]));
    expect(flags.map(shape)).toEqual([
      { kind: 'duplicate', billLineIdx: 1, eobLineIdx: 0, expected: 0, billed: 28.75, difference: 28.75 },
    ]);
  });

  it('flags every repeat after the first', () => {
    const flags = checkFlags(...docs([bl('80053', 10), bl('80053', 10), bl('80053', 10)], [el('80053', 10)]));
    expect(flags.filter((f) => f.kind === 'duplicate').map((f) => f.billLineIdx)).toEqual([1, 2]);
  });

  it('does not flag same code with a different amount or a different date', () => {
    expect(checkFlags(...docs([bl('80053', 10), bl('80053', 12)], [el('80053', 10), el('80053', 12)]))).toEqual([]);
    const flags = checkFlags(
      ...docs([bl('80053', 10), bl('80053', 10, 'Service 80053', '2026-05-13')], [el('80053', 10), el('80053', 10, 'Service 80053', '2026-05-13')]),
    );
    expect(flags).toEqual([]);
  });

  it('treats lines without a code as duplicates only when the descriptions also match', () => {
    const same = checkFlags(...docs([bl(null, 5, 'Bandage supply'), bl(null, 5, 'Bandage supply')], [el(null, 5, 'Bandage supply')]));
    expect(same.map((f) => f.kind)).toEqual(['duplicate']);
    const different = checkFlags(...docs([bl(null, 5, 'Bandage supply'), bl(null, 5, 'Ice pack')], [el(null, 5, 'Bandage supply'), el(null, 5, 'Ice pack')]));
    expect(different).toEqual([]);
  });

  it('compares amounts in cents, not floats', () => {
    const flags = checkFlags(...docs([bl('1', 0.1 + 0.2), bl('1', 0.3)], [el('1', 0.3)]));
    expect(flags.map((f) => f.kind)).toEqual(['duplicate']);
  });
});

// ---- not_on_eob / eob_says_zero ---------------------------------------------------------------
describe('not_on_eob', () => {
  it('flags a bill line with no EOB line of the same date and code', () => {
    const flags = checkFlags(...docs([bl('99213', 40), bl('97110', 25)], [el('99213', 40)], 65, 40));
    expect(flags.map(shape)).toEqual([
      { kind: 'not_on_eob', billLineIdx: 1, eobLineIdx: null, expected: 0, billed: 25, difference: 25 },
    ]);
  });

  it('requires the same date', () => {
    const flags = checkFlags(...docs([bl('99213', 40, 'Visit', '2026-05-13')], [el('99213', 40, 'Visit', D)]));
    expect(flags.map((f) => f.kind)).toEqual(['not_on_eob']);
  });
});

describe('eob_says_zero', () => {
  it('flags a matched line the EOB says the patient owes nothing for', () => {
    const flags = checkFlags(...docs([bl('99213', 40), bl('90471', 15)], [el('99213', 40), el('90471', 0)], 55, 40));
    expect(flags.map(shape)).toEqual([
      { kind: 'eob_says_zero', billLineIdx: 1, eobLineIdx: 1, expected: 0, billed: 15, difference: 15 },
    ]);
  });
});

// ---- precedence: at most one line-level flag per bill line ------------------------------------
describe('one flag per line, precedence duplicate > not_on_eob > eob_says_zero', () => {
  it('a repeated line that is not on the EOB gets only duplicate; the first gets not_on_eob', () => {
    const flags = checkFlags(...docs([bl('97110', 25), bl('97110', 25)], [], 50, 0));
    expect(flags.filter((f) => f.billLineIdx !== null).map((f) => [f.billLineIdx, f.kind])).toEqual([
      [0, 'not_on_eob'],
      [1, 'duplicate'],
    ]);
  });

  it('a repeated line the EOB says $0 for: first eob_says_zero, second duplicate', () => {
    const flags = checkFlags(...docs([bl('90471', 15), bl('90471', 15)], [el('90471', 0)], 30, 0));
    expect(flags.filter((f) => f.billLineIdx !== null).map((f) => [f.billLineIdx, f.kind])).toEqual([
      [0, 'eob_says_zero'],
      [1, 'duplicate'],
    ]);
  });

  it('never gives one bill line two flags', () => {
    const flags = checkFlags(...docs([bl('90471', 15), bl('90471', 15), bl('97110', 25)], [el('90471', 0)], 55, 0));
    const idxs = flags.map((f) => f.billLineIdx).filter((i) => i !== null);
    expect(new Set(idxs).size).toBe(idxs.length);
  });
});

// ---- over_patient_responsibility --------------------------------------------------------------
describe('over_patient_responsibility', () => {
  const lines = (): [BillLine[], EobLine[]] => [[bl('99204', 285), bl('73610', 127)], [el('99204', 35), el('73610', 10)]];

  it('fires when the amount due exceeds the EOB total by more than $1', () => {
    const flags = checkFlags(...docs(...lines(), 412, 45));
    expect(flags.map(shape)).toEqual([
      { kind: 'over_patient_responsibility', billLineIdx: null, eobLineIdx: null, expected: 45, billed: 412, difference: 367 },
    ]);
  });

  it('does not fire at exactly $1 over, fires at $1.01', () => {
    expect(checkFlags(...docs([bl('1', 46)], [el('1', 46)], 46, 45))).toEqual([]);
    expect(checkFlags(...docs([bl('1', 46.01)], [el('1', 46.01)], 46.01, 45)).map((f) => f.kind)).toEqual(['over_patient_responsibility']);
  });

  it('does not fire when the excess is fully explained by line-level flags (case B shape)', () => {
    const flags = checkFlags(...docs([bl('80053', 28.75), bl('80053', 28.75), bl('36415', 6)], [el('80053', 28.75), el('36415', 6)]));
    expect(flags.map((f) => f.kind)).toEqual(['duplicate']);
  });

  it('fires alongside line flags when more than $1 of the excess is unexplained', () => {
    // $25 not on EOB explains part; the remaining $100 is unexplained.
    const flags = checkFlags(...docs([bl('99213', 140), bl('97110', 25)], [el('99213', 40)], 165, 40));
    expect(flags.map((f) => f.kind).sort()).toEqual(['not_on_eob', 'over_patient_responsibility']);
    // savedAmount uses the case-level difference only (no double count): 165 - 40
    expect(savedAmount(flags)).toBe(125);
  });

  it('lists the case-level flag first', () => {
    const flags = checkFlags(...docs([bl('99213', 140), bl('97110', 25)], [el('99213', 40)], 165, 40));
    expect(flags[0].kind).toBe('over_patient_responsibility');
  });
});

// ---- matching when a code is missing -----------------------------------------------------------
describe('matching with a missing code', () => {
  it('matches by date + description overlap ≥ 0.5 when either side has no code', () => {
    expect(checkFlags(...docs([bl(null, 12.5, 'CBC')], [el('85025', 12.5, 'Complete blood count (CBC)')]))).toEqual([]);
    expect(checkFlags(...docs([bl('85025', 12.5, 'Complete blood count')], [el(null, 12.5, 'complete BLOOD count, automated')]))).toEqual([]);
  });

  it('does not match when descriptions are too different', () => {
    const flags = checkFlags(...docs([bl(null, 12.5, 'Flu vaccine')], [el('85025', 12.5, 'Complete blood count')]));
    expect(flags.map((f) => f.kind)).toEqual(['not_on_eob']);
  });

  it('uses the matched EOB line for eob_says_zero', () => {
    const flags = checkFlags(...docs([bl(null, 20, 'Flu shot administration')], [el('90471', 0, 'Flu shot administration')], 20, 0));
    expect(flags.map(shape)).toEqual([{ kind: 'eob_says_zero', billLineIdx: 0, eobLineIdx: 0, expected: 0, billed: 20, difference: 20 }]);
  });

  it('descriptionSimilarity is case-insensitive token overlap over the shorter description', () => {
    expect(descriptionSimilarity('CBC', 'Complete blood count (CBC)')).toBe(1);
    expect(descriptionSimilarity('Office visit', 'office VISIT, established')).toBe(1);
    expect(descriptionSimilarity('Flu vaccine', 'Complete blood count')).toBe(0);
    expect(descriptionSimilarity('', 'anything')).toBe(0);
  });
});

// ---- misc --------------------------------------------------------------------------------------
describe('general', () => {
  it('never flags payments, credits or $0 lines', () => {
    const flags = checkFlags(...docs([bl('99213', 40), bl(null, -40, 'Payment received'), bl('99000', 0)], [el('99213', 40)], 0, 40));
    expect(flags).toEqual([]);
  });

  it('phrases every explanation as a question, without accusations', () => {
    const flags = checkFlags(...docs([bl('90471', 15), bl('90471', 15), bl('97110', 25), bl('99213', 140)], [el('90471', 0), el('99213', 40)], 400, 40));
    expect(flags.length).toBeGreaterThanOrEqual(4);
    for (const f of flags) {
      expect(f.explanation.trim()).toMatch(/\?$/);
      expect(f.explanation).not.toMatch(/\b(fraud\w*|illegal|scam\w*|overcharg\w*|lied|lying|cheat\w*)\b/i);
    }
  });

  it('is pure: does not mutate its inputs', () => {
    const [bill, eob] = docs([bl('80053', 10), bl('80053', 10)], [el('80053', 10)]);
    const before = JSON.stringify([bill, eob]);
    checkFlags(bill, eob);
    expect(JSON.stringify([bill, eob])).toBe(before);
  });

  it('savedAmount sums line-level differences when there is no case-level flag', () => {
    const flags = checkFlags(...docs([bl('90471', 15), bl('97110', 25)], [el('90471', 0)], 40, 0));
    expect(savedAmount(flags)).toBe(40);
    expect(savedAmount([])).toBe(0);
  });
});
