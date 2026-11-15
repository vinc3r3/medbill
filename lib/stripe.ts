// Stripe client, TEST mode only (docs/spec.md, "Payments"). Server only. Refuses any key that isn't sk_test_.
import Stripe from 'stripe';
import { requireEnv } from './env';
import { PRICES } from './billing';

export class BillingError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (client) return client;
  const key = requireEnv('STRIPE_SECRET_KEY');
  if (!key.startsWith('sk_test_')) throw new BillingError('Payments are configured with a non-test key. This demo only allows test mode.');
  client = new Stripe(key);
  return client;
}

const priceIds = new Map<string, string>();
/** The Price id for a lookup key (created by `npm run stripe:setup`). Cached per server instance. */
export async function priceId(kind: keyof typeof PRICES): Promise<string> {
  const lookupKey = PRICES[kind].lookupKey;
  const cached = priceIds.get(lookupKey);
  if (cached) return cached;
  const { data } = await stripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (!data[0]) throw new BillingError(`Stripe price "${lookupKey}" is missing. Run npm run stripe:setup.`);
  priceIds.set(lookupKey, data[0].id);
  return data[0].id;
}
