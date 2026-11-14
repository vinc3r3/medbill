// AI extraction of BillDoc / EobDoc from redacted OCR text. Server only.
// The model sees redacted text only; output is validated against lib/schemas.ts, with one retry.
// Provider: EXTRACT_PROVIDER=gemini (default) or claude.
import { CLAUDE_MODEL, callClaude } from './extract-claude';
import { GEMINI_MODEL, callGemini } from './extract-gemini';
import { ExtractError, type CallModel, type DocType } from './extract-prompt';
import { BillDocSchema, EobDocSchema } from './schemas';
import type { BillDoc, EobDoc } from './types';

export { ExtractError, type CallModel, type DocType } from './extract-prompt';
export type ExtractedDoc<T extends DocType> = T extends 'bill' ? BillDoc : EobDoc;

export type ExtractProvider = 'gemini' | 'claude';
export function extractProvider(): ExtractProvider {
  return process.env.EXTRACT_PROVIDER === 'claude' ? 'claude' : 'gemini';
}
/** Model name for the active provider (recorded with cached extractions). */
export const extractModel = () => (extractProvider() === 'claude' ? CLAUDE_MODEL : GEMINI_MODEL);

const defaultCall: CallModel = (docType, text) => (extractProvider() === 'claude' ? callClaude : callGemini)(docType, text);

const STRICT = { bill: BillDocSchema, eob: EobDocSchema } as const;

const MONEY_KEYS = new Set(['billed', 'allowed', 'planPaid', 'patientResponsibility', 'amountDue', 'totalPatientResponsibility']);
const round2 = (n: number) => Math.round(n * 100) / 100;
function normalizeMoney<T>(value: T): T {
  if (Array.isArray(value)) return value.map(normalizeMoney) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, MONEY_KEYS.has(k) && typeof v === 'number' ? round2(v) : normalizeMoney(v)]),
    ) as T;
  }
  return value;
}

/** Extracts and validates a document. Retries once on unusable output, then throws ExtractError. */
export async function extractDoc<T extends DocType>(docType: T, redactedText: string, call: CallModel = defaultCall): Promise<ExtractedDoc<T>> {
  const label = docType === 'bill' ? 'bill' : 'EOB';
  let lastProblem = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await call(docType, redactedText);
    if (raw === null) {
      lastProblem = 'the reply was not valid JSON';
      continue;
    }
    const result = STRICT[docType].safeParse(normalizeMoney(raw));
    if (result.success) return result.data as ExtractedDoc<T>;
    lastProblem = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 3).join('; ');
  }
  throw new ExtractError(`We couldn't read the details of your ${label} reliably (${lastProblem}). Try a clearer photo or scan.`);
}
