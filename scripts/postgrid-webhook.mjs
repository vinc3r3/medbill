// Registers (once) the PostGrid TEST-mode webhook for letter.updated → <SITE_URL>/api/mail-webhook, signed
// with POSTGRID_WEBHOOK_SECRET (JWT, HS256). Usage: SITE_URL=https://… npm run postgrid:webhook
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), true);
const key = process.env.POSTGRID_API_KEY ?? '';
const secret = process.env.POSTGRID_WEBHOOK_SECRET ?? '';
const site = process.env.SITE_URL ?? 'https://medbill-zimran.vercel.app';
if (!key.startsWith('test_')) throw new Error('POSTGRID_API_KEY must be a test key');
if (secret.length < 20) throw new Error('POSTGRID_WEBHOOK_SECRET must be at least 20 characters');

const B = 'https://api.postgrid.com/print-mail/v1';
const H = { 'x-api-key': key, 'content-type': 'application/json' };
const url = `${site.replace(/\/$/, '')}/api/mail-webhook`;
const existing = await (await fetch(`${B}/webhooks?limit=100`, { headers: H })).json();
const found = (existing.data ?? []).find((w) => w.url === url);
if (found) {
  console.log(`already registered: ${found.id} → ${found.url} (${found.enabledEvents}, ${found.payloadFormat}, enabled=${found.enabled})`);
} else {
  const r = await fetch(`${B}/webhooks`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ url, enabledEvents: ['letter.updated'], payloadFormat: 'jwt', secret, description: 'MedBill tracking (test mode)' }),
  });
  const w = await r.json();
  if (!r.ok) throw new Error(`create failed: ${JSON.stringify(w.error ?? w)}`);
  console.log(`registered: ${w.id} → ${w.url} (${w.enabledEvents}, ${w.payloadFormat})`);
}
