// POST /api/stripe-webhook — Stripe events (TEST mode). Public, but every delivery must carry a valid
// Stripe-Signature for STRIPE_WEBHOOK_SECRET; anything else gets 400. Access to letters is granted and removed
// here only (never by the Checkout success redirect). Idempotent: processed event ids are stored.
import { eventSeen, recordEvent } from '@/lib/billing-repo';
import { handleStripeEvent } from '@/lib/billing-server';
import { requireEnv } from '@/lib/env';
import { jsonError, serverError } from '@/lib/http';
import { stripe } from '@/lib/stripe';

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const body = await request.text();
  let event;
  try {
    if (!signature) throw new Error('no signature');
    event = await stripe().webhooks.constructEventAsync(body, signature, requireEnv('STRIPE_WEBHOOK_SECRET'));
  } catch {
    return jsonError(400, 'Invalid signature.');
  }
  if (event.livemode) return jsonError(400, 'Live-mode events are not accepted.');

  try {
    if (await eventSeen(event.id)) return Response.json({ ok: true, duplicate: true });
    const result = await handleStripeEvent(event);
    // Recorded after handling, so a failure is retried by Stripe; every handler is safe to repeat.
    await recordEvent(event.id);
    console.log(`stripe-webhook ${event.type} ${event.id}: ${result}`);
    return Response.json({ ok: true });
  } catch (err) {
    return serverError(err, 'Could not process the event.'); // non-2xx → Stripe retries
  }
}
