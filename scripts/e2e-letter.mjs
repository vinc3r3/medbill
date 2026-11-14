// Task 9 check: the drafted letter cites dates, descriptions and amounts; the /api/letter request holds
// no profile values; edits are kept; approval fills placeholders in the browser.
// Creates cases B and C from expected.json via the API (no AI calls) and deletes them afterwards.
// Usage: start the app (`npm run dev`), then `npm run e2e:letter`. Screenshots go to OUT_DIR (default .e2e).
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createTestUser, deleteTestUser, signIn } from './e2e-helpers.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = process.env.OUT_DIR ?? '.e2e';
mkdirSync(OUT_DIR, { recursive: true });
const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));
const [mm, dd, yyyy] = profile.dateOfBirth.split('/');
const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const us = (iso) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
let post; // set once signed in, so API calls carry the session cookie

const browser = await chromium.launch({ channel: 'chrome' });
const user = await createTestUser('letter');
const created = [];
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };

try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, BASE_URL, user);
  post = (p, b) => page.request.post(BASE_URL + p, { data: b }).then((r) => r.json());
  const letterRequests = [];
  context.on('request', (r) => { if (r.url().includes('/api/letter')) letterRequests.push(r.postData() ?? ''); });

  await page.goto(BASE_URL);
  await page.getByLabel('Full name').fill(profile.name);
  await page.getByLabel('Date of birth').fill(`${yyyy}-${mm}-${dd}`);
  await page.getByLabel('Insurance member ID').fill(profile.memberId);
  await page.getByLabel('Mailing address').fill(profile.address);
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByText('Saved on this device.').waitFor();

  for (const key of ['b', 'c']) {
    const exp = JSON.parse(readFileSync(`samples/${key}/expected.json`, 'utf8'));
    const c = await post('/api/cases', { bill: exp.bill, eob: exp.eob });
    created.push(c.id);
    await post('/api/check', { caseId: c.id });

    await page.goto(`${BASE_URL}/cases/${c.id}`);
    await page.getByRole('button', { name: 'Draft a letter' }).click();
    const editor = page.getByTestId('letter-editor');
    await editor.waitFor();
    const draft = await editor.inputValue();

    // Cites dates, descriptions and amounts of every flagged line, plus the EOB figure.
    const must = [exp.bill.provider, exp.eob.claimId, us(exp.bill.serviceDate), usd(exp.savedAmount)];
    for (const f of exp.flags) {
      must.push(usd(f.billed), usd(f.expected === 0 ? f.billed : f.expected));
      if (f.billLineIdx !== null) must.push(us(exp.bill.lines[f.billLineIdx].date), exp.bill.lines[f.billLineIdx].description);
    }
    for (const s of must) if (!draft.includes(s)) fail(`case ${key}: draft lacks "${s}"`);
    if (!/itemized bill/i.test(draft)) fail(`case ${key}: draft lacks itemized bill request`);
    for (const p of ['{{PATIENT_NAME}}', '{{MEMBER_ID}}', '{{ADDRESS}}']) if (!draft.includes(p)) fail(`case ${key}: draft lacks ${p}`);

    // Edit, then approve: placeholders filled in the browser, edit kept.
    await editor.fill(draft.replace('Thank you for your help.', 'Thank you for your help. I can also be reached by mail.'));
    await page.getByRole('button', { name: 'Approve letter' }).click();
    const final = await page.getByTestId('letter-final').textContent();
    if (/\{\{[A-Z_]+\}\}/.test(final)) fail(`case ${key}: placeholders left after approval`);
    for (const v of [profile.name, profile.memberId, profile.address]) if (!final.includes(v)) fail(`case ${key}: approved letter lacks "${v}"`);
    if (!final.includes('I can also be reached by mail.')) fail(`case ${key}: edit lost on approval`);

    const stored = (await (await page.request.get(`${BASE_URL}/api/cases`)).json()).find((x) => x.id === c.id);
    console.log(`case ${key}: draft ${draft.split('\n').length} lines, ${must.length} facts cited, approved & filled, status=${stored.status}`);
    if (stored.status !== 'letter_ready') fail(`case ${key}: status ${stored.status}, expected letter_ready`);
    if (/Jordan|Rivera|XKH448210937|Maple Grove/i.test(stored.letter ?? '')) fail(`case ${key}: stored letter contains profile values`);
    await page.screenshot({ path: join(OUT_DIR, `letter-${key}.png`), fullPage: true });
  }

  // The /api/letter request body must be exactly { caseId } — no profile values.
  for (const body of letterRequests) {
    const keys = Object.keys(JSON.parse(body));
    if (keys.join() !== 'caseId') fail(`/api/letter body has keys ${keys}`);
    for (const v of [...Object.values(profile), 'Jordan', 'Rivera']) if (body.toLowerCase().includes(v.toLowerCase())) fail(`/api/letter body contains "${v}"`);
  }
  console.log(`${letterRequests.length} /api/letter request(s): body is only { caseId }`);
} finally {
  await browser.close();
  await deleteTestUser(user); // removes the user's cases too
  console.log(`cleanup: deleted test user and ${created.length} case(s)`);
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
