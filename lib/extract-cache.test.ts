// Extraction cache (docs/spec.md, "Extraction cache"). Written before lib/extract-cache.ts.
import { describe, expect, it, vi } from 'vitest';
import { extractCached, extractionKey, type ExtractionStore } from './extract-cache';
import type { BillDoc } from './types';

const bill: BillDoc = {
  provider: 'Test Clinic',
  serviceDate: '2026-03-04',
  lines: [{ date: '2026-03-04', code: '99213', description: 'Office visit', billed: 40 }],
  amountDue: 40,
};

function memoryStore(): ExtractionStore & { rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  return {
    rows,
    get: async (hash) => rows.get(hash) ?? null,
    put: async (hash, _docType, result) => void rows.set(hash, result),
  };
}

describe('extractionKey', () => {
  it('is a SHA-256 hex digest that depends on docType and text', () => {
    const k = extractionKey('bill', 'text');
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(extractionKey('eob', 'text')).not.toBe(k);
    expect(extractionKey('bill', 'other text')).not.toBe(k);
  });

  it('ignores line-ending style and surrounding whitespace', () => {
    expect(extractionKey('bill', 'a\r\nb\n')).toBe(extractionKey('bill', '  a\nb'));
  });
});

describe('extractCached', () => {
  it('calls the AI once for the same document, then serves the cache', async () => {
    const store = memoryStore();
    const extract = vi.fn().mockResolvedValue(bill);
    const first = await extractCached('bill', 'redacted text', { store, extract });
    const second = await extractCached('bill', 'redacted text', { store, extract });
    expect(first).toEqual({ doc: bill, cached: false });
    expect(second).toEqual({ doc: bill, cached: true });
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('keeps bills and EOBs with the same text apart', async () => {
    const store = memoryStore();
    const extract = vi.fn().mockResolvedValue(bill);
    await extractCached('bill', 'same', { store, extract });
    await extractCached('eob', 'same', { store, extract: vi.fn().mockRejectedValue(new Error('called')) }).catch(() => {});
    expect(store.rows.size).toBe(1);
  });

  it('ignores a cached entry that no longer matches the types and re-extracts', async () => {
    const store = memoryStore();
    store.rows.set(extractionKey('bill', 't'), { provider: 'x' }); // stale shape
    const extract = vi.fn().mockResolvedValue(bill);
    await expect(extractCached('bill', 't', { store, extract })).resolves.toEqual({ doc: bill, cached: false });
    expect(store.rows.get(extractionKey('bill', 't'))).toEqual(bill);
  });

  it('still extracts when the cache is down, and does not fail on a write error', async () => {
    const broken: ExtractionStore = { get: vi.fn().mockRejectedValue(new Error('db down')), put: vi.fn().mockRejectedValue(new Error('db down')) };
    const extract = vi.fn().mockResolvedValue(bill);
    await expect(extractCached('bill', 't', { store: broken, extract })).resolves.toEqual({ doc: bill, cached: false });
  });

  it('does not cache failures', async () => {
    const store = memoryStore();
    await expect(extractCached('bill', 't', { store, extract: vi.fn().mockRejectedValue(new Error('bad')) })).rejects.toThrow('bad');
    expect(store.rows.size).toBe(0);
  });
});
