// Task 14 check: after running case C (send), the dashboard shows it as `sent` with $367 in dispute; after
// "Simulate delivery" it shows `delivered` (Task 13's dashboard check); another user's cases never appear;
// no sideways scroll at 390px. Usage: BASE_URL=… npm run e2e:dashboard. Cleans up its users.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createTestUser, deleteTestUser, signIn, givePlan } from './e2e-helpers.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = process.env.OUT_DIR ?? '.e2e';
mkdirSync(OUT_DIR, { recursive: true });
let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
const check = (ok, label) => (ok ? console.log(`  ok   ${label}`) : fail(label));
const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));

const browser = await chromium.launch({ channel: 'chrome' });
const [alice, bob] = [await createTestUser('dash-a'), await createTestUser('dash-b')];
await givePlan(alice);
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => consoleErrors.push(e.message.slice(0, 200)));
  await signIn(page, BASE_URL, alice);
  check(new URL(page.url()).pathname === '/dashboard', 'signing in lands on the dashboard');
  check(await page.getByText('No cases yet').waitFor({ timeout: 15_000 }).then(() => true, () => false), 'empty dashboard shows "No cases yet"');

  // Run case C up to "sent" (case B stays at "checked" as a to-review item).
  const api = (p, d) => page.request.post(BASE_URL + p, { data: d }).then((r) => r.json());
  const make = async (key) => {
    const exp = JSON.parse(readFileSync(`samples/${key}/expected.json`, 'utf8'));
    const c = await api('/api/cases', { bill: exp.bill, eob: exp.eob });
    await api('/api/check', { caseId: c.id });
    return c.id;
  };
  const caseB = await make('b');
  const caseC = await make('c');
  const { letter } = await api('/api/letter', { caseId: caseC });
  const filled = letter.replaceAll('{{PATIENT_NAME}}', profile.name).replaceAll('{{MEMBER_ID}}', profile.memberId).replaceAll('{{ADDRESS}}', profile.address);
  await api('/api/send', {
    caseId: caseC, letterText: filled,
    to: { name: 'Summit Urgent Care', addressLine1: '4500 Ridgeline Pkwy', city: 'Fairhaven', state: 'OH', zip: '45097' },
    from: { name: profile.name, addressLine1: '1427 Maple Grove Ln', city: 'Fairhaven', state: 'OH', zip: '45099' },
  });

  await page.goto(`${BASE_URL}/dashboard`);
  const rowC = page.locator(`[data-case-id="${caseC}"]`);
  const rowB = page.locator(`[data-case-id="${caseB}"]`);
  check((await page.getByTestId('case-row').count()) === 2, 'dashboard lists both cases');
  check((await rowC.locator('[data-status]').getAttribute('data-status')) === 'sent', 'case C shows status chip "Sent"');
  check((await rowC.innerText()).includes('$367.00 to question'), 'case C row shows $367.00');
  check((await page.getByTestId('stat-in-dispute').textContent()) === '$367', `"In dispute" total is ${await page.getByTestId('stat-in-dispute').textContent()}`);
  check((await page.getByTestId('stat-to-review').textContent()) === '$28.75', `"To review" total is ${await page.getByTestId('stat-to-review').textContent()} (case B)`);
  check((await rowB.locator('[data-status]').getAttribute('data-status')) === 'checked', 'case B shows status chip "Checked"');
  await page.screenshot({ path: join(OUT_DIR, 'dashboard.png'), fullPage: true });

  // Delivered shows on the dashboard (Task 13's "Done when").
  await rowC.click();
  await page.getByRole('button', { name: 'Simulate delivery (test mode)' }).click();
  await page.getByText('Your letter was delivered').waitFor({ timeout: 60_000 });
  await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
  await page.waitForURL(/\/dashboard$/);
  // Client navigation may first show the prefetched copy, then refresh itself (stale-while-revalidate).
  let shown = null;
  for (let i = 0; i < 20 && shown !== 'delivered'; i++) {
    shown = await page.locator(`[data-case-id="${caseC}"] [data-status]`).getAttribute('data-status');
    if (shown !== 'delivered') await page.waitForTimeout(500);
  }
  check(shown === 'delivered', 'after delivery the dashboard shows "Delivered" (within 10s)');

  // Mobile: no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `390px: no sideways scroll (${overflow}px)`);
  await page.screenshot({ path: join(OUT_DIR, 'dashboard-mobile.png'), fullPage: true });

  check(consoleErrors.length === 0, `no console errors (${consoleErrors.length})${consoleErrors.length ? ': ' + consoleErrors[0] : ''}`);

  // Another user never sees these cases.
  const bobPage = await (await browser.newContext()).newPage();
  await signIn(bobPage, BASE_URL, bob);
  await bobPage.goto(`${BASE_URL}/dashboard`);
  await bobPage.getByText('No cases yet').waitFor({ timeout: 15_000 }).catch(() => {});
  check((await bobPage.getByTestId('case-row').count()) === 0 && (await bobPage.getByText('No cases yet').count()) === 1, "Bob's dashboard shows none of Alice's cases");
} finally {
  await browser.close();
  await deleteTestUser(alice);
  await deleteTestUser(bob);
  console.log('cleanup: deleted test users and their cases');
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
