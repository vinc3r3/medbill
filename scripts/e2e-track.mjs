// Task 13 check: webhook rejects unsigned/forged events; after sending, the case page shows a 30-day
// reminder, and "Simulate delivery" (PostGrid test progressions) changes the status to `delivered`.
// Usage: BASE_URL=… npm run e2e:track (needs POSTGRID_WEBHOOK_SECRET in .env.local, same as the server).
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createTestUser, deleteTestUser, signIn } from './e2e-helpers.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const SECRET = process.env.POSTGRID_WEBHOOK_SECRET;
let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
const check = (ok, label) => (ok ? console.log(`  ok   ${label}`) : fail(label));
const b64 = (v) => Buffer.from(v).toString('base64url');
const jwt = (payload, secret) => {
  const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64(JSON.stringify(payload));
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
};

const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const user = await createTestUser('track');

try {
  console.log('webhook security:');
  const hook = (body) => fetch(`${BASE_URL}/api/mail-webhook`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body });
  const event = { id: 'event_test', object: 'event', type: 'letter.updated', live: false, data: { id: 'letter_unknown', object: 'letter', status: 'completed' } };
  check((await hook(JSON.stringify(event))).status === 401, 'unsigned JSON event → 401');
  check((await hook(jwt(event, 'x'.repeat(64)))).status === 401, 'event signed with the wrong secret → 401');
  check((await hook('garbage')).status === 401, 'garbage body → 401');
  const ok = await hook(jwt(event, SECRET));
  check(ok.status === 200 && (await ok.json()).ignored === 'unknown letter', 'correctly signed event for an unknown letter → 200, ignored');

  console.log('send → reminder → simulate delivery:');
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, BASE_URL, user);
  const api = (path, data) => page.request.post(BASE_URL + path, { data }).then(async (r) => ({ status: r.status(), json: await r.json() }));
  const exp = JSON.parse(readFileSync('samples/c/expected.json', 'utf8'));
  const { json: c } = await api('/api/cases', { bill: exp.bill, eob: exp.eob });
  await api('/api/check', { caseId: c.id });
  const { json: { letter } } = await api('/api/letter', { caseId: c.id });
  const filled = letter.replaceAll('{{PATIENT_NAME}}', profile.name).replaceAll('{{MEMBER_ID}}', profile.memberId).replaceAll('{{ADDRESS}}', profile.address);
  const sent = await api('/api/send', {
    caseId: c.id,
    letterText: filled,
    to: { name: 'Summit Urgent Care', addressLine1: '4500 Ridgeline Pkwy', city: 'Fairhaven', state: 'OH', zip: '45097' },
    from: { name: profile.name, addressLine1: '1427 Maple Grove Ln', city: 'Fairhaven', state: 'OH', zip: '45099' },
  });
  check(sent.status === 200 && /^letter_/.test(sent.json.mailLetterId), `sent via PostGrid (${sent.json.mailLetterId})`);

  await page.goto(`${BASE_URL}/cases/${c.id}`);
  check((await page.getByTestId('case-status').textContent()) === 'sent', 'case page shows status sent');
  const reminder = await page.getByTestId('reminder').textContent();
  const due = new Date(Date.now() + 30 * 864e5).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  check(reminder.includes(due), `reminder shows follow-up date ${due}`);

  const started = Date.now();
  await page.getByRole('button', { name: 'Simulate delivery (test mode)' }).click();
  await page.getByText('Your letter was delivered').waitFor({ timeout: 60_000 }).catch(() => {});
  const shown = await page.getByTestId('case-status').textContent();
  check(shown === 'delivered', `after "Simulate delivery": page shows ${shown} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  const listed = (await (await page.request.get(`${BASE_URL}/api/cases`)).json()).find((x) => x.id === c.id);
  check(listed?.status === 'delivered', `GET /api/cases reports ${listed?.status}`);
  check((await page.getByRole('button', { name: 'Simulate delivery (test mode)' }).count()) === 0, 'simulate button is gone once delivered');
  console.log(`MAIL_LETTER_ID ${sent.json.mailLetterId}`);
} finally {
  await browser.close();
  await deleteTestUser(user);
  console.log('cleanup: deleted test user and case');
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
