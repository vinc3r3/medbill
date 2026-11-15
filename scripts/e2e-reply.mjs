// Task 15 check: case C is sent, then "I got a reply" → corrected → upload the corrected statement ($45 due).
// The photo goes through on-device OCR → redaction → /api/extract; the case becomes `resolved` with $367 saved
// and the dashboard's "Money saved" uses it. Also: the letter carries the case reference, no /api/extract body
// holds a profile value, no sideways scroll at 390px, no console errors.
// Usage: BASE_URL=… npm run e2e:reply (needs migration 0005). Cleans up its user.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createTestUser, deleteTestUser, openHome, signIn, givePlan } from './e2e-helpers.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = process.env.OUT_DIR ?? '.e2e';
mkdirSync(OUT_DIR, { recursive: true });
let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
const check = (ok, label) => (ok ? console.log(`  ok   ${label}`) : fail(label));
const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));
const [mm, dd, yyyy] = profile.dateOfBirth.split('/');
const squash = (s) => s.toLowerCase().replace(/[\s.,]+/g, ' ');
const needles = [...Object.values(profile), 'Jordan', 'Rivera', '1427 Maple Grove'];

const browser = await chromium.launch({ channel: 'chrome' });
const user = await createTestUser('reply');
await givePlan(user);
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => consoleErrors.push(e.message.slice(0, 200)));
  const extractBodies = [];
  context.on('request', (r) => { if (r.url().includes('/api/extract')) extractBodies.push(r.postData() ?? ''); });
  await signIn(page, BASE_URL, user);

  // Case C, sent (API, as in e2e:dashboard).
  const api = (p, d) => page.request.post(BASE_URL + p, { data: d }).then(async (r) => ({ status: r.status(), body: await r.json() }));
  const exp = JSON.parse(readFileSync('samples/c/expected.json', 'utf8'));
  const caseId = (await api('/api/cases', { bill: exp.bill, eob: exp.eob })).body.id;
  await api('/api/check', { caseId });
  const early = await api(`/api/cases/${caseId}/reply`, { outcome: 'denied' });
  check(early.status === 409, `a reply before sending is refused (${early.status})`);
  const { letter } = (await api('/api/letter', { caseId })).body;
  const ref = `MB-${caseId.slice(0, 4).toUpperCase()}`;
  check(letter.includes(`Ref: ${ref}`), `letter carries the case reference ${ref}`);
  const filled = letter.replaceAll('{{PATIENT_NAME}}', profile.name).replaceAll('{{MEMBER_ID}}', profile.memberId).replaceAll('{{ADDRESS}}', profile.address);
  const sent = await api('/api/send', {
    caseId, letterText: filled,
    to: { name: 'Summit Urgent Care', addressLine1: '4500 Ridgeline Pkwy', city: 'Fairhaven', state: 'OH', zip: '45097' },
    from: { name: profile.name, addressLine1: '1427 Maple Grove Ln', city: 'Fairhaven', state: 'OH', zip: '45099' },
  });
  check(sent.status === 200, `case C sent (${sent.status}${sent.status !== 200 ? ': ' + sent.body.error : ''})`);

  // Profile on this device (needed to redact the reply).
  await openHome(page, BASE_URL);
  await page.getByLabel('Full name').fill(profile.name);
  await page.getByLabel('Date of birth').fill(`${yyyy}-${mm}-${dd}`);
  await page.getByLabel('Insurance member ID').fill(profile.memberId);
  await page.getByLabel('Mailing address').fill(profile.address);
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByText('Saved on this device.').waitFor();

  // Log the reply through the UI.
  await page.goto(`${BASE_URL}/cases/${caseId}`);
  check((await page.getByTestId('sent-panel').innerText()).includes(ref), 'case page shows the reference');
  await page.locator('[data-testid="got-reply"][data-ready]').click();
  await page.getByLabel(/Corrected the bill/).check();
  await page.getByTestId('statement-input').setInputFiles('samples/c/c-corrected.png');
  await page.getByRole('button', { name: 'Save reply' }).click();
  const resolved = await page.getByTestId('saved-amount').waitFor({ timeout: 120_000 }).then(() => true, () => false);
  if (!resolved) console.log('  alert:', await page.getByRole('alert').allInnerTexts());
  check(resolved && (await page.getByTestId('saved-amount').textContent()) === '$367 saved', 'case page shows "$367 saved"');
  check(await page.getByText('It now matches what your EOB says you owe.').isVisible(), 'corrected statement matches the EOB');
  check((await page.locator('[data-testid="reply-history"] [data-outcome="corrected"]').count()) === 1, 'reply history lists the corrected reply');
  check((await page.getByTestId('got-reply').count()) === 0, '"I got a reply" is gone once resolved');
  await page.screenshot({ path: join(OUT_DIR, 'reply-resolved.png'), fullPage: true });

  const stored = (await (await page.request.get(`${BASE_URL}/api/cases`)).json()).find((c) => c.id === caseId);
  check(stored.status === 'resolved' && stored.savedAmount === 367, `stored case: ${stored.status}, savedAmount ${stored.savedAmount}`);
  check(stored.replies[0]?.bill?.amountDue === 45, `extracted corrected amount due: ${stored.replies[0]?.bill?.amountDue}`);

  for (const body of extractBodies) for (const n of needles) if (squash(body).includes(squash(n))) fail(`/api/extract body contained "${n}"`);
  check(extractBodies.length === 1, `${extractBodies.length} /api/extract request(s), checked for profile values`);

  // Dashboard uses the actual saving.
  await page.goto(`${BASE_URL}/dashboard`);
  check((await page.getByTestId('stat-saved').textContent()) === '$367', `"Money saved" is ${await page.getByTestId('stat-saved').textContent()}`);
  check((await page.getByTestId('stat-in-dispute').textContent()) === '$0', `"In dispute" is ${await page.getByTestId('stat-in-dispute').textContent()}`);
  const row = page.locator(`[data-case-id="${caseId}"]`);
  check((await row.locator('[data-status]').getAttribute('data-status')) === 'resolved', 'dashboard row shows "Resolved"');
  check((await row.innerText()).includes('$367.00 saved'), 'dashboard row shows "$367.00 saved"');

  // Mobile.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/cases/${caseId}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `390px case page: no sideways scroll (${overflow}px)`);
  check(consoleErrors.length === 0, `no console errors (${consoleErrors.length})${consoleErrors.length ? ': ' + consoleErrors[0] : ''}`);
} finally {
  await browser.close();
  await deleteTestUser(user);
  console.log('cleanup: deleted test user and its cases');
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
