// Copies the synthetic sample images into public/samples so the demo can load them with one click
// ("Try a sample"). Runs on `postinstall`; public/samples is git-ignored (the source of truth is /samples).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'samples');
const OUT = join(process.cwd(), 'public', 'samples');
let n = 0;
for (const key of ['a', 'b', 'c']) {
  mkdirSync(join(OUT, key), { recursive: true });
  for (const file of readdirSync(join(SRC, key)).filter((f) => f.endsWith('.png'))) {
    copyFileSync(join(SRC, key, file), join(OUT, key, file));
    n++;
  }
}
console.log(`copy-samples: ${n} images → public/samples`);
