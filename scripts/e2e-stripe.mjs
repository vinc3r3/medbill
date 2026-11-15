// Task 17 check (Stripe TEST mode). Needs `npm run dev:stripe` running (dev server + `stripe listen`).
// - sending without payment or plan letters → 402
// - single letter: Checkout with 4242 → webhook marks the case paid → the letter is sent
// - failed card (4000 0000 0000 0341) on Checkout → the case stays unpaid
// - refund before sending → the case is no longer paid (402 again)
// - plan: Checkout with 4242 → webhook activates it (4 of 4); 4 plan letters send, the 5th is blocked
// - failed renewal payment → plan letters stop; cancelled plan → no plan letters
// - webhook: bad signature → 400; a repeated event is processed once
// Usage: BASE_URL=… npm run e2e:stripe. Deletes its test user and Stripe test customer.
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createTestUser, deleteTestUser, signIn } from './e2e-helpers.mjs';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), true);
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = join(process.env.OUT_DIR ?? '.e2e', 'stripe');
mkdirSync(OUT_DIR, { recursive: true });
const key = process.env.STRIPE_SECRET_KEY ?? '';
if (!key.startsWith('sk_test_')) throw new Error('STRIPE_SECRET_KEY must be a TEST key.');
const stripe = new Stripe(key);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
const check = (ok, label) => (ok ? console.log(`  ok   ${label}`) : fail(label));
const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));
const [mm, dd, yyyy] = profile.dateOfBirth.split('/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls fn() until it returns a truthy value (or times out → null). */
async function until(fn, { timeout = 45_000, every = 1_000 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(every);
  }
  return null;
}

const casePay = async (id) => (await db.from('cases').select('paid_via, stripe_payment_intent, status').eq('id', id).single()).data;
const billingRow = async (userId) => (await db.from('billing').select().eq('user_id', userId).maybeSingle()).data;

const TO = { name: 'Billing Office', addressLine1: '4500 Ridgeline Pkwy', city: 'Fairhaven', state: 'OH', zip: '45097' };
const FROM = { name: profile.name, addressLine1: '12 Test Lane', city: 'Fairhaven', state: 'OH', zip: '45098' };

/** The frame that holds Stripe Checkout's payment form (the page itself is mostly an iframe shell). */
async function checkoutForm(page) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  const frame = await until(async () => page.frames().find((f) => f.url().includes('elements-inner-habanero')), { timeout: 30_000, every: 500 });
  if (!frame) throw new Error('Stripe Checkout form not found');
  return frame;
}

/** Fills the card form and clicks Pay/Subscribe. */
async function fillAndSubmit(page, card) {
  const f = await checkoutForm(page);
  const number = f.locator('input[name="number"]');
  if (!(await number.isVisible({ timeout: 10_000 }).catch(() => false))) {
    await f.getByText('Card', { exact: true }).first().click();
  }
  await number.waitFor({ timeout: 30_000 });
  await number.fill(card);
  await f.locator('input[name="expiry"]').fill('12 / 34');
  await f.locator('input[name="cvc"]').fill('123');
  const name = f.locator('input[name="name"]');
  if (await name.isVisible().catch(() => false)) await name.fill('Test Person');
  const country = f.locator('select[name="country"]');
  if (await country.isVisible().catch(() => false)) await country.selectOption('US');
  const zip = f.locator('input[name="postalCode"]');
  if (await zip.isVisible({ timeout: 2_000 }).catch(() => false)) await zip.fill('45098');
  const link = f.locator('input[name="linkOptIn"]');
  if (await link.isChecked().catch(() => false)) await link.uncheck();
  await f.getByRole('button', { name: /^(Pay|Subscribe)$/ }).click();
  return f;
}

const declinedShown = async (page, f) => {
  for (const fr of [page.mainFrame(), f]) if (await fr.getByText(/declined/i).count().catch(() => 0)) return true;
  return false;
};

/**
 * Pays a Stripe hosted Checkout page with a test card. Stripe's invisible bot check sometimes stalls an automated
 * Checkout after "Pay"; then the page is reloaded and the payment retried (the session is still open, so this
 * can't charge twice). `expect` = 'leave' (redirected back to us) or 'declined' (card declined message shown).
 */
