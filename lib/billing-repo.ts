// Data access for payments: `billing` (plan per user), `stripe_events` (processed webhooks) and the payment
// columns on `cases`. Server only. User-facing functions take the signed-in user's id; the `ByX` lookups are for
// the signature-verified Stripe webhook.
import { db } from './cases-repo';
import { NO_PLAN, type PaidVia, type Plan, type PlanRecord } from './billing';

export type Billing = Plan & { customerId: string | null; subscriptionId: string | null };

type BillingRow = {
  user_id: string;
  stripe_customer_id: string | null;
  plan_status: string | null;
  plan_period_start: string | null;
  plan_period_end: string | null;
  stripe_subscription_id: string | null;
};

const rowToBilling = (r: BillingRow | null): Billing =>
  r
    ? { customerId: r.stripe_customer_id, status: r.plan_status, periodStart: r.plan_period_start, periodEnd: r.plan_period_end, subscriptionId: r.stripe_subscription_id }
    : { ...NO_PLAN, customerId: null, subscriptionId: null };

export async function getBilling(userId: string): Promise<Billing> {
  const { data, error } = await db().from('billing').select().eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Could not load billing: ${error.message}`);
  return rowToBilling(data as BillingRow | null);
}

// Postgres foreign-key violation: the user was deleted (late Stripe events for a removed account are ignored).
const USER_GONE = '23503';

export async function saveCustomerId(userId: string, customerId: string): Promise<void> {
  const { error } = await db().from('billing').upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' });
  if (error?.code === USER_GONE) return;
  if (error) throw new Error(`Could not save customer: ${error.message}`);
}

export async function findUserByCustomer(customerId: string): Promise<string | null> {
  const { data, error } = await db().from('billing').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
  if (error) throw new Error(`Could not look up customer: ${error.message}`);
  return data?.user_id ?? null;
}

export async function savePlan(userId: string, plan: PlanRecord): Promise<void> {
  const row: Partial<BillingRow> & { user_id: string } = {
    user_id: userId,
    plan_status: plan.status,
    plan_period_start: plan.periodStart,
    plan_period_end: plan.periodEnd,
    stripe_subscription_id: plan.subscriptionId,
  };
  if (plan.customerId) row.stripe_customer_id = plan.customerId;
  const { error } = await db().from('billing').upsert(row, { onConflict: 'user_id' });
  if (error?.code === USER_GONE) return;
  if (error) throw new Error(`Could not save plan: ${error.message}`);
}

/** Cases this user sent with a plan letter since `sinceIso` (the current plan period start). */
export async function countPlanLettersSince(userId: string, sinceIso: string | null): Promise<number> {
  if (!sinceIso) return 0;
  const { count, error } = await db()
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('paid_via', 'plan')
    .gte('sent_at', sinceIso);
  if (error) throw new Error(`Could not count plan letters: ${error.message}`);
  return count ?? 0;
}

export type CasePayment = { paidVia: PaidVia | null; paymentIntent: string | null; sent: boolean };

export async function getCasePayment(caseId: string, userId: string): Promise<CasePayment | null> {
  const { data, error } = await db().from('cases').select('paid_via, stripe_payment_intent, mail_letter_id').eq('id', caseId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Could not load payment: ${error.message}`);
  return data ? { paidVia: data.paid_via, paymentIntent: data.stripe_payment_intent, sent: !!data.mail_letter_id } : null;
}

/** Records how a case's letter is paid ('letter' from the webhook, 'plan' when sending). */
export async function setCasePaidVia(caseId: string, userId: string, paidVia: PaidVia | null, paymentIntent?: string | null): Promise<void> {
  const patch: Record<string, unknown> = { paid_via: paidVia };
  if (paymentIntent !== undefined) patch.stripe_payment_intent = paymentIntent;
  const { error } = await db().from('cases').update(patch).eq('id', caseId).eq('user_id', userId);
  if (error) throw new Error(`Could not update payment: ${error.message}`);
}

export async function findCaseByPaymentIntent(paymentIntent: string): Promise<({ id: string; userId: string } & CasePayment) | null> {
  const { data, error } = await db()
    .from('cases')
    .select('id, user_id, paid_via, stripe_payment_intent, mail_letter_id')
    .eq('stripe_payment_intent', paymentIntent)
    .maybeSingle();
  if (error) throw new Error(`Could not look up payment: ${error.message}`);
  return data ? { id: data.id, userId: data.user_id, paidVia: data.paid_via, paymentIntent: data.stripe_payment_intent, sent: !!data.mail_letter_id } : null;
}

export async function eventSeen(eventId: string): Promise<boolean> {
  const { data, error } = await db().from('stripe_events').select('id').eq('id', eventId).maybeSingle();
  if (error) throw new Error(`Could not check event: ${error.message}`);
  return !!data;
}

export async function recordEvent(eventId: string): Promise<void> {
  const { error } = await db().from('stripe_events').upsert({ id: eventId }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(`Could not record event: ${error.message}`);
}
