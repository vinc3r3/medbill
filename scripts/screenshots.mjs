// README screenshots at desktop size (1440px): landing, dashboard with the sample cases, and case C's review.
// Uses a throwaway user and the Demo tools (no AI calls). Usage: npm run dev, then node scripts/screenshots.mjs
import { chromium } from 'playwright-core';
import { createTestUser, deleteTestUser, signIn } from './e2e-helpers.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = 'docs/screenshots';
const HIDE_DEV = 'nextjs-portal { display: none !important; }';

const browser = await chromium.launch({ channel: 'chrome' });
const user = await createTestUser('shots');
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const shot = async (name, opts = {}) => {
    await page.addStyleTag({ content: HIDE_DEV });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
    console.log(`saved ${OUT}/${name}.png`);
  };

  await page.goto(BASE_URL);
  await shot('landing');

  await signIn(page, BASE_URL, user);
  await page.goto(`${BASE_URL}/dashboard`);
  await page.locator('[data-testid="demo-tools"][data-ready]').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Load sample cases' }).click();
  await page.getByText('Loaded sample cases A, B and C.').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="case-row"]').length === 3);
  await shot('dashboard');

  await page.getByTestId('case-row').filter({ hasText: 'Summit Urgent Care' }).locator('a').click();
  await page.getByTestId('to-question').waitFor();
  await shot('case-review', { fullPage: true });
} finally {
  await browser.close();
  await deleteTestUser(user);
}
