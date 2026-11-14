// Address helpers for mailing. Written before lib/address.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findProviderAddress, formatAddress, parseUsAddress } from './address';

const SAMPLES = join(__dirname, '..', 'samples');
const profile = JSON.parse(readFileSync(join(SAMPLES, 'profile.json'), 'utf8'));

describe('parseUsAddress', () => {
  it('splits a one-line address', () => {
    expect(parseUsAddress('1427 Maple Grove Ln, Fairhaven, OH 45099')).toEqual({
      addressLine1: '1427 Maple Grove Ln', city: 'Fairhaven', state: 'OH', zip: '45099',
    });
  });

  it('keeps a suite/apartment as line 2', () => {
    expect(parseUsAddress('88 Harbor View Dr, Suite 200, Fairhaven, OH 45098')).toEqual({
      addressLine1: '88 Harbor View Dr', addressLine2: 'Suite 200', city: 'Fairhaven', state: 'OH', zip: '45098',
    });
  });

  it('accepts line breaks, lowercase state and ZIP+4', () => {
    expect(parseUsAddress('12 Oak St\nApt 3B\nSpringfield, il 62704-1234')).toEqual({
      addressLine1: '12 Oak St', addressLine2: 'Apt 3B', city: 'Springfield', state: 'IL', zip: '62704-1234',
    });
  });

  it('returns null when city/state/ZIP are missing', () => {
    expect(parseUsAddress('1427 Maple Grove Ln')).toBeNull();
    expect(parseUsAddress('')).toBeNull();
  });

  it('round-trips through formatAddress', () => {
    const a = parseUsAddress('88 Harbor View Dr, Suite 200, Fairhaven, OH 45098')!;
    expect(formatAddress(a)).toBe('88 Harbor View Dr, Suite 200, Fairhaven, OH 45098');
  });
});

describe('findProviderAddress (raw OCR text, browser only)', () => {
  const ocr = (k: string) => readFileSync(join(SAMPLES, k, `${k}-bill.ocr.txt`), 'utf8');

  it.each([
    ['a', '88 Harbor View Dr, Suite 200, Fairhaven, OH 45098'],
    ['b', '310 Mill Race Rd, Fairhaven, OH 45098'],
    ['c', '4500 Ridgeline Pkwy, Fairhaven, OH 45097'],
  ])('finds the provider address on sample %s, skipping the patient address', (key, expected) => {
    const found = findProviderAddress(ocr(key), [profile.address]);
    expect(found && formatAddress(found)).toBe(expected);
  });

  it('returns null when only the patient address is present', () => {
    expect(findProviderAddress(`Patient\n${profile.address}`, [profile.address])).toBeNull();
  });
});
