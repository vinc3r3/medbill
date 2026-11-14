// Mail provider interface. The app talks to this, not to a specific vendor (PostGrid today).
import type { UsAddress } from '../address';

export type MailContact = UsAddress & { name: string };

export type MailLetter = {
  id: string;
  /** Vendor status, e.g. ready | printing | processed_for_delivery | completed | cancelled */
  status: string;
  previewUrl: string | null;
  trackingNumber: string | null;
  /** Why the vendor cancelled the letter, if it did. */
  cancelledReason: string | null;
};

export type CreateLetterInput = {
  to: MailContact;
  from: MailContact;
  html: string;
  /** Same key + same content = the same letter, never a second one. */
  idempotencyKey: string;
  description: string;
};

export interface MailProvider {
  createCertifiedLetter(input: CreateLetterInput): Promise<MailLetter>;
  getLetter(id: string): Promise<MailLetter>;
  /** Test mode only: move a letter to its next status (used for "Simulate delivery"). */
  advanceTestLetter(id: string): Promise<MailLetter>;
}

/** A readable failure from the mail provider: shown to the user as-is. */
export class MailError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = 'MailError';
  }
}
