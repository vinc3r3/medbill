// Payment rules (docs/spec.md, "Payments"). Pure: no Stripe calls, no database. Free checks; a certified letter
// needs either a single-letter payment for that case or an active annual plan with a letter left.

export const PLAN_LETTERS_PER_YEAR = 4;
export const PRICES = {
  letter: { lookupKey: 'letter_single', amount: 14.99, label: '$14.99' },
  plan: { lookupKey: 'plan_annual', amount: 39, label: '$39/year' },
} as const;

export type PaidVia = 'letter' | 'plan';
export type Plan = { status: string | null; periodStart: string | null; periodEnd: string | null };
export const NO_PLAN: Plan = { status: null, periodStart: null, periodEnd: null };

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/** Plan letters are available while the subscription is active/trialing and inside its current period. */
export function planIsActive(plan: Plan, now: Date): boolean {
  if (!plan.status || !ACTIVE_STATUSES.has(plan.status)) return false;
  return !plan.periodEnd || now.getTime() < Date.parse(plan.periodEnd);
}

/** `used` = the user's cases sent with a plan letter since the current period start. */
export function planLettersLeft(plan: Plan, used: number, now: Date): number {
  return planIsActive(plan, now) ? Math.max(0, PLAN_LETTERS_PER_YEAR - used) : 0;
}

export type SendAccess = { ok: true; via: PaidVia } | { ok: false; message: string };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** May this case's letter be sent, and what pays for it? A case paid on its own never uses a plan letter. */
export function sendAccess(casePaidVia: PaidVia | null, plan: Plan, planLettersUsed: number, now: Date): SendAccess {
  if (casePaidVia === 'letter') return { ok: true, via: 'letter' };
  if (planLettersLeft(plan, planLettersUsed, now) > 0) return { ok: true, via: 'plan' };
  if (planIsActive(plan, now)) {
    const renews = plan.periodEnd ? ` Your plan renews on ${fmtDate(plan.periodEnd)}.` : '';
    return {
      ok: false,
      message: `You've used all ${PLAN_LETTERS_PER_YEAR} plan letters this plan year.${renews} Pay ${PRICES.letter.label} to send this one.`,
    };
  }
  return {
    ok: false,
    message: `Sending a certified letter costs ${PRICES.letter.label}, or get the annual plan (${PRICES.plan.label}, ${PLAN_LETTERS_PER_YEAR} letters). Checking bills stays free.`,
  };
}

// --- Webhook mapping (shapes are the parts of Stripe objects we read) ---

type IdOrObject = string | { id: string } | null;
const idOf = (v: IdOrObject | undefined): string | null => (v == null ? null : typeof v === 'string' ? v : v.id);
const isoFromSeconds = (s: number | undefined) => (typeof s === 'number' ? new Date(s * 1000).toISOString() : null);

export type SubscriptionLike = {
  id: string;
  status: string;
  customer: IdOrObject;
  items: { data: Array<{ current_period_start?: number; current_period_end?: number }> };
};

export type PlanRecord = Plan & { subscriptionId: string; customerId: string | null };

/** The plan state to store from a subscription (the current period lives on its item). */
export function planFromSubscription(sub: SubscriptionLike): PlanRecord {
  const item = sub.items.data[0];
  return {
    status: sub.status,
    periodStart: isoFromSeconds(item?.current_period_start),
    periodEnd: isoFromSeconds(item?.current_period_end),
    subscriptionId: sub.id,
    customerId: idOf(sub.customer),
  };
}

export type CheckoutSessionLike = {
  mode: string;
  payment_status: string;
  payment_intent: IdOrObject;
  subscription: IdOrObject;
  customer: IdOrObject;
  metadata: Record<string, string> | null;
};

export type CheckoutGrant =
  | { kind: 'letter'; userId: string; caseId: string; paymentIntent: string; customerId: string | null }
  | { kind: 'plan'; userId: string; subscriptionId: string; customerId: string | null };

/** What a completed Checkout grants. Only the webhook calls this; the success redirect grants nothing. */
export function checkoutGrant(s: CheckoutSessionLike): CheckoutGrant | null {
  const userId = s.metadata?.userId;
  if (!userId) return null;
  const customerId = idOf(s.customer);
  if (s.mode === 'payment') {
    const caseId = s.metadata?.caseId;
    const paymentIntent = idOf(s.payment_intent);
    if (s.payment_status !== 'paid' || !caseId || !paymentIntent) return null;
    return { kind: 'letter', userId, caseId, paymentIntent, customerId };
  }
  if (s.mode === 'subscription') {
    const subscriptionId = idOf(s.subscription);
    return subscriptionId ? { kind: 'plan', userId, subscriptionId, customerId } : null;
  }
  return null;
}

/** A full refund of a single-letter payment unpays the case, unless the letter was already mailed. */
export function refundUnpaysCase(r: { fullyRefunded: boolean; paidVia: PaidVia | null; sent: boolean }): boolean {
  return r.fullyRefunded && r.paidVia === 'letter' && !r.sent;
}

/** What the case page needs to know to offer "send" or "pay and send" (computed on the server). */
export type PaymentView = { canSend: boolean; via: PaidVia | null; message: string | null; planActive: boolean; lettersLeft: number };
