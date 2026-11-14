// Task 11 check: the same redacted document twice → one AI call; the second answer comes from the cache
// (x-extract-cache: hit) in under 1 second. Uses sample C's bill (1 AI call at most; 0 if already cached).
// Usage: start the app (`npm run dev`) or set BASE_URL to the deployed site, then `npm run check:cache`.
import { readFileSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const { redact } = await import('../lib/redact.ts');
const profile = JSON.parse(readFileSync('samples/profile.json', 'utf8'));
const body = JSON.stringify({ docType: 'bill', redactedText: redact(readFileSync('samples/c/c-bill.ocr.txt', 'utf8'), profile) });
const expected = JSON.parse(readFileSync('samples/c/expected.json', 'utf8')).bill;

async function call(label) {
  const started = performance.now();
  const r = await fetch(`${BASE_URL}/api/extract`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const ms = Math.round(performance.now() - started);
  const json = await r.json();
  const cache = r.headers.get('x-extract-cache');
  console.log(`${label}: HTTP ${r.status}, cache=${cache}, ${ms}ms${json.error ? `, error: ${json.error}` : `, amountDue=${json.amountDue}`}`);
  return { status: r.status, cache, ms, json };
}

const first = await call('request 1');
const second = await call('request 2');
let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
if (first.status !== 200 || second.status !== 200) fail('a request failed');
if (second.cache !== 'hit') fail('second request was not served from the cache');
if (second.ms >= 1000) fail(`cache hit took ${second.ms}ms (want < 1000ms)`);
if (second.json.amountDue !== expected.amountDue) fail('cached result does not match expected.json');
console.log(first.cache === 'miss' ? 'AI calls made: 1' : 'AI calls made: 0 (already cached from an earlier run)');
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
