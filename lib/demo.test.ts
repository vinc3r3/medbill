// Demo data must match what the real upload path would produce.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findProviderAddress } from './address';
import { SAMPLE_KEYS, SAMPLE_PROVIDER_ADDRESSES, sampleImage } from './demo';

const ROOT = join(__dirname, '..');
const profile = JSON.parse(readFileSync(join(ROOT, 'samples', 'profile.json'), 'utf8'));

describe('demo samples', () => {
  it.each(SAMPLE_KEYS)('sample %s: stored provider address = what the browser finds on the bill', (key) => {
    const ocr = readFileSync(join(ROOT, 'samples', key, `${key}-bill.ocr.txt`), 'utf8');
    expect(SAMPLE_PROVIDER_ADDRESSES[key]).toEqual(findProviderAddress(ocr, [profile.address]));
  });

  it('sample image URLs point at files in /samples', () => {
    for (const key of SAMPLE_KEYS) {
      for (const doc of ['bill', 'eob'] as const) expect(existsSync(join(ROOT, sampleImage(key, doc)))).toBe(true);
    }
    expect(existsSync(join(ROOT, sampleImage('c', 'corrected')))).toBe(true);
  });
});
