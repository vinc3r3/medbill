// Claude provider for extraction (EXTRACT_PROVIDER=claude). Server only.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ExtractError, SYSTEM_PROMPT, WIRE, userMessage, type CallModel } from './extract-prompt';

export const CLAUDE_MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;

export const callClaude: CallModel = async (docType, redactedText) => {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  const response = await client.beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    // On a safety decline, the API re-runs the request on a fallback model inside the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(WIRE[docType]) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage(docType, redactedText) }],
  });
  if (response.stop_reason === 'refusal') throw new ExtractError('The AI service declined to read this document.', false);
  if (response.stop_reason === 'max_tokens') return null;
  return response.parsed_output ?? null;
};
