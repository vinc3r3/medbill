// Cache of validated extractions, keyed by a SHA-256 fingerprint of docType + redacted text.
// Same document → one AI call ever. Stores no personal details (input is already redacted; only the hash
// and the structured result are kept). The cache is best-effort: if it's down, we just call the AI.
import { createHash } from 'node:crypto';
import type { DocType, ExtractedDoc } from './extract';
import { BillDocSchema, EobDocSchema } from './schemas';

export type ExtractionStore = {
  get(hash: string): Promise<unknown | null>;
  put(hash: string, docType: DocType, result: unknown): Promise<void>;
};

const normalize = (text: string) => text.replace(/\r\n?/g, '\n').trim();

export function extractionKey(docType: DocType, text: string): string {
  return createHash('sha256').update(`${docType}\n${normalize(text)}`).digest('hex');
}

const STRICT = { bill: BillDocSchema, eob: EobDocSchema } as const;

export async function extractCached<T extends DocType>(
  docType: T,
  redactedText: string,
  { store, extract }: { store: ExtractionStore; extract: (docType: T, text: string) => Promise<ExtractedDoc<T>> },
): Promise<{ doc: ExtractedDoc<T>; cached: boolean }> {
  const hash = extractionKey(docType, redactedText);

  const hit = await store.get(hash).catch((err) => {
    console.error('extraction cache read failed', err);
    return null;
  });
  if (hit !== null) {
    const valid = STRICT[docType].safeParse(hit); // entries written before a schema change are ignored
    if (valid.success) return { doc: valid.data as ExtractedDoc<T>, cached: true };
  }

  const doc = await extract(docType, redactedText); // failures propagate and are never cached
  await store.put(hash, docType, doc).catch((err) => console.error('extraction cache write failed', err));
  return { doc, cached: false };
}
