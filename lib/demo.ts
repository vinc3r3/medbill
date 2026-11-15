// Demo helpers: the synthetic sample cases (docs/spec.md, "Sample cases"). Nothing here is real data.
import type { UsAddress } from './address';
import type { Case } from './types';

export const SAMPLE_KEYS = ['a', 'b', 'c'] as const;
export type SampleKey = (typeof SAMPLE_KEYS)[number];

export const SAMPLE_LABELS: Record<SampleKey, string> = {
  a: 'A: clean bill',
  b: 'B: charged twice',
  c: 'C: billed too much',
};

/** Public URLs of the sample images (copied to public/samples on install). */
export const sampleImage = (key: SampleKey, doc: 'bill' | 'eob' | 'corrected') => `/samples/${key}/${key}-${doc}.png`;

/**
 * The (invented) billing addresses printed on the sample bills. Seeded cases skip the upload, so the browser
 * never reads them from OCR; the seed button stores them instead, as an upload would.
 */
export const SAMPLE_PROVIDER_ADDRESSES: Record<SampleKey, UsAddress> = {
  a: { addressLine1: '88 Harbor View Dr', addressLine2: 'Suite 200', city: 'Fairhaven', state: 'OH', zip: '45098' },
  b: { addressLine1: '310 Mill Race Rd', city: 'Fairhaven', state: 'OH', zip: '45098' },
  c: { addressLine1: '4500 Ridgeline Pkwy', city: 'Fairhaven', state: 'OH', zip: '45097' },
};

/** Loads a sample image as a File, as if the user had picked it. Browser only. */
export async function sampleFile(key: SampleKey, doc: 'bill' | 'eob' | 'corrected'): Promise<File> {
  const res = await fetch(sampleImage(key, doc));
  if (!res.ok) throw new Error(`Couldn't load the sample ${doc} (error ${res.status}).`);
  return new File([await res.blob()], `${key}-${doc}.png`, { type: 'image/png' });
}

/** Sample case C (the only sample with a corrected statement): offer it in the reply panel during the demo. */
export const isSampleC = (c: Pick<Case, 'eob'>) => c.eob.claimId === 'CLM-260721-0956';
