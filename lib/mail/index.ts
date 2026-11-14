// The mail provider in use. PostGrid today; add others behind MailProvider.
import { postgrid } from './postgrid';
import type { MailLetter, MailProvider } from './types';

export { MailError, type MailContact, type MailLetter, type MailProvider } from './types';

export const mail: MailProvider = postgrid;

/**
 * The vendor renders and checks a letter a few seconds after creating it, and may cancel it then
 * (e.g. content overlapping the address area). Wait until the preview exists and the checks have had
 * time to run, so we never report "sent" for a letter that was cancelled.
 */
export async function waitUntilAccepted(
  provider: MailProvider,
  letter: MailLetter,
  { minWaitMs = 5_000, maxWaitMs = 15_000, intervalMs = 1_500, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {},
): Promise<MailLetter> {
  let current = letter;
  let waited = 0;
  while (current.status !== 'cancelled' && waited < maxWaitMs && !(current.previewUrl && waited >= minWaitMs)) {
    await sleep(intervalMs);
    waited += intervalMs;
    current = await provider.getLetter(letter.id);
  }
  return current;
}
