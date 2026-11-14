// Task 10 check: "Approve and send" creates a PostGrid certified letter (TEST key) — we get a letter id and
// a preview link, and the case status becomes `sent`. Uses case C from expected.json (no AI calls).
// Usage: start the app (`npm run dev`), then `npm run e2e:send`. Deletes the case it creates.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createTestUser, deleteTestUser, openHome, signIn } from './e2e-helpers.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = process.env.OUT_DIR ?? '.e2e';
mkdirSync(OUT_DIR, { recursive: true });
const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));
const [mm, dd, yyyy] = profile.dateOfBirth.split('/');
let post; // set once signed in, so API calls carry the session cookie

const browser = await chromium.launch({ channel: 'chrome' });
const user = await createTestUser('send');
let caseId = null;
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };

try {
  const exp = JSON.parse(readFileSync('samples/c/expected.json', 'utf8'));
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, BASE_URL, user);
  post = (p, b) => page.request.post(BASE_URL + p, { data: b });
  caseId = (await (await post('/api/cases', { bill: exp.bill, eob: exp.eob })).json()).id;
  await post('/api/check', { caseId });
  await openHome(page, BASE_URL);
  await page.getByLabel('Full name').fill(profile.name);
  await page.getByLabel('Date of birth').fill(`${yyyy}-${mm}-${dd}`);
  await page.getByLabel('Insurance member ID').fill(profile.memberId);
  await page.getByLabel('Mailing address').fill(profile.address);
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByText('Saved on this device.').waitFor();
  // What "Check my bill" stores from the raw OCR text (findProviderAddress is unit-tested on the samples).
  await page.evaluate((id) => localStorage.setItem(`medbill.providerAddress.${id}`, JSON.stringify({ addressLine1: '4500 Ridgeline Pkwy', city: 'Fairhaven', state: 'OH', zip: '45097' })), caseId);

  await page.goto(`${BASE_URL}/cases/${caseId}`);
  await page.getByRole('button', { name: 'Draft a letter' }).click();
  await page.getByTestId('letter-editor').waitFor();
  await page.getByRole('button', { name: 'Approve letter' }).click();

  const to = page.getByTestId('send-to');
  const prefilled = { name: await to.getByLabel('Name').inputValue(), street: await to.getByLabel('Street address').inputValue(), zip: await to.getByLabel('ZIP').inputValue() };
  const fromName = await page.getByTestId('send-from').getByLabel('Name').inputValue();
  console.log(`to (prefilled): ${prefilled.name}, ${prefilled.street} ${prefilled.zip} | from: ${fromName}`);
  if (prefilled.street !== '4500 Ridgeline Pkwy' || prefilled.name !== 'Summit Urgent Care') fail('provider address not prefilled');
  if (fromName !== profile.name) fail('sender name not prefilled from profile');

  const started = Date.now();
  await page.getByRole('button', { name: 'Approve and send by certified mail' }).click();
  await page.getByTestId('sent-panel').waitFor({ timeout: 60_000 }).catch(async () => {
    throw new Error(`never reached "sent": ${(await page.getByRole('alert').allTextContents()).join(' ')}`);
  });
  console.log(`sent in ${((Date.now() - started) / 1000).toFixed(1)}s; page status: ${await page.getByTestId('case-status').textContent()}`);
  await page.screenshot({ path: join(OUT_DIR, 'send-c.png'), fullPage: true });

  const stored = (await (await page.request.get(`${BASE_URL}/api/cases`)).json()).find((x) => x.id === caseId);
  console.log(`stored: status=${stored.status}, mailLetterId=${stored.mailLetterId}, previewUrl=${stored.previewUrl ? 'yes' : 'no'}, sentAt=${stored.sentAt}`);
  if (stored.status !== 'sent') fail(`status ${stored.status}`);
  if (!/^letter_/.test(stored.mailLetterId ?? '')) fail('no PostGrid letter id');
  if (!stored.previewUrl) fail('no preview url stored');
  if (/Jordan|Rivera|XKH448210937|Maple Grove/i.test(stored.letter ?? '')) fail('stored letter contains filled-in profile values');

  const preview = await page.request.get(`${BASE_URL}/api/cases/${caseId}/preview`, { maxRedirects: 0 });
  const pdfUrl = preview.headers()['location'];
  const pdf = pdfUrl ? await fetch(pdfUrl) : null;
  console.log(`preview: ${preview.status()} -> ${pdf ? `${pdf.status} ${pdf.headers.get('content-type')}` : 'no redirect'}`);
  if (preview.status() !== 302 || !pdf?.ok || !/pdf/.test(pdf.headers.get('content-type') ?? '')) fail('preview link did not lead to a PDF');

  const again = await post('/api/send', { caseId, letterText: 'x'.repeat(60), to: { name: 'a', addressLine1: '1 Main St', city: 'X', state: 'OH', zip: '45000' }, from: { name: 'b', addressLine1: '1 Main St', city: 'X', state: 'OH', zip: '45000' } });
  console.log(`second send: ${again.status()} ${(await again.json()).error}`);
  if (again.status() !== 409) fail('second send was not refused');
} finally {
  await browser.close();
  await deleteTestUser(user); // removes the user's case too
  console.log('cleanup: deleted test user and case');
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
