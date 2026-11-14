// Task 4 check: OCR produces text for every sample, and no network request carries document text.
// Usage: start the app (`npm run dev`), then `npm run e2e:ocr` (BASE_URL defaults to http://localhost:3000).
// Uses your installed Google Chrome via playwright-core.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const host = new URL(BASE_URL).host; // compare host so ws://localhost:3000 (dev reload) counts as ours
const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));

const usd = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Distinctive strings printed on the documents; none may appear in any outgoing request. */
function needlesFor(expected) {
  return [
    profile.name, profile.memberId, profile.address, profile.dateOfBirth,
    expected.bill.provider, expected.eob.claimId,
    ...expected.bill.lines.map((l) => l.description),
  ];
}

const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };

try {
  for (const key of ['a', 'b', 'c']) {
    const expected = JSON.parse(readFileSync(join('samples', key, 'expected.json'), 'utf8'));
    const context = await browser.newContext();
    const sent = []; // { host, where, data }
    // Context-level capture includes requests made by the OCR web worker.
    context.on('request', (r) => sent.push({ host: new URL(r.url()).host, where: `${r.method()} ${r.url()}`, data: `${r.url()}\n${r.postData() ?? ''}` }));
    const page = await context.newPage();
    page.on('websocket', (ws) => ws.on('framesent', (f) => sent.push({ host: new URL(ws.url()).host, where: `ws ${ws.url()}`, data: String(f.payload) })));

    await page.goto(BASE_URL);
    await page.getByTestId('bill-input').setInputFiles(join('samples', key, `${key}-bill.png`));
    await page.getByTestId('eob-input').setInputFiles(join('samples', key, `${key}-eob.png`));
    const started = Date.now();
    await page.getByRole('button', { name: 'Check my bill' }).click();
    await page.getByTestId('ocr-bill').waitFor({ timeout: 120_000 });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    const billText = await page.getByTestId('ocr-bill').textContent();
    const eobText = await page.getByTestId('ocr-eob').textContent();
    console.log(`case ${key}: OCR ${seconds}s, bill ${billText.length} chars, eob ${eobText.length} chars`);

    // 1) Text appears, and the key figures were read correctly.
    if (!billText.includes(usd(expected.bill.amountDue))) fail(`bill text lacks amount due ${usd(expected.bill.amountDue)}`);
    if (!eobText.includes(usd(expected.eob.totalPatientResponsibility))) fail(`eob text lacks total ${usd(expected.eob.totalPatientResponsibility)}`);
    if (!eobText.includes(expected.eob.claimId)) fail(`eob text lacks claim id ${expected.eob.claimId}`);

    // 2) Nothing leaves our origin, and no request carries document text.
    // blob:/data: URLs are in-memory reads of the uploaded files (previews, OCR input), not network traffic.
    const isLocal = (s) => /^(GET|POST|PUT) (blob|data):/.test(s.where);
    const external = sent.filter((s) => !isLocal(s) && s.host !== host);
    if (external.length) fail(`requests left the origin: ${external.map((s) => s.where).join(', ')}`);
    for (const needle of needlesFor(expected)) {
      const hit = sent.find((s) => s.data.toLowerCase().includes(needle.toLowerCase()));
      if (hit) fail(`"${needle}" found in ${hit.where}`);
    }
    console.log(`  ${sent.length} requests/frames checked, ${external.length} external`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
