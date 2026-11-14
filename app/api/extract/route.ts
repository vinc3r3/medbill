// POST /api/extract — { redactedText, docType } → BillDoc | EobDoc  (docs/spec.md)
// Receives redacted text only. As a second line of defence it re-runs the redaction patterns and
// refuses text that still contains personal details.
import Anthropic from '@anthropic-ai/sdk';
import { ApiError as GeminiApiError } from '@google/genai';
import { z } from 'zod';
import { ExtractError, extractDoc, extractModel, extractProvider } from '@/lib/extract';
import { extractCached } from '@/lib/extract-cache';
import { supabaseExtractionStore } from '@/lib/extractions-repo';
import { EMPTY_PROFILE } from '@/lib/profile';
import { redact } from '@/lib/redact';

// AI calls take 5–20s, plus retries on transient errors.
export const maxDuration = 120;

const Body = z.object(
  {
    redactedText: z
      .string({ error: 'Missing the document text.' })
      .trim()
      .min(20, 'The document text is empty or too short.')
      .max(50_000, 'The document text is too long.'),
    docType: z.enum(['bill', 'eob'], { error: 'docType must be "bill" or "eob".' }),
  },
  { error: 'Send JSON like { "redactedText": "...", "docType": "bill" }.' },
);

const error = (status: number, message: string) => Response.json({ error: message }, { status });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(400, body.error.issues[0]?.message ?? 'Invalid request.');
  const { redactedText, docType } = body.data;

  if (redact(redactedText, EMPTY_PROFILE) !== redactedText) {
    return error(400, 'This text still contains personal details (like a date of birth, ID or address). Please redact it first.');
  }

  try {
    const store = supabaseExtractionStore({ provider: extractProvider(), model: extractModel() });
    const { doc, cached } = await extractCached(docType, redactedText, { store, extract: extractDoc });
    return Response.json(doc, { headers: { 'x-extract-cache': cached ? 'hit' : 'miss' } });
  } catch (err) {
    if (err instanceof ExtractError) return error(422, err.message);
    if (err instanceof GeminiApiError && err.status === 429 && /PerDay/i.test(err.message)) {
      console.error('Gemini daily free-tier quota exhausted');
      return error(429, "Today's free AI limit has been reached. Please try again tomorrow.");
    }
    if (err instanceof Anthropic.RateLimitError || (err instanceof GeminiApiError && err.status === 429)) {
      return error(429, 'The AI service is busy. Please wait a minute and try again.');
    }
    if (err instanceof GeminiApiError) {
      console.error(`Gemini API error ${err.status}: ${err.message}`);
      return error(err.status === 401 || err.status === 403 ? 500 : 502, 'The AI service had a problem. Please try again.');
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('Anthropic authentication failed — check ANTHROPIC_API_KEY');
      return error(500, 'The AI service is not configured correctly.');
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${err.status}: ${err.message}`);
      return error(502, 'The AI service had a problem. Please try again.');
    }
    console.error(err);
    return error(500, 'Something went wrong while reading your document.');
  }
}
