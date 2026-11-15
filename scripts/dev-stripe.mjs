// Local dev with Stripe webhooks: runs `stripe listen` (forwarding to /api/stripe-webhook) and `next dev`, passing
// the listener's signing secret to the server. Uses STRIPE_SECRET_KEY from .env.local (TEST key only), so no
// `stripe login` is needed. Usage: npm run dev:stripe   (needs the Stripe CLI: brew install stripe/stripe-cli/stripe)
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), true);

const key = process.env.STRIPE_SECRET_KEY ?? '';
if (!key.startsWith('sk_test_')) {
  console.error('STRIPE_SECRET_KEY must be a TEST key (sk_test_…).');
  process.exit(1);
}
const port = process.env.PORT ?? '3000';
const events = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'charge.refunded',
].join(',');

const secret = execFileSync('stripe', ['listen', '--api-key', key, '--print-secret'], { encoding: 'utf8' }).trim();
if (!secret.startsWith('whsec_')) {
  console.error('Could not get a webhook signing secret from the Stripe CLI.');
  process.exit(1);
}

const children = [
  spawn('stripe', ['listen', '--api-key', key, '--events', events, '--forward-to', `localhost:${port}/api/stripe-webhook`], { stdio: 'inherit' }),
  spawn('npx', ['next', 'dev', '--port', port], { stdio: 'inherit', env: { ...process.env, STRIPE_WEBHOOK_SECRET: secret } }),
];
const stop = () => children.forEach((c) => c.kill('SIGINT'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', (code) => { stop(); process.exitCode = code ?? 0; }));
