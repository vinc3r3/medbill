// Task 5 check (browser): save the synthetic profile through the form, read each sample, and confirm
// the redacted view contains no profile value and highlights the replacements.
// Usage: start the app (`npm run dev`), then `npm run e2e:redact`. Screenshots go to OUT_DIR (default .e2e).
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = process.env.OUT_DIR ?? '.e2e';
mkdirSync(OUT_DIR, { recursive: true });
const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));
const [mm, dd, yyyy] = profile.dateOfBirth.split('/');
const squash = (s) => s.toLowerCase().replace(/[\s.,]+/g, ' ');
const needles = [...Object.values(profile), 'Jordan', 'Rivera', '1427 Maple Grove', `${yyyy}-${mm}-${dd}`];

const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };

try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1400 } });
  const page = await context.newPage();
  await page.goto(BASE_URL);

  // Save the profile through the form (the date input takes YYYY-MM-DD).
  await page.getByLabel('Full name').fill(profile.name);
  await page.getByLabel('Date of birth').fill(`${yyyy}-${mm}-${dd}`);
  await page.getByLabel('Insurance member ID').fill(profile.memberId);
  await page.getByLabel('Mailing address').fill(profile.address);
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByText('Saved on this device.').waitFor();

  // Survives a reload (localStorage).
  await page.reload();
  const summary = await page.locator('summary', { hasText: 'Your details' }).textContent();
  if (!summary.includes(profile.name)) fail('profile not restored after reload');
  else console.log('profile: saved and restored after reload');

  for (const key of ['a', 'b', 'c']) {
    await page.getByTestId('bill-input').setInputFiles(join('samples', key, `${key}-bill.png`));
    await page.getByTestId('eob-input').setInputFiles(join('samples', key, `${key}-eob.png`));
    await page.getByRole('button', { name: 'Read my documents' }).click();
    await page.getByTestId('redacted-bill').waitFor({ timeout: 120_000 });

    const texts = { bill: await page.getByTestId('redacted-bill').textContent(), eob: await page.getByTestId('redacted-eob').textContent() };
    const marks = await page.locator('mark').count();
    for (const [doc, text] of Object.entries(texts)) {
      for (const n of needles) if (squash(text).includes(squash(n))) fail(`${key}-${doc}: "${n}" still visible`);
    }
    for (const token of ['[NAME]', '[DOB]', '[MEMBER_ID]', '[ADDRESS]', '[ACCOUNT]']) {
      if (!texts.bill.includes(token)) fail(`${key}-bill: missing ${token}`);
    }
    console.log(`case ${key}: ${marks} highlighted replacements`);
    if (key === 'c') {
      await page.getByRole('heading', { name: "What we'll send" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(OUT_DIR, 'redact-c.png') });
    }
  }
} finally {
  await browser.close();
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