async function payOnCheckout(page, card, { expect = 'leave', attempts = 3 } = {}) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  const checkoutUrl = page.url();
  for (let i = 1; i <= attempts; i++) {
    const f = await fillAndSubmit(page, card);
    const done = await until(
      async () => (expect === 'leave' ? !page.url().startsWith('https://checkout.stripe.com') : declinedShown(page, f)),
      { timeout: 45_000 },
    );
    if (done) return f;
    console.log(`  (Checkout stalled after Pay, attempt ${i}; retrying)`);
    await page.screenshot({ path: join(OUT_DIR, `checkout-stall-${i}.png`) }).catch(() => {});
    await page.goto(checkoutUrl);
  }
  throw new Error(`Stripe Checkout did not complete after ${attempts} attempts`);
}

/** Drafts the letter (status → letter_ready) and returns it filled, as the browser would at approval. */
async function readyLetter(api, caseId) {
  const r = await api.post(`${BASE_URL}/api/letter`, { data: { caseId } });
  if (!r.ok()) throw new Error(`/api/letter ${r.status()}: ${await r.text()}`);
  const { letter } = await r.json();
  return letter.replaceAll('{{PATIENT_NAME}}', profile.name).replaceAll('{{MEMBER_ID}}', profile.memberId).replaceAll('{{ADDRESS}}', profile.address);
}
const sendViaApi = (api, caseId, letterText) => api.post(`${BASE_URL}/api/send`, { data: { caseId, letterText, to: TO, from: FROM }, timeout: 90_000 });

