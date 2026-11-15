// Writes the Tesseract OCR text of every sample image to samples/<case>/<case>-<doc>.ocr.txt.
// These are test fixtures for redaction (and later extraction), so tests use real OCR output.
// Same engine and English data as the browser (public/tesseract). Usage: npm run samples:ocr
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorker } from 'tesseract.js';

const worker = await createWorker('eng', 1, { langPath: join('public', 'tesseract', 'lang'), cacheMethod: 'none' });
try {
  for (const key of ['a', 'b', 'c']) {
    for (const doc of key === 'c' ? ['bill', 'eob', 'corrected'] : ['bill', 'eob']) {
      const { data } = await worker.recognize(join('samples', key, `${key}-${doc}.png`));
      writeFileSync(join('samples', key, `${key}-${doc}.ocr.txt`), data.text);
      console.log(`${key}-${doc}: ${data.text.length} chars`);
    }
  }
} finally {
  await worker.terminate();
}
