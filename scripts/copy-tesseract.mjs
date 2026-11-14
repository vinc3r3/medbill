// Copies Tesseract.js worker, WASM cores and English data into public/tesseract so OCR is
// served from our own origin (no CDN). Runs on `postinstall`; public/tesseract is git-ignored.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const OUT = join(process.cwd(), 'public', 'tesseract');

const files = [
  [join(pkgDir('tesseract.js'), 'dist', 'worker.min.js'), 'worker.min.js'],
  // LSTM-only cores (default OEM). The worker picks one based on browser SIMD support.
  ...['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm'].map((n) => [
    join(pkgDir('tesseract.js-core'), `${n}.wasm.js`),
    `core/${n}.wasm.js`,
  ]),
  [join(pkgDir('@tesseract.js-data/eng'), '4.0.0_best_int', 'eng.traineddata.gz'), 'lang/eng.traineddata.gz'],
];

for (const [from, to] of files) {
  if (!existsSync(from)) throw new Error(`copy-tesseract: missing ${from}. Run npm install.`);
  mkdirSync(dirname(join(OUT, to)), { recursive: true });
  copyFileSync(from, join(OUT, to));
}
console.log(`copy-tesseract: ${files.length} files → public/tesseract`);
