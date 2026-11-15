// POST /api/checkout — { kind: 'letter', caseId } | { kind: 'plan', caseId? } → { url } of a Stripe Checkout page
// (TEST mode). Paying grants nothing here: access comes from /api/stripe-webhook. Checkout returns to the case
// page (or Settings for a plan bought there).
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { planIsActive } from '@/lib/billing';
import { caseAccess, ensureCustomer, accountPlan } from '@/lib/billing-server';
import { getCase } from '@/lib/cases-repo';
import { jsonError, readBody, serverError } from '@/lib/http';
import { BillingError, priceId, stripe } from '@/lib/stripe';

const Body = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('letter'), caseId: z.uuid({ error: 'caseId must be a case id.' }) }),
    z.object({ kind: z.literal('plan'), caseId: z.uuid({ error: 'caseId must be a case id.' }).optional() }),
  ],
  { error: 'Send JSON like { "kind": "letter", "caseId" } or { "kind": "plan" }.' },
);

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;
  const origin = new URL(request.url).origin;
  try {
    let returnPath = '/settings';
    if (body.caseId) {
      const found = await getCase(body.caseId, user.id);
      if (!found) return jsonError(404, "We couldn't find that case.");
      returnPath = `/cases/${found.id}`;
      if (body.kind === 'letter') {
        if (found.status !== 'letter_ready') return jsonError(409, found.mailLetterId ? 'This letter has already been sent.' : 'Draft and approve the letter first.');
        const access = await caseAccess(found.id, user.id);
        if (access?.paidVia === 'letter') return jsonError(409, 'This letter is already paid for.');
      }
    }
    if (body.kind === 'plan' && planIsActive((await accountPlan(user.id)).billing, new Date())) {
      return jsonError(409, 'You already have the annual plan.');
    }

    const customer = await ensureCustomer(user);
    const metadata: Record<string, string> = { userId: user.id };
    if (body.caseId) metadata.caseId = body.caseId;
    const session = await stripe().checkout.sessions.create({
      customer,
      mode: body.kind === 'letter' ? 'payment' : 'subscription',
      line_items: [{ price: await priceId(body.kind), quantity: 1 }],
      metadata,
      // US-only service: always charge in USD (no local-currency conversion).
      adaptive_pricing: { enabled: false },
      ...(body.kind === 'letter'
        ? { payment_intent_data: { metadata } }
        : { subscription_data: { metadata: { userId: user.id } } }),
      success_url: `${origin}${returnPath}?checkout=done`,
      cancel_url: `${origin}${returnPath}?checkout=cancelled`,
    });
    if (!session.url) throw new Error('Checkout session has no URL');
    return Response.json({ url: session.url });
  } catch (err) {
    if (err instanceof BillingError) return jsonError(err.status, err.message);
    return serverError(err, "We couldn't start the payment. Please try again.");
  }
}