// HEADED=1 shows the browser; Stripe's invisible bot check sometimes stalls headless Checkout.
let clock = null;
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' });
const user = await createTestUser('stripe');
const consoleErrors = [];
try {
  // Desktop: Stripe's hosted Checkout ignores emulated-mobile clicks on Pay (real phones are fine; 390px is checked by e2e:frontend).
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const api = context.request;
  page.on('console', (m) => m.type() === 'error' && page.url().startsWith(BASE_URL) && !/404 \(Not Found\)|402 \(Payment Required\)/.test(m.text()) && consoleErrors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => consoleErrors.push(e.message.slice(0, 200)));
  await signIn(page, BASE_URL, user);

  // Profile (needed to approve letters) and six flagged sample cases (B and C, three times; no AI).
  await page.goto(`${BASE_URL}/settings`);
  await page.locator('[data-testid="profile-form"][data-ready]').waitFor();
  if (!(await page.getByLabel('Full name').isVisible())) await page.locator('[data-testid="profile-form"] summary').click();
  await page.getByLabel('Full name').fill(profile.name);
  await page.getByLabel('Date of birth').fill(`${yyyy}-${mm}-${dd}`);
  await page.getByLabel('Insurance member ID').fill(profile.memberId);
  await page.getByLabel('Mailing address').fill(profile.address);
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByText('Saved on this device.').waitFor();
  check((await page.getByTestId('plan-badge').textContent()) === 'Pay per letter', 'settings: no plan yet ("Pay per letter")');
  for (let i = 0; i < 3; i++) {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.locator('[data-testid="demo-tools"][data-ready]').waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Load sample cases' }).click();
    await page.getByText('Loaded sample cases A, B and C.').waitFor({ timeout: 30_000 });
  }
  const { data: all } = await db.from('cases').select('id, flags, created_at').eq('user_id', user.id).order('created_at');
  const flagged = all.filter((c) => c.flags.length > 0).map((c) => c.id);
  check(flagged.length === 6, `seeded 6 flagged cases (${flagged.length})`);
  const [single, refunded, ...planCases] = flagged;

  // 1. Blocked without payment.
  await page.goto(`${BASE_URL}/cases/${single}`);
  await page.getByRole('button', { name: 'Draft a letter' }).click();
  await page.getByTestId('letter-editor').waitFor();
  await page.getByRole('button', { name: 'Approve letter' }).click();
  await page.getByTestId('paywall').waitFor();
  check(true, 'case page shows the paywall (pay $14.99 or get the plan)');
  const blocked = await sendViaApi(api, single, await page.getByTestId('letter-final').textContent());
  check(blocked.status() === 402, `/api/send without payment → ${blocked.status()}`);
  check(/\$14\.99/.test((await blocked.json()).error ?? ''), '402 message explains the price');

  // 2. Single letter: pay with 4242, access via webhook, letter sent.
  await page.getByRole('button', { name: 'Pay $14.99 and send' }).click();
  await payOnCheckout(page, '4242424242424242');
  await page.waitForURL(new RegExp(`/cases/${single}`), { timeout: 120_000 });
  const paid = await until(async () => (await casePay(single))?.paid_via === 'letter' && (await casePay(single)));
  check(!!paid?.stripe_payment_intent, 'webhook marked the case paid (paid_via = letter, payment intent stored)');
  const sentOk = await page.getByTestId('sent-panel').waitFor({ timeout: 90_000 }).then(() => true, () => false);
  check(sentOk, 'after paying, the approved letter (kept in sessionStorage) was sent');
  check((await casePay(single)).status === 'sent', 'case status is sent');
  await page.screenshot({ path: join(OUT_DIR, 'single-sent.png'), fullPage: true });

  // 3. Declined card on Checkout: no access.
  await page.goto(`${BASE_URL}/cases/${refunded}`);
  await page.getByRole('button', { name: 'Draft a letter' }).click();
  await page.getByTestId('letter-editor').waitFor();
  await page.getByRole('button', { name: 'Approve letter' }).click();
  await page.getByRole('button', { name: 'Pay $14.99 and send' }).click();
  const declined = await payOnCheckout(page, '4000000000000341', { expect: 'declined' }).then(() => true, () => false);
  check(declined, 'Checkout shows the card was declined (4000 0000 0000 0341)');
  await sleep(3_000);
  check((await casePay(refunded)).paid_via === null, 'declined payment: case stays unpaid');

  // 4. Refund before sending: pay (but stop before the page sends), refund, access removed.
  // Land on a stub instead of the case page, so the page can't send the letter before we refund.
  await page.route(`**/cases/${refunded}?checkout=done`, (r) => r.fulfill({ contentType: 'text/html', body: '<p>stopped before sending</p>' }));
  await payOnCheckout(page, '4242424242424242');
  const paid2 = await until(async () => (await casePay(refunded))?.paid_via === 'letter' && (await casePay(refunded)));
  check(!!paid2, 'second case paid via webhook');
  await page.getByText('stopped before sending').waitFor({ timeout: 60_000 });
  await page.unroute(`**/cases/${refunded}?checkout=done`);
  await stripe.refunds.create({ payment_intent: paid2.stripe_payment_intent });
  const unpaid = await until(async () => (await casePay(refunded))?.paid_via === null);
  check(!!unpaid, 'refund before sending: case no longer paid (charge.refunded)');
  const afterRefund = await sendViaApi(api, refunded, await readyLetter(api, refunded));
  check(afterRefund.status() === 402, `/api/send after refund → ${afterRefund.status()}`);

  // 5. Annual plan from Settings: 4242, webhook activates it. The plan's Stripe customer lives on a test clock, so
  // step 8 can move time to the renewal. (The app reuses the stored customer, as it would for a returning user.)
  const firstCustomer = (await billingRow(user.id))?.stripe_customer_id;
  clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: 'e2e-stripe' });
  const clockCustomer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id }, test_clock: clock.id });
  await db.from('billing').update({ stripe_customer_id: clockCustomer.id }).eq('user_id', user.id);
  if (firstCustomer) await stripe.customers.del(firstCustomer).catch(() => {});
  await page.goto(`${BASE_URL}/settings`);
  await page.getByRole('button', { name: 'Get the annual plan, $39/year' }).click();
  await payOnCheckout(page, '4242424242424242');
  await page.waitForURL(/\/settings/, { timeout: 120_000 });
  const left = await page.getByTestId('plan-letters-left').waitFor({ timeout: 60_000 }).then(() => page.getByTestId('plan-letters-left').textContent(), () => null);
  check(left === '4 of 4', `plan active via webhook: ${left} letters left`);
  const plan = await billingRow(user.id);
  check(plan?.plan_status === 'active' && !!plan.stripe_subscription_id, `billing row: ${plan?.plan_status}, subscription stored`);
  await page.screenshot({ path: join(OUT_DIR, 'settings-plan.png'), fullPage: true });

  // 6. Four plan letters send; the 5th is blocked.
  for (const [i, id] of planCases.entries()) {
    const r = await sendViaApi(api, id, await readyLetter(api, id));
    check(r.status() === 200, `plan letter ${i + 1} sent (${r.status()}${r.status() !== 200 ? ' ' + (await r.text()).slice(0, 120) : ''})`);
  }
  const fifth = await sendViaApi(api, refunded, await readyLetter(api, refunded));
  const fifthMsg = (await fifth.json()).error ?? '';
  check(fifth.status() === 402 && /all 4 plan letters/.test(fifthMsg), `5th plan letter → ${fifth.status()} "${fifthMsg.slice(0, 60)}…"`);
  await page.goto(`${BASE_URL}/settings`);
  check((await page.getByTestId('plan-letters-left').textContent()) === '0 of 4', 'settings: 0 of 4 letters left');

  // 7. Webhook security and idempotency.
  const bad = await api.post(`${BASE_URL}/api/stripe-webhook`, { data: '{}', headers: { 'stripe-signature': 't=1,v1=bad' } });
  check(bad.status() === 400, `webhook with a bad signature → ${bad.status()}`);
  const secret = execFileSync('stripe', ['listen', '--api-key', key, '--print-secret'], { encoding: 'utf8' }).trim();
  const [evt] = (await stripe.events.list({ type: 'checkout.session.completed', limit: 1 })).data;
  const payload = JSON.stringify(evt);
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
  const again = await api.post(`${BASE_URL}/api/stripe-webhook`, { data: payload, headers: { 'stripe-signature': sig, 'content-type': 'application/json' } });
  check(again.status() === 200 && (await again.json()).duplicate === true, 'a repeated event is acknowledged and not processed twice');

  // 8. Failed renewal payment: switch to a card that fails, move the clock past the renewal → no plan letters.
  const pm = await stripe.paymentMethods.attach('pm_card_chargeCustomerFail', { customer: plan.stripe_customer_id });
  await stripe.subscriptions.update(plan.stripe_subscription_id, { default_payment_method: pm.id });
  const renewal = Date.parse(plan.plan_period_end) / 1000 + 2 * 86_400;
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: renewal });
  const advanced = await until(async () => (await stripe.testHelpers.testClocks.retrieve(clock.id)).status === 'ready', { timeout: 180_000, every: 3_000 });
  check(!!advanced, 'test clock moved past the renewal date');
  const failed = await until(async () => {
    const b = await billingRow(user.id);
    return b && b.plan_status !== 'active' && b;
  }, { timeout: 120_000, every: 2_000 });
  check(!!failed, `failed payment: plan status → ${failed?.plan_status}`);
  // A new plan year started, so a working plan would have 4 letters again; it has none.
  const afterFail = await sendViaApi(api, refunded, await readyLetter(api, refunded));
  check(afterFail.status() === 402 && /\$14\.99/.test((await afterFail.json()).error ?? ''), `/api/send after failed payment → ${afterFail.status()}`);
  await page.goto(`${BASE_URL}/settings`);
  check((await page.getByTestId('plan-badge').textContent()) === 'Payment failed', 'settings: "Payment failed"');

  // 9. Cancelled plan.
  await stripe.subscriptions.cancel(plan.stripe_subscription_id);
  const cancelled = await until(async () => (await billingRow(user.id))?.plan_status === 'canceled');
  check(!!cancelled, 'cancelled plan: status → canceled (customer.subscription.deleted)');
  await page.goto(`${BASE_URL}/settings`);
  check((await page.getByTestId('plan-badge').textContent()) === 'Cancelled', 'settings: "Cancelled", offers the plan again');
  const manage = await page.getByRole('button', { name: 'Manage billing' }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  check(manage, 'settings: "Manage billing" (Customer Portal) is offered');
  const portal = await api.post(`${BASE_URL}/api/billing-portal`, { data: {} });
  check(portal.status() === 200 && /billing\.stripe\.com/.test((await portal.json()).url ?? ''), `Customer Portal link (${portal.status()})`);

  check(consoleErrors.length === 0, `no console errors (${consoleErrors.length})${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`);
} catch (err) {
  fail(`crashed: ${err.message}`);
  await browser.contexts()[0]?.pages()[0]?.screenshot({ path: join(OUT_DIR, 'crash.png'), fullPage: true }).catch(() => {});
} finally {
  const b = await billingRow(user.id).catch(() => null);
  if (b?.stripe_customer_id) await stripe.customers.del(b.stripe_customer_id).catch(() => {});
  if (clock) await stripe.testHelpers.testClocks.del(clock.id).catch(() => {});
  await browser.close();
  await deleteTestUser(user);
  console.log('cleanup: deleted test user, its cases and its Stripe test customer');
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
