import { describe, expect, it } from 'vitest';
import {
  NO_PLAN,
  PLAN_LETTERS_PER_YEAR,
  checkoutGrant,
  planFromSubscription,
  planIsActive,
  planLettersLeft,
  refundUnpaysCase,
  sendAccess,
  type Plan,
} from './billing';

const now = new Date('2026-11-15T12:00:00Z');
const active: Plan = { status: 'active', periodStart: '2026-06-01T00:00:00.000Z', periodEnd: '2027-06-01T00:00:00.000Z' };

describe('planIsActive', () => {
  it('is active while status is active or trialing and the period has not ended', () => {
    expect(planIsActive(active, now)).toBe(true);
    expect(planIsActive({ ...active, status: 'trialing' }, now)).toBe(true);
  });
  it('is not active without a plan or with a failing/cancelled status', () => {
    expect(planIsActive(NO_PLAN, now)).toBe(false);
    for (const status of ['past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused']) {
      expect(planIsActive({ ...active, status }, now)).toBe(false);
    }
  });
  it('is not active once the period has ended (a renewal we never heard about)', () => {
    expect(planIsActive({ ...active, periodEnd: '2026-11-01T00:00:00.000Z' }, now)).toBe(false);
  });
});

describe('planLettersLeft', () => {
  it('starts at 4 and counts down, never below 0', () => {
    expect(PLAN_LETTERS_PER_YEAR).toBe(4);
    expect(planLettersLeft(active, 0, now)).toBe(4);
    expect(planLettersLeft(active, 3, now)).toBe(1);
    expect(planLettersLeft(active, 4, now)).toBe(0);
    expect(planLettersLeft(active, 9, now)).toBe(0);
  });
  it('is 0 without an active plan', () => {
    expect(planLettersLeft(NO_PLAN, 0, now)).toBe(0);
    expect(planLettersLeft({ ...active, status: 'past_due' }, 0, now)).toBe(0);
  });
});

describe('sendAccess', () => {
  it('a paid case sends as a single letter and does not use a plan letter', () => {
    expect(sendAccess('letter', active, 0, now)).toEqual({ ok: true, via: 'letter' });
    expect(sendAccess('letter', NO_PLAN, 0, now)).toEqual({ ok: true, via: 'letter' });
  });
  it('an unpaid case uses a plan letter when one is left', () => {
    expect(sendAccess(null, active, 3, now)).toEqual({ ok: true, via: 'plan' });
  });
  it('blocks the 5th plan letter in a plan year, with a readable message', () => {
    const r = sendAccess(null, active, 4, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/all 4 plan letters/);
  });
  it('blocks an unpaid case without a plan', () => {
    const r = sendAccess(null, NO_PLAN, 0, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/\$14\.99/);
  });
  it('blocks when the plan payment failed', () => {
    expect(sendAccess(null, { ...active, status: 'past_due' }, 0, now).ok).toBe(false);
  });
});

describe('planFromSubscription', () => {
  it('reads status, current period (from the item) and ids', () => {
    const sub = {
      id: 'sub_1',
      status: 'active',
      customer: 'cus_1',
      items: { data: [{ current_period_start: 1780272000, current_period_end: 1811808000 }] },
    };
    expect(planFromSubscription(sub)).toEqual({
      status: 'active',
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2027-06-01T00:00:00.000Z',
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
    });
  });
  it('accepts an expanded customer and a subscription without items', () => {
    const p = planFromSubscription({ id: 'sub_2', status: 'canceled', customer: { id: 'cus_2' }, items: { data: [] } });
    expect(p).toMatchObject({ status: 'canceled', periodStart: null, periodEnd: null, customerId: 'cus_2' });
  });
});

describe('checkoutGrant', () => {
  const base = { metadata: { userId: 'u1', caseId: 'c1' }, customer: 'cus_1' };
  it('a paid one-time Checkout grants one letter for that case', () => {
    expect(checkoutGrant({ ...base, mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', subscription: null })).toEqual({
      kind: 'letter',
      userId: 'u1',
      caseId: 'c1',
      paymentIntent: 'pi_1',
      customerId: 'cus_1',
    });
  });
  it('an unpaid one-time Checkout grants nothing', () => {
    expect(checkoutGrant({ ...base, mode: 'payment', payment_status: 'unpaid', payment_intent: 'pi_1', subscription: null })).toBeNull();
  });
  it('a subscription Checkout points at the subscription to sync', () => {
    expect(checkoutGrant({ ...base, mode: 'subscription', payment_status: 'paid', payment_intent: null, subscription: 'sub_1' })).toEqual({
      kind: 'plan',
      userId: 'u1',
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
    });
  });
  it('ignores sessions without our metadata', () => {
    expect(checkoutGrant({ mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', subscription: null, metadata: {}, customer: null })).toBeNull();
  });
});

describe('refundUnpaysCase', () => {
  it('a full refund before sending unpays a single-letter case', () => {
    expect(refundUnpaysCase({ fullyRefunded: true, paidVia: 'letter', sent: false })).toBe(true);
  });
  it('a sent letter cannot be recalled; partial refunds and plan sends change nothing', () => {
    expect(refundUnpaysCase({ fullyRefunded: true, paidVia: 'letter', sent: true })).toBe(false);
    expect(refundUnpaysCase({ fullyRefunded: false, paidVia: 'letter', sent: false })).toBe(false);
    expect(refundUnpaysCase({ fullyRefunded: true, paidVia: 'plan', sent: false })).toBe(false);
    expect(refundUnpaysCase({ fullyRefunded: true, paidVia: null, sent: false })).toBe(false);
  });
});
