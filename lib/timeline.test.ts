// Case tracking timeline (Task 18). Written before lib/timeline.ts.
import { describe, expect, it } from 'vitest';
import { timeline } from './timeline';
import type { Case, CaseStatus, Reply } from './types';

const base = (over: Partial<Case> = {}): Case => ({
  id: '7f3a91c2-0000-4000-8000-000000000000', status: 'checked', letter: null, mailLetterId: null, previewUrl: null,
  sentAt: null, savedAmount: 367, createdAt: '2026-10-01T10:00:00Z', replies: [],
  bill: { provider: 'P', serviceDate: '2026-07-21', lines: [], amountDue: 412 },
  eob: { insurer: 'I', claimId: 'C', lines: [], totalPatientResponsibility: 45 },
  flags: [{ kind: 'over_patient_responsibility', billLineIdx: null, eobLineIdx: null, expected: 45, billed: 412, difference: 367, explanation: 'x' }],
  ...over,
});
const sent = (status: CaseStatus, over: Partial<Case> = {}) => base({ status, mailLetterId: 'l', sentAt: '2026-10-02T09:00:00Z', ...over });
const reply = (outcome: Reply['outcome'], receivedAt: string, amountDue?: number): Reply => ({
  outcome, receivedAt, bill: amountDue === undefined ? null : { provider: 'P', serviceDate: '2026-07-21', lines: [], amountDue },
});
const NOW = new Date('2026-10-10T00:00:00Z');
const summary = (c: Case, now = NOW) => timeline(c, now).map((s) => `${s.key}:${s.state}`);

describe('timeline', () => {
  it('a checked case: checked done, letter is the current step, the rest upcoming', () => {
    expect(summary(base())).toEqual(['checked:done', 'sent:current', 'delivered:upcoming', 'reply:upcoming', 'resolved:upcoming']);
  });

  it('a clean case (nothing to question) stops after the check', () => {
    expect(summary(base({ flags: [], savedAmount: 0 }))).toEqual(['checked:done']);
  });

  it('dates: checked = createdAt, sent = sentAt, reply step shows the follow-up date', () => {
    const steps = timeline(sent('sent'), NOW);
    expect(steps.find((s) => s.key === 'checked')?.date).toBe('2026-10-01T10:00:00Z');
    expect(steps.find((s) => s.key === 'sent')?.date).toBe('2026-10-02T09:00:00Z');
    expect(steps.find((s) => s.key === 'reply')?.date).toBe('2026-11-01');
  });

  it('sent: waiting for delivery', () => {
    expect(summary(sent('sent'))).toEqual(['checked:done', 'sent:done', 'delivered:current', 'reply:upcoming', 'resolved:upcoming']);
  });

  it('delivered: waiting for a reply; after 30 days the reply step needs attention', () => {
    expect(summary(sent('delivered'))).toEqual(['checked:done', 'sent:done', 'delivered:done', 'reply:current', 'resolved:upcoming']);
    const late = new Date('2026-11-02T00:00:00Z');
    expect(timeline(sent('delivered'), late).find((s) => s.key === 'reply')?.state).toBe('attention');
  });

  it('each reply is its own step, in order', () => {
    const c = sent('delivered', { replies: [reply('more_info', '2026-10-05T00:00:00Z'), reply('denied', '2026-10-08T00:00:00Z')] });
    const steps = timeline(c, NOW);
    expect(steps.map((s) => s.key)).toEqual(['checked', 'sent', 'delivered', 'reply-0', 'reply-1', 'resolved']);
    expect(steps[3]).toMatchObject({ state: 'done', date: '2026-10-05T00:00:00Z', label: 'Reply: asked for more information' });
    expect(steps[4]).toMatchObject({ state: 'done', label: 'Reply: kept the bill as it is' });
    expect(steps[5].state).toBe('upcoming');
  });

  it('resolved: every step done, with the saving and date; a reply implies the letter arrived', () => {
    const c = sent('resolved', { savedAmount: 367, replies: [reply('corrected', '2026-10-09T00:00:00Z', 45)] });
    const steps = timeline(c, NOW);
    expect(steps.map((s) => `${s.key}:${s.state}`)).toEqual(['checked:done', 'sent:done', 'delivered:done', 'reply-0:done', 'resolved:done']);
    expect(steps[3].detail).toBe('New amount due: $45.00');
    expect(steps[4]).toMatchObject({ date: '2026-10-09T00:00:00Z', detail: '$367.00 saved' });
  });
});
