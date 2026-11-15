// Task 18 check: on a 390px phone screen, the full flow runs from the landing page —
// landing → sign up → new check (profile, upload, OCR, redact, check) → review → letter → send → delivered →
// reply (corrected) → resolved — with no sideways scroll and no console errors on any page. Also: after a
// change, the dashboard shows the new status straight away (no stale prefetched copy).
// Usage: BASE_URL=… npm run e2e:frontend. Deletes the account it creates.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { deleteTestUser, givePlan } from './e2e-helpers.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = join(process.env.OUT_DIR ?? '.e2e', 'frontend');
mkdirSync(OUT_DIR, { recursive: true });
let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
const check = (ok, label) => (ok ? console.log(`  ok   ${label}`) : fail(label));
const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));
const [mm, dd, yyyy] = profile.dateOfBirth.split('/');
const email = `front-${crypto.randomUUID().slice(0, 8)}@example.com`;
const password = `pw-${crypto.randomUUID()}`;

const browser = await chromium.launch({ channel: 'chrome' });
const consoleErrors = [];
const watch = (page) => {
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(`${new URL(page.url()).pathname}: ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => consoleErrors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 200)}`));
};
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** No sideways scroll + a full-page screenshot. */
async function pageOk(page, name) {
  await page.waitForLoadState('networkidle').catch(() => {});
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${name}: no sideways scroll at 390px (${overflow}px)`);
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
}

try {
  // Signed out: landing, sign-in and sign-up pages.
  const anon = await (await browser.newContext(phone)).newPage();
  watch(anon);
  await anon.goto(`${BASE_URL}/signin`);
  await pageOk(anon, 'signin');

  const page = await (await browser.newContext(phone)).newPage();
  watch(page);
  await page.goto(BASE_URL);
  check(new URL(page.url()).pathname === '/', 'signed-out visitors see the landing page at /');
  check(await page.getByRole('heading', { level: 1 }).isVisible(), 'landing page has a headline');
  await pageOk(page, 'landing');

  // Landing → sign up.
  await page.getByTestId('cta-hero').click();
  await page.waitForURL(/\/signup/);
  await pageOk(page, 'signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30_000 });
  check(true, 'sign-up from the landing page lands on the dashboard');
  await page.getByText('No cases yet').waitFor();
  await givePlan(email); // sending isn't what this check is about (see e2e:stripe)
  await pageOk(page, 'dashboard-empty');

  // New check: details, upload, read, check.
  await page.getByRole('link', { name: 'New check', exact: true }).first().click();
  await page.waitForURL(/\/new$/);
  await page.locator('[data-testid="upload-form"][data-ready]').waitFor({ timeout: 30_000 });
  await page.locator('[data-testid="profile-form"][data-ready]').waitFor({ timeout: 30_000 });
  await page.getByLabel('Full name').fill(profile.name);
  await page.getByLabel('Date of birth').fill(`${yyyy}-${mm}-${dd}`);
  await page.getByLabel('Insurance member ID').fill(profile.memberId);
  await page.getByLabel('Mailing address').fill(profile.address);
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByText('Saved on this device.').waitFor();
  await page.getByTestId('bill-input').setInputFiles('samples/c/c-bill.png');
  await page.getByTestId('eob-input').setInputFiles('samples/c/c-eob.png');
  await page.getByRole('button', { name: 'Read my documents' }).click();
  await page.getByTestId('redacted-bill').waitFor({ timeout: 120_000 });
  await pageOk(page, 'new-check');
  await page.getByRole('button', { name: 'Check my bill' }).click();
  await page.waitForURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 180_000 }).catch(async () => {
    throw new Error(`never reached the review screen: ${(await page.getByRole('alert').allTextContents()).join(' ')}`);
  });
  const caseId = page.url().split('/').pop();
  check((await page.getByTestId('to-question').textContent()).trim() === '$367 to question', 'review shows "$367 to question"');
  const state = async (step) => page.locator(`[data-testid="timeline"] [data-step="${step}"]`).getAttribute('data-state');
  check((await state('checked')) === 'done' && (await state('sent')) === 'current', 'timeline: checked done, letter next');
  await pageOk(page, 'case-review');

  // Letter → send.
  await page.getByRole('button', { name: 'Draft a letter' }).click();
  await page.getByTestId('letter-editor').waitFor();
  await page.getByRole('button', { name: 'Approve letter' }).click();
  await pageOk(page, 'case-letter');
  await page.getByRole('button', { name: 'Approve and send by certified mail' }).click();
  await page.getByTestId('sent-panel').waitFor({ timeout: 90_000 }).catch(async () => {
    throw new Error(`never reached "sent": ${(await page.getByRole('alert').allTextContents()).join(' ')}`);
  });
  check((await state('sent')) === 'done' && (await state('delivered')) === 'current', 'timeline: sent done, delivery next');

  // Delivered, then straight to the dashboard: the new status must show on first paint.
  await page.getByRole('button', { name: 'Simulate delivery (test mode)' }).click();
  await page.getByText('Your letter was delivered').waitFor({ timeout: 60_000 });
  check((await state('delivered')) === 'done', 'timeline: delivered done');
  await pageOk(page, 'case-delivered');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
  await page.waitForURL(/\/dashboard$/);
  const row = page.locator(`[data-case-id="${caseId}"] [data-status]`);
  await row.waitFor();
  const firstSeen = await row.getAttribute('data-status');
  check(firstSeen === 'delivered', `dashboard shows "delivered" immediately, no stale copy (first seen: ${firstSeen})`);

  // Reply: corrected statement → resolved.
  await page.locator(`[data-case-id="${caseId}"] a`).click();
  await page.waitForURL(/\/cases\//);
  await page.locator('[data-testid="got-reply"][data-ready]').click();
  await page.getByLabel(/Corrected the bill/).check();
  await page.getByTestId('statement-input').setInputFiles('samples/c/c-corrected.png');
  await pageOk(page, 'case-reply');
  await page.getByRole('button', { name: 'Save reply' }).click();
  await page.getByTestId('saved-amount').waitFor({ timeout: 120_000 }).catch(async () => {
    throw new Error(`reply not saved: ${(await page.getByRole('alert').allTextContents()).join(' ')}`);
  });
  check((await page.getByTestId('saved-amount').textContent()) === '$367 saved', 'case shows "$367 saved"');
  check((await state('resolved')) === 'done', 'timeline: resolved done');
  await pageOk(page, 'case-resolved');

  await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
  await page.waitForURL(/\/dashboard$/);
  await page.getByTestId('stat-saved').waitFor();
  const firstSaved = await page.getByTestId('stat-saved').textContent();
  check(firstSaved === '$367', `dashboard "Money saved" is $367 on first paint (${firstSaved})`);
  check((await row.getAttribute('data-status')) === 'resolved', 'dashboard row shows "Resolved"');
  await pageOk(page, 'dashboard');

  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await page.waitForURL(/\/settings$/);
  await page.getByTestId('plan').waitFor();
  check((await page.getByTestId('settings-email').textContent()) === email, 'settings shows the account email');
  await pageOk(page, 'settings');

  // Signed in, the landing page offers the app instead of sign-up.
  await page.goto(BASE_URL);
  const toDashboard = await page.getByRole('link', { name: 'Go to your dashboard' }).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
  check(toDashboard, 'signed-in landing page links to the dashboard');

  check(consoleErrors.length === 0, `no console errors (${consoleErrors.length})${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`);
} finally {
  await browser.close();
  await deleteTestUser(email);
  console.log(`cleanup: deleted ${email} and its cases`);
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
