// Task 2 check: six sample documents and three expected.json files exist and validate against the types,
// and each case satisfies the data constraints in docs/spec.md ("Sample cases").
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SampleExpectedSchema } from '@/lib/schemas';

const DIR = join(__dirname);
const cents = (n: number) => Math.round(n * 100);
const sumCents = (xs: number[]) => xs.reduce((a, n) => a + cents(n), 0);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function load(key: string) {
  return SampleExpectedSchema.parse(JSON.parse(readFileSync(join(DIR, key, 'expected.json'), 'utf8')));
}

describe.each(['a', 'b', 'c'])('sample case %s', (key) => {
  it.each(['bill', 'eob'])('has a %s image', (doc) => {
    const file = join(DIR, key, `${key}-${doc}.png`);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
  });

  it('has an expected.json that validates against the types', () => {
    expect(() => load(key)).not.toThrow();
  });

  it('is internally consistent', () => {
    const { bill, eob, flags, savedAmount } = load(key);
    expect(sumCents(bill.lines.map((l) => l.billed))).toBe(cents(bill.amountDue));
    expect(sumCents(eob.lines.map((l) => l.patientResponsibility))).toBe(cents(eob.totalPatientResponsibility));
    for (const l of eob.lines) expect(cents(l.planPaid) + cents(l.patientResponsibility)).toBe(cents(l.allowed));
    for (const f of flags) expect(cents(f.billed) - cents(f.expected)).toBe(cents(f.difference));
    expect(sumCents(flags.map((f) => f.difference))).toBe(cents(savedAmount));
  });
});

describe('spec sample table', () => {
  it('A is clean', () => {
    const { bill, eob, flags, savedAmount } = load('a');
    expect(flags).toEqual([]);
    expect(savedAmount).toBe(0);
    expect(cents(bill.amountDue)).toBe(cents(eob.totalPatientResponsibility));
  });

  it('B has one duplicate lab line, listed once on the EOB, explaining the whole excess', () => {
    const { bill, eob, flags, savedAmount } = load('b');
    expect(flags.map((f) => f.kind)).toEqual(['duplicate']);
    const [dup] = flags;
    const line = bill.lines[dup.billLineIdx!];
    const twins = bill.lines.filter((l) => l.date === line.date && l.code === line.code && cents(l.billed) === cents(line.billed));
    expect(twins).toHaveLength(2);
    expect(eob.lines.filter((l) => l.date === line.date && l.code === line.code)).toHaveLength(1);
    expect(cents(bill.amountDue) - cents(eob.totalPatientResponsibility)).toBe(cents(line.billed));
    expect(savedAmount).toBe(line.billed);
  });

  it('C is overbilled: $412 vs $45, every line matched with a non-zero EOB share', () => {
    const { bill, eob, flags, savedAmount } = load('c');
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: 'over_patient_responsibility', billed: 412, expected: 45, difference: 367 });
    expect(savedAmount).toBe(367);
    for (const l of bill.lines) {
      const match = eob.lines.find((e) => e.date === l.date && e.code === l.code);
      expect(match?.patientResponsibility).toBeGreaterThan(0);
    }
  });
});

describe('synthetic profile', () => {
  it('has all four redaction fields', () => {
    const p = JSON.parse(readFileSync(join(DIR, 'profile.json'), 'utf8'));
    expect(Object.keys(p).sort()).toEqual(['address', 'dateOfBirth', 'memberId', 'name']);
  });
});
