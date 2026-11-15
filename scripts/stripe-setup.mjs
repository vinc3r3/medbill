// Creates the two Stripe Prices (TEST mode) the app looks up by key: letter_single ($14.99 one-time) and
// plan_annual ($39/year). Safe to re-run: existing prices are kept. Usage: npm run stripe:setup
import { createRequire } from 'node:module';
import Stripe from 'stripe';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), true);

const key = process.env.STRIPE_SECRET_KEY ?? '';
if (!key.startsWith('sk_test_')) {
  console.error('STRIPE_SECRET_KEY must be a TEST key (sk_test_…). Nothing was created.');
  process.exit(1);
}
const stripe = new Stripe(key);

const PRICES = [
  { lookup_key: 'letter_single', product: 'MedBill certified dispute letter', unit_amount: 1499 },
  { lookup_key: 'plan_annual', product: 'MedBill annual plan (4 certified letters a year)', unit_amount: 3900, recurring: { interval: 'year' } },
];

for (const p of PRICES) {
  const { data } = await stripe.prices.list({ lookup_keys: [p.lookup_key], active: true, limit: 1 });
  if (data[0]) {
    console.log(`ok   ${p.lookup_key} exists (${data[0].id}, $${(data[0].unit_amount / 100).toFixed(2)})`);
    continue;
  }
  const price = await stripe.prices.create({
    lookup_key: p.lookup_key,
    currency: 'usd',
    unit_amount: p.unit_amount,
    ...(p.recurring ? { recurring: p.recurring } : {}),
    product_data: { name: p.product },
  });
  console.log(`new  ${p.lookup_key} created (${price.id}, $${(p.unit_amount / 100).toFixed(2)})`);
}
