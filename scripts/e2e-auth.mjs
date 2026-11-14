// Task 12 check: signed-out requests to case routes get 401 (pages redirect to sign in); user A's case is a
// 404 for user B; sign-up, sign-in and sign-out work through the UI. Run against local or deployed:
// BASE_URL=https://… npm run e2e:auth. Creates temporary users and deletes them (their cases go too).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createTestUser, deleteTestUser, signIn } from './e2e-helpers.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const FAKE_ID = '00000000-0000-4000-8000-000000000000';
let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
const check = (ok, label) => (ok ? console.log(`  ok   ${label}`) : fail(label));

const browser = await chromium.launch({ channel: 'chrome' });
const signupEmail = `signup-${crypto.randomUUID().slice(0, 8)}@example.com`;
const signupPassword = `pw-${crypto.randomUUID().slice(0, 12)}`;
const bob = await createTestUser('bob');

try {
  // 1) Signed out
  console.log('signed out:');
  const anon = await browser.newContext();
  const api = anon.request;
  const routes = [
    ['POST', '/api/extract', { docType: 'bill', redactedText: 'x'.repeat(40) }],
    ['POST', '/api/cases', {}],
    ['GET', '/api/cases'],
    ['POST', '/api/check', { caseId: FAKE_ID }],
    ['POST', '/api/letter', { caseId: FAKE_ID }],
    ['POST', '/api/send', { caseId: FAKE_ID }],
    ['GET', `/api/cases/${FAKE_ID}/preview`],
  ];
  for (const [method, path, data] of routes) {
    const r = method === 'GET' ? await api.get(BASE_URL + path, { maxRedirects: 0 }) : await api.post(BASE_URL + path, { data, maxRedirects: 0 });
    check(r.status() === 401, `${method} ${path} → ${r.status()}`);
  }
  const anonPage = await anon.newPage();
  for (const path of ['/dashboard', '/new', '/settings', `/cases/${FAKE_ID}`]) {
    await anonPage.goto(BASE_URL + path);
    const u = new URL(anonPage.url());
    check(u.pathname === '/signin' && u.searchParams.get('next') === path, `page ${path} → ${u.pathname}${u.search}`);
  }

  // 2) Sign up, sign out, sign back in (through the UI)
  console.log('sign-up / sign-out / sign-in:');
  const alice = await browser.newContext();
  const page = await alice.newPage();
  await page.goto(`${BASE_URL}/signup`);
  await page.getByLabel('Email').fill(signupEmail);
  await page.getByLabel('Password').fill(signupPassword);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30_000 }).catch(() => {});
  check(new URL(page.url()).pathname === '/dashboard', `sign-up lands on the dashboard (${new URL(page.url()).pathname})`);
  check((await page.getByTestId('user-email').textContent().catch(() => '')) === signupEmail, 'header shows the signed-in email');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL((u) => u.pathname === '/signin', { timeout: 15_000 }).catch(() => {});
  await page.goto(`${BASE_URL}/dashboard`);
  check(new URL(page.url()).pathname === '/signin', 'after sign-out, /dashboard redirects to /signin');

  await page.getByLabel('Email').fill(signupEmail);
  await page.getByLabel('Password').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const err = await page.getByRole('alert').filter({ hasText: /wrong email or password/i }).textContent({ timeout: 15_000 }).catch(() => null);
  check(Boolean(err), 'wrong password shows "Wrong email or password."');

  await page.goto(`${BASE_URL}/signin?next=${encodeURIComponent('https://evil.example/x')}`);
  await page.getByLabel('Email').fill(signupEmail);
  await page.getByLabel('Password').fill(signupPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/signin'), { timeout: 30_000 }).catch(() => {});
  const after = new URL(page.url());
  check(after.origin === new URL(BASE_URL).origin && after.pathname === '/dashboard', `sign-in works and ignores an off-site next= (${after.href})`);

  // 3) Isolation: Alice's case is invisible to Bob
  console.log('isolation:');
  const exp = JSON.parse(readFileSync('samples/c/expected.json', 'utf8'));
  const created = await (await page.request.post(`${BASE_URL}/api/cases`, { data: { bill: exp.bill, eob: exp.eob } })).json();
  check(Boolean(created.id), `Alice created case ${created.id}`);
  check((await page.request.post(`${BASE_URL}/api/check`, { data: { caseId: created.id } })).status() === 200, 'Alice can check her case');

  const bobCtx = await browser.newContext();
  const bobPage = await bobCtx.newPage();
  await signIn(bobPage, BASE_URL, bob);
  // The case page streams, so its HTTP status is sent (200) before the lookup inside <Suspense> runs; what
  // matters is that Bob gets the not-found page and none of Alice's data reaches his browser.
  await bobPage.goto(`${BASE_URL}/cases/${created.id}`);
  await bobPage.waitForLoadState('networkidle');
  const bobHtml = await bobPage.content();
  check(/could not be found/i.test(await bobPage.locator('body').innerText()), "Bob opening Alice's case page sees the 404 page");
  check(!/Summit Urgent Care|CLM-260721-0956/.test(bobHtml), "none of Alice's case data is in Bob's page (HTML or streamed payload)");
  for (const [path, data] of [['/api/check', { caseId: created.id }], ['/api/letter', { caseId: created.id }]]) {
    const r = await bobPage.request.post(BASE_URL + path, { data });
    check(r.status() === 404, `Bob POST ${path} with Alice's case → ${r.status()}`);
  }
  const preview = await bobPage.request.get(`${BASE_URL}/api/cases/${created.id}/preview`, { maxRedirects: 0 });
  check(preview.status() === 404, `Bob GET preview of Alice's case → ${preview.status()}`);
  const bobList = await (await bobPage.request.get(`${BASE_URL}/api/cases`)).json();
  check(Array.isArray(bobList) && !bobList.some((c) => c.id === created.id), `Bob's case list (${bobList.length}) excludes Alice's case`);
  const aliceList = await (await page.request.get(`${BASE_URL}/api/cases`)).json();
  check(aliceList.some((c) => c.id === created.id && c.status === 'checked'), "Alice's list includes her checked case");
} finally {
  await browser.close();
  await deleteTestUser(signupEmail);
  await deleteTestUser(bob);
  console.log('cleanup: deleted test users and their cases');
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
