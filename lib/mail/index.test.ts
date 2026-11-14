import { describe, expect, it, vi } from 'vitest';
import { waitUntilAccepted } from './index';
import type { MailLetter, MailProvider } from './types';

const letter = (over: Partial<MailLetter> = {}): MailLetter => ({
  id: 'letter_1', status: 'ready', previewUrl: null, trackingNumber: null, cancelledReason: null, ...over,
});
const fake = (sequence: MailLetter[]) => {
  const getLetter = vi.fn<MailProvider['getLetter']>();
  for (const l of sequence) getLetter.mockResolvedValueOnce(l);
  return { provider: { getLetter, createCertifiedLetter: vi.fn(), advanceTestLetter: vi.fn() } as MailProvider, getLetter };
};
const opts = { minWaitMs: 3, maxWaitMs: 10, intervalMs: 1, sleep: async () => {} };

describe('waitUntilAccepted', () => {
  it('waits for the preview and the minimum check time', async () => {
    const { provider, getLetter } = fake([letter(), letter({ previewUrl: 'u' }), letter({ previewUrl: 'u' }), letter({ previewUrl: 'u' })]);
    const result = await waitUntilAccepted(provider, letter(), opts);
    expect(result.previewUrl).toBe('u');
    expect(result.status).toBe('ready');
    expect(getLetter).toHaveBeenCalledTimes(3);
  });

  it('stops as soon as the vendor cancels the letter', async () => {
    const { provider } = fake([letter({ status: 'cancelled', cancelledReason: 'Content found overlapping address region.' })]);
    const result = await waitUntilAccepted(provider, letter(), opts);
    expect(result.cancelledReason).toMatch(/overlapping/);
  });

  it('gives up after the maximum wait without a preview', async () => {
    const { provider, getLetter } = fake(Array.from({ length: 20 }, () => letter()));
    const result = await waitUntilAccepted(provider, letter(), opts);
    expect(result.previewUrl).toBeNull();
    expect(getLetter).toHaveBeenCalledTimes(10);
  });
});
