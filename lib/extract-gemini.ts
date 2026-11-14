// Gemini provider for extraction (EXTRACT_PROVIDER=gemini, the default). Server only.
// Note: on Gemini's free tier, Google may use prompts and responses to improve its products. We only
// ever send redacted text, and /api/extract refuses text that still contains personal details.
import { FinishReason, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { requireEnv } from './env';
import { ExtractError, SYSTEM_PROMPT, WIRE, userMessage, type CallModel } from './extract-prompt';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

let client: GoogleGenAI | null = null;

/** JSON Schema for Gemini's responseJsonSchema (it doesn't accept the $schema keyword). */
function jsonSchema(schema: z.ZodType): object {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _ignored;
  return rest;
}
const SCHEMAS = { bill: jsonSchema(WIRE.bill), eob: jsonSchema(WIRE.eob) };

export const callGemini: CallModel = async (docType, redactedText) => {
  client ??= new GoogleGenAI({
    apiKey: requireEnv('GEMINI_API_KEY'),
    // Retry transient server errors ("model overloaded" 503 etc.) with backoff; without retryOptions the SDK
    // makes a single attempt. 429 is NOT retried: free-tier quota windows are ~1 minute or a whole day, and
    // every retry would spend more quota.
    httpOptions: {
      timeout: 40_000,
      retryOptions: { attempts: 3, initialDelay: 1, maxDelay: 6, httpStatusCodes: [408, 500, 502, 503, 504] },
    },
  });
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: userMessage(docType, redactedText),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseJsonSchema: SCHEMAS[docType],
      temperature: 0,
    },
  });
  const finish = response.candidates?.[0]?.finishReason;
  if (finish === FinishReason.SAFETY || response.promptFeedback?.blockReason) {
    throw new ExtractError('The AI service declined to read this document.', false);
  }
  if (finish === FinishReason.MAX_TOKENS || !response.text) return null;
  try {
    return JSON.parse(response.text);
  } catch {
    return null;
  }
};
