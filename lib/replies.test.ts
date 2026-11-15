// Reply tracking (docs/spec.md, "Replies"). Written before lib/replies.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFlags, savedAmount } from './flags';
import { ReplyError, applyReply, caseRef, questionedAmount, remainingFlags } from './replies';
import type { BillDoc, Case, CaseStatus } from './types';

const SAMPLES = join(__dirname, '..', 'samples');
const load = (key: string) => JSON.parse(readFileSync(join(SAMPLES, key, 'expected.json'), 'utf8'));
const corrected: BillDoc = JSON.parse(readFileSync(join(SAMPLES, 'c', 'corrected.json'), 'utf8'));
const NOW = '2026-11-15T12:00:00.000Z';

function sampleCase(key: string, status: CaseStatus = 'delivered'): Case {
  const exp = load(key);
  const flags = checkFlags(exp.bill, exp.eob);
  return {
    id: '7f3a91c2-0000-4000-8000-000000000000', status, bill: exp.bill, eob: exp.eob, flags, letter: 'x',
    mailLetterId: 'letter_1', previewUrl: null, sentAt: '2026-10-01T00:00:00Z', savedAmount: savedAmount(flags),
    createdAt: '2026-10-01T00:00:00Z', replies: [],
  };
}
const withBill = (bill: BillDoc, amountDue: number): BillDoc => ({ ...bill, amountDue });

describe('caseRef', () => {
  it('is MB- plus the first 4 hex digits of the case id, uppercased', () => {
    expect(caseRef('7f3a91c2-1111-4000-8000-000000000000')).toBe('MB-7F3A');
    expect(caseRef('00ab0000-0000-4000-8000-000000000000')).toBe('MB-00AB');
  });
});

describe('the corrected sample statement for case C', () => {
  it('asks for exactly what the EOB says ($45) and raises no flags', () => {
    expect(corrected.amountDue).toBe(45);
    expect(checkFlags(corrected, load('c').eob)).toEqual([]);
  });
});

describe('applyReply: corrected', () => {
  it('case C, corrected statement for $45 → resolved with $367 saved (Task 15 "Done when")', () => {
    const next = applyReply(sampleCase('c'), { outcome: 'corrected', bill: corrected }, NOW);
    expect(next.status).toBe('resolved');
    expect(next.savedAmount).toBe(367);
    expect(next.replies).toEqual([{ outcome: 'corrected', receivedAt: NOW, bill: corrected }]);
  });

  it('saves the actual reduction when the provider only partly corrects the bill', () => {
    const next = applyReply(sampleCase('c'), { outcome: 'corrected', bill: withBill(corrected, 200) }, NOW);
    expect(next.status).toBe('resolved');
    expect(next.savedAmount).toBe(212);
  });

  it('never saves more than the amount questioned', () => {
    const c = sampleCase('b'); // questioned $28.75; amountDue $118.50
    const next = applyReply(c, { outcome: 'corrected', bill: withBill(c.bill, 0) }, NOW);
    expect(next.savedAmount).toBe(28.75);
  });

  it('works in cents (no float drift)', () => {
    const c = sampleCase('b');
    const next = applyReply(c, { outcome: 'corrected', bill: withBill(c.bill, 118.5 - 28.75) }, NOW);
    expect(next.savedAmount).toBe(28.75);
  });

  it('needs the corrected statement', () => {
    expect(() => applyReply(sampleCase('c'), { outcome: 'corrected', bill: null }, NOW)).toThrow(ReplyError);
  });

  it('refuses a "corrected" statement that does not lower the amount due', () => {
    const c = sampleCase('c');
    expect(() => applyReply(c, { outcome: 'corrected', bill: c.bill }, NOW)).toThrow(/same|lower|denied/i);
    expect(() => applyReply(c, { outcome: 'corrected', bill: withBill(c.bill, 500) }, NOW)).toThrow(ReplyError);
  });

  it('keeps earlier replies', () => {
    const c = applyReply(sampleCase('c'), { outcome: 'more_info', bill: null }, '2026-11-01T00:00:00.000Z');
    const next = applyReply({ ...sampleCase('c'), ...c }, { outcome: 'corrected', bill: corrected }, NOW);
    expect(next.replies.map((r) => r.outcome)).toEqual(['more_info', 'corrected']);
  });
});

describe('applyReply: denied / more info', () => {
  it.each(['denied', 'more_info'] as const)('%s keeps the case open with the amount still questioned', (outcome) => {
    const c = sampleCase('c', 'sent');
    const next = applyReply(c, { outcome, bill: null }, NOW);
    expect(next.status).toBe('sent');
    expect(next.savedAmount).toBe(367);
    expect(next.replies).toEqual([{ outcome, receivedAt: NOW, bill: null }]);
  });
});

describe('applyReply: when replies are accepted', () => {
  it.each(['uploaded', 'checked', 'letter_ready'] as const)('refuses before the letter is sent (%s)', (status) => {
    expect(() => applyReply(sampleCase('c', status), { outcome: 'denied', bill: null }, NOW)).toThrow(/send the letter first/i);
  });

  it('refuses once the case is resolved', () => {
    expect(() => applyReply(sampleCase('c', 'resolved'), { outcome: 'denied', bill: null }, NOW)).toThrow(/already resolved/i);
  });

  it('accepts a reply whether or not delivery was reported', () => {
    expect(applyReply(sampleCase('c', 'sent'), { outcome: 'corrected', bill: corrected }, NOW).status).toBe('resolved');
  });
});

describe('questionedAmount and remainingFlags', () => {
  it('questionedAmount is the amount the letter questioned, even after the case is resolved', () => {
    const c = sampleCase('c');
    const resolved = { ...c, ...applyReply(c, { outcome: 'corrected', bill: withBill(corrected, 200) }, NOW) };
    expect(resolved.savedAmount).toBe(212);
    expect(questionedAmount(resolved)).toBe(367);
  });

  it('remainingFlags compares the latest corrected statement with the EOB', () => {
    const c = sampleCase('c');
    expect(remainingFlags(c)).toBeNull();
    const fixed = { ...c, ...applyReply(c, { outcome: 'corrected', bill: corrected }, NOW) };
    expect(remainingFlags(fixed)).toEqual([]);
    const partly = { ...c, ...applyReply(c, { outcome: 'corrected', bill: withBill(corrected, 200) }, NOW) };
    expect(remainingFlags(partly)?.map((f) => f.kind)).toEqual(['over_patient_responsibility']);
  });
});
