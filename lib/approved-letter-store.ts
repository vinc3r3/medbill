// Browser-only: the approved letter (with personal details filled in) and the confirmed addresses, kept in
// sessionStorage across the Stripe Checkout redirect. Never sent to our server; cleared after sending.
import type { UsAddress } from './address';

export type Contact = UsAddress & { name: string };
export type ApprovedLetter = { draft: string; original: string; filled: string; to?: Contact; from?: Contact };

const key = (caseId: string) => `medbill.approvedLetter.${caseId}`;

export function saveApprovedLetter(caseId: string, letter: ApprovedLetter): void {
  try {
    window.sessionStorage.setItem(key(caseId), JSON.stringify(letter));
  } catch {
    // storage blocked: after paying, the user approves the letter again
  }
}

export function loadApprovedLetter(caseId: string): ApprovedLetter | null {
  try {
    const raw = window.sessionStorage.getItem(key(caseId));
    const v = raw ? (JSON.parse(raw) as ApprovedLetter) : null;
    return v && typeof v.filled === 'string' && typeof v.draft === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function clearApprovedLetter(caseId: string): void {
  try {
    window.sessionStorage.removeItem(key(caseId));
  } catch {
    // nothing stored
  }
}
