// POST /api/billing-portal — none → { url } of the Stripe Customer Portal (TEST mode): update the card, see
// invoices, cancel the plan (at period end). Returns to Settings.
import { requireApiUser } from '@/lib/auth';
import { getBilling } from '@/lib/billing-repo';
import { jsonError, serverError } from '@/lib/http';
import { BillingError, stripe } from '@/lib/stripe';

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  try {
    const { customerId } = await getBilling(user.id);
    if (!customerId) return jsonError(409, 'There are no payments on this account yet.');
    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${new URL(request.url).origin}/settings`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    if (err instanceof BillingError) return jsonError(err.status, err.message);
    return serverError(err, "We couldn't open billing. Please try again.");
  }
}
