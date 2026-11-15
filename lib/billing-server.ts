// Server-side payment flows: who may send, Stripe Customers, and the webhook handler. The rules themselves are
// pure and live in lib/billing.ts.
import type Stripe from 'stripe';
import type { CurrentUser } from './auth';
import { checkoutGrant, planFromSubscription, planLettersLeft, refundUnpaysCase, sendAccess, type PaidVia, type SendAccess } from './billing';
import {
  countPlanLettersSince,
  findCaseByPaymentIntent,
  findUserByCustomer,
  getBilling,
  getCasePayment,
  savePlan,
  saveCustomerId,
  setCasePaidVia,
  type Billing,
} from './billing-repo';
import { stripe } from './stripe';

export type AccountPlan = { billing: Billing; lettersUsed: number; lettersLeft: number };

export async function accountPlan(userId: string, now = new Date()): Promise<AccountPlan> {
  const billing = await getBilling(userId);
  const lettersUsed = await countPlanLettersSince(userId, billing.periodStart);
  return { billing, lettersUsed, lettersLeft: planLettersLeft(billing, lettersUsed, now) };
}

export type CaseAccess = AccountPlan & { paidVia: PaidVia | null; access: SendAccess };

/** Whether this case's letter can be sent now, and how. Null if the case isn't this user's. */
export async function caseAccess(caseId: string, userId: string, now = new Date()): Promise<CaseAccess | null> {
  const payment = await getCasePayment(caseId, userId);
  if (!payment) return null;
  const plan = await accountPlan(userId, now);
  return { ...plan, paidVia: payment.paidVia, access: sendAccess(payment.paidVia, plan.billing, plan.lettersUsed, now) };
}

/** The user's Stripe Customer, created on first Checkout. */
export async function ensureCustomer(user: CurrentUser): Promise<string> {
  const billing = await getBilling(user.id);
  if (billing.customerId) return billing.customerId;
  const customer = await stripe().customers.create({ email: user.email ?? undefined, metadata: { userId: user.id } });
  await saveCustomerId(user.id, customer.id);
  return customer.id;
}

/**
 * Re-reads the subscription (so out-of-order events can't store a stale state) and stores the plan. After a
 * failed payment Stripe may keep the subscription "active" while it retries; plan letters stop anyway.
 */
async function syncSubscription(subscriptionId: string, userIdHint?: string | null, paymentFailed = false): Promise<string> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const plan = planFromSubscription(sub);
  if (paymentFailed && (plan.status === 'active' || plan.status === 'trialing')) plan.status = 'past_due';
  const userId = userIdHint || sub.metadata?.userId || (plan.customerId ? await findUserByCustomer(plan.customerId) : null);
  if (!userId) return `subscription ${sub.id}: no user`;
  await savePlan(userId, plan);
  return `subscription ${sub.id} → ${plan.status}`;
}

/** Handles one verified Stripe event. Returns a short log line. Safe to run twice for the same event. */
export async function handleStripeEvent(event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const grant = checkoutGrant(event.data.object);
      if (!grant) return 'checkout: nothing to grant';
      if (grant.customerId && !(await getBilling(grant.userId)).customerId) await saveCustomerId(grant.userId, grant.customerId);
      if (grant.kind === 'plan') return syncSubscription(grant.subscriptionId, grant.userId);
      const payment = await getCasePayment(grant.caseId, grant.userId);
      if (!payment) return `checkout: case ${grant.caseId} not found`;
      if (payment.sent) return `checkout: case ${grant.caseId} already sent; payment recorded only`;
      await setCasePaidVia(grant.caseId, grant.userId, 'letter', grant.paymentIntent);
      return `checkout: case ${grant.caseId} paid`;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return syncSubscription(event.data.object.id, event.data.object.metadata?.userId);
    case 'invoice.payment_failed': {
      const ref = event.data.object.parent?.subscription_details?.subscription;
      const subscriptionId = typeof ref === 'string' ? ref : ref?.id;
      if (!subscriptionId) return 'invoice failed: not a subscription';
      const invoice = await stripe().invoices.retrieve(event.data.object.id!);
      if (invoice.status === 'paid') return 'invoice failed: since paid';
      return syncSubscription(subscriptionId, null, true);
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (!pi) return 'refund: no payment intent';
      const found = await findCaseByPaymentIntent(pi);
      if (!found) return 'refund: not a single-letter payment';
      if (!refundUnpaysCase({ fullyRefunded: charge.refunded, paidVia: found.paidVia, sent: found.sent })) {
        return `refund: case ${found.id} unchanged (${found.sent ? 'letter already sent' : 'partial refund'})`;
      }
      await setCasePaidVia(found.id, found.userId, null);
      return `refund: case ${found.id} no longer paid`;
    }
    default:
      return `ignored ${event.type}`;
  }
}
