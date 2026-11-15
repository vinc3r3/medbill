// Task 19 check: the full demo runs three times in a row against the same server, without a restart.
// Each run: Reset demo → Load sample cases (3 cases, $395.75 to review, seeded billing address works) →
// New check with the "C" sample button → letter → send → simulate delivery → reply with the sample corrected
// statement → $367 saved on the dashboard. Also: friendly 404, no console errors.
// Usage: BASE_URL=… npm run e2e:demo. Deletes its test user.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createTestUser, deleteTestUser, signIn, givePlan } from './e2e-helpers.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const RUNS = Number(process.env.RUNS ?? 3);
const OUT_DIR = join(process.env.OUT_DIR ?? '.e2e', 'demo');
mkdirSync(OUT_DIR, { recursive: true });
let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
const check = (ok, label) => (ok ? console.log(`  ok   ${label}`) : fail(label));
const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));
const [mm, dd, yyyy] = profile.dateOfBirth.split('/');

const browser = await chromium.launch({ channel: 'chrome' });
const user = await createTestUser('demo');
await givePlan(user);
const consoleErrors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  page.on('console', (m) => m.type() === 'error' && !/404 \(Not Found\)/.test(m.text()) && consoleErrors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => consoleErrors.push(e.message.slice(0, 200)));
  await signIn(page, BASE_URL, user);

  const rows = () => page.getByTestId('case-row');
  const stat = (id) => page.getByTestId(id).textContent();
  const gotoDashboard = async () => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.locator('[data-testid="demo-tools"][data-ready]').waitFor({ timeout: 30_000 });
  };

  // Friendly 404 for a case that isn't yours.
  await page.goto(`${BASE_URL}/cases/00000000-0000-4000-8000-000000000000`);
  check(await page.getByText("We couldn't find that page").waitFor({ timeout: 15_000 }).then(() => true, () => false), 'unknown case shows the friendly not-found page');

  for (let run = 1; run <= RUNS; run++) {
    console.log(`run ${run}:`);
    const started = Date.now();

    // 1. Reset.
    await gotoDashboard();
    if ((await rows().count()) > 0) {
      await page.getByRole('button', { name: 'Reset demo' }).click();
      await page.getByRole('button', { name: 'Delete all' }).click();
    }
    check(await page.getByText('No cases yet').waitFor({ timeout: 15_000 }).then(() => true, () => false), 'reset: no cases');

    // 2. Seed.
    await page.getByRole('button', { name: 'Load sample cases' }).click();
    await page.getByText('Loaded sample cases A, B and C.').waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="case-row"]').length === 3, null, { timeout: 15_000 }).catch(() => {});
    check((await rows().count()) === 3, `seed: 3 cases (${await rows().count()})`);
    check((await stat('stat-to-review')) === '$395.75', `seed: "To review" is ${await stat('stat-to-review')}`);
    // A seeded case has its billing address ready for the letter, like an uploaded one.
    await rows().filter({ hasText: 'Riverbend Medical Group' }).locator('a').click();
    await page.getByRole('button', { name: 'Draft a letter' }).click();
    await page.getByTestId('letter-editor').waitFor();
    if (run === 1) {
      // Details are needed to approve; they stay on this device across resets.
      await page.goto(`${BASE_URL}/settings`);
      await page.locator('[data-testid="profile-form"][data-ready]').waitFor();
      if (!(await page.getByLabel('Full name').isVisible())) await page.locator('[data-testid="profile-form"] summary').click();
      await page.getByLabel('Full name').fill(profile.name);
      await page.getByLabel('Date of birth').fill(`${yyyy}-${mm}-${dd}`);
      await page.getByLabel('Insurance member ID').fill(profile.memberId);
      await page.getByLabel('Mailing address').fill(profile.address);
      await page.getByRole('button', { name: 'Save details' }).click();
      await page.getByText('Saved on this device.').waitFor();
      await page.goBack();
      await page.getByTestId('letter-editor').waitFor();
    }
    await page.getByRole('button', { name: 'Approve letter' }).click();
    const street = await page.getByTestId('send-to').getByLabel('Street address').inputValue();
    check(street === '310 Mill Race Rd', `seeded case B: billing address prefilled (${street})`);

    // 3. Full flow with the sample buttons.
    await page.goto(`${BASE_URL}/new`);
    await page.locator('[data-testid="upload-form"][data-ready]').waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'C: billed too much' }).click();
    await page.getByAltText('Bill preview').waitFor();
    await page.getByAltText('EOB preview').waitFor();
    await page.getByRole('button', { name: 'Read my documents' }).click();
    await page.getByTestId('redacted-bill').waitFor({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Check my bill' }).click();
    await page.waitForURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 180_000 }).catch(async () => {
      throw new Error(`run ${run}: never reached the review: ${(await page.getByRole('alert').allTextContents()).join(' ')}`);
    });
    check((await page.getByTestId('to-question').textContent()).trim() === '$367 to question', 'flow: $367 to question');
    await page.getByRole('button', { name: 'Draft a letter' }).click();
    await page.getByTestId('letter-editor').waitFor();
    await page.getByRole('button', { name: 'Approve letter' }).click();
    await page.getByRole('button', { name: 'Approve and send by certified mail' }).click();
    await page.getByTestId('sent-panel').waitFor({ timeout: 90_000 }).catch(async () => {
      throw new Error(`run ${run}: not sent: ${(await page.getByRole('alert').allTextContents()).join(' ')}`);
    });
    await page.getByRole('button', { name: 'Simulate delivery (test mode)' }).click();
    await page.getByText('Your letter was delivered').waitFor({ timeout: 60_000 });
    await page.locator('[data-testid="got-reply"][data-ready]').click();
    await page.getByLabel(/Corrected the bill/).check();
    await page.getByRole('button', { name: 'Demo: use the sample corrected statement' }).click();
    await page.getByAltText('Statement preview').waitFor();
    await page.getByRole('button', { name: 'Save reply' }).click();
    await page.getByTestId('saved-amount').waitFor({ timeout: 120_000 }).catch(async () => {
      throw new Error(`run ${run}: reply not saved: ${(await page.getByRole('alert').allTextContents()).join(' ')}`);
    });
    check((await page.getByTestId('saved-amount').textContent()) === '$367 saved', 'flow: $367 saved');

    // 4. Dashboard.
    await gotoDashboard();
    check((await rows().count()) === 4, `dashboard: 4 cases (${await rows().count()})`);
    check((await stat('stat-saved')) === '$367', `dashboard: "Money saved" ${await stat('stat-saved')}`);
    await page.screenshot({ path: join(OUT_DIR, `run-${run}-dashboard.png`), fullPage: true });
    console.log(`  run ${run} took ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  check(consoleErrors.length === 0, `no console errors (${consoleErrors.length})${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`);
} finally {
  await browser.close();
  await deleteTestUser(user);
  console.log('cleanup: deleted test user and its cases');
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
