// Task 8 check: full flow (profile → upload → OCR → redact → extract → case → check) lands on the review
// screen with the right "to question" total and highlighted rows. Case C must show "$367 to question".
// Also asserts no /api/extract request body contains a profile value.
// Usage: start the app (`npm run dev`), then `npm run e2e:review`. Needs the AI key and Supabase in .env.local.
// Deletes the cases it creates. Screenshots go to OUT_DIR (default .e2e).
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = process.env.OUT_DIR ?? '.e2e';
const CASES = (process.env.CASES ?? 'a,b,c').split(',');
mkdirSync(OUT_DIR, { recursive: true });

const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));
const [mm, dd, yyyy] = profile.dateOfBirth.split('/');
const squash = (s) => s.toLowerCase().replace(/[\s.,]+/g, ' ');
const needles = [...Object.values(profile), 'Jordan', 'Rivera', '1427 Maple Grove'];

const EXPECT = { a: { total: 'Nothing to question', rows: 0 }, b: { total: '$28.75 to question', rows: 2 }, c: { total: '$367 to question', rows: 2 } };

const browser = await chromium.launch({ channel: 'chrome' });
const created = [];
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  const extractBodies = [];
  context.on('request', (r) => { if (r.url().includes('/api/extract')) extractBodies.push(r.postData() ?? ''); });

  await page.goto(BASE_URL);
  await page.getByLabel('Full name').fill(profile.name);
  await page.getByLabel('Date of birth').fill(`${yyyy}-${mm}-${dd}`);
  await page.getByLabel('Insurance member ID').fill(profile.memberId);
  await page.getByLabel('Mailing address').fill(profile.address);
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByText('Saved on this device.').waitFor();

  for (const key of CASES) {
    await page.goto(BASE_URL);
    await page.getByTestId('bill-input').setInputFiles(join('samples', key, `${key}-bill.png`));
    await page.getByTestId('eob-input').setInputFiles(join('samples', key, `${key}-eob.png`));
    await page.getByRole('button', { name: 'Read my documents' }).click();
    await page.getByTestId('redacted-bill').waitFor({ timeout: 120_000 });
    const started = Date.now();
    await page.getByRole('button', { name: 'Check my bill' }).click();
    await page.waitForURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 180_000 }).catch(async () => {
      const alert = await page.getByRole('alert').filter({ hasNotText: /^$/ }).allTextContents();
      throw new Error(`case ${key}: never reached the review screen. ${alert.join(' ')}`);
    });
    created.push(page.url().split('/').pop());

    const total = (await page.getByTestId('to-question').textContent()).trim();
    const cards = await page.getByTestId('flag-card').count();
    const flaggedRows = await page.locator('tr[data-flagged]').count();
    console.log(`case ${key}: "${total}", ${cards} flag card(s), ${flaggedRows} highlighted row(s), ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (total !== EXPECT[key].total) fail(`case ${key}: expected "${EXPECT[key].total}"`);
    if (flaggedRows !== EXPECT[key].rows) fail(`case ${key}: expected ${EXPECT[key].rows} highlighted rows`);
    await page.screenshot({ path: join(OUT_DIR, `review-${key}.png`), fullPage: true });
  }

  for (const body of extractBodies) for (const n of needles) if (squash(body).includes(squash(n))) fail(`/api/extract body contained "${n}"`);
  console.log(`${extractBodies.length} /api/extract request(s) checked for profile values`);

  // Mobile layout of the last case: no horizontal page scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByTestId('to-question').waitFor();
  if (!(await page.getByRole('columnheader', { name: 'You owe' }).isVisible())) fail('mobile: "You owe" column not visible');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) fail(`mobile: page scrolls sideways by ${overflow}px`);
  else console.log('mobile (390px): no horizontal page scroll');
  await page.screenshot({ path: join(OUT_DIR, 'review-mobile.png'), fullPage: true });
} finally {
  await browser.close();
  if (created.length) {
    require('@next/env').loadEnvConfig(process.cwd(), true);
    const { createClient } = require('@supabase/supabase-js');
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const { error, count } = await db.from('cases').delete({ count: 'exact' }).in('id', created);
    console.log(error ? `cleanup failed: ${error.message}` : `cleanup: deleted ${count} test case(s)`);
  }
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
