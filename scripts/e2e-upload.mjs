// Task 3 check: load each sample pair into the upload screen and confirm both previews render.
// Usage: start the app (`npm run dev`), then `npm run e2e:upload` (BASE_URL defaults to http://localhost:3000).
// Screenshots go to OUT_DIR (default: ./.e2e, git-ignored). Uses your installed Google Chrome.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = process.env.OUT_DIR ?? '.e2e';
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;
try {
  for (const key of ['a', 'b', 'c']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    await page.goto(BASE_URL);
    await page.getByTestId('bill-input').setInputFiles(join('samples', key, `${key}-bill.png`));
    await page.getByTestId('eob-input').setInputFiles(join('samples', key, `${key}-eob.png`));

    const results = {};
    for (const label of ['Bill', 'EOB']) {
      const img = page.getByAltText(`${label} preview`);
      await img.waitFor({ state: 'visible', timeout: 5000 });
      // naturalWidth > 0 means the image actually decoded, not just that the <img> exists.
      results[label] = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
    }
    const buttonEnabled = await page.getByRole('button', { name: 'Read my documents' }).isEnabled();
    await page.screenshot({ path: join(OUT_DIR, `upload-${key}.png`), fullPage: true });

    const ok = results.Bill && results.EOB && buttonEnabled;
    if (!ok) failures++;
    console.log(`case ${key}: bill preview ${results.Bill ? 'ok' : 'MISSING'}, eob preview ${results.EOB ? 'ok' : 'MISSING'}, button ${buttonEnabled ? 'enabled' : 'DISABLED'}`);
    await page.close();
  }

  // Wrong file type shows a readable error and no preview.
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page.getByTestId('bill-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  const alert = await page.getByRole('alert').filter({ hasText: 'supported image' }).textContent({ timeout: 5000 });
  const rejected = /isn't a supported image/.test(alert ?? '') && (await page.getByAltText('Bill preview').count()) === 0;
  if (!rejected) failures++;
  console.log(`wrong file type: ${rejected ? 'rejected with message' : 'NOT REJECTED'}`);
} finally {
  await browser.close();
}
process.exit(failures ? 1 : 0);
