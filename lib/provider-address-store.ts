// Browser-only memory of the provider's mailing address per case, found in the raw OCR text at upload.
// (Redaction removes all street addresses before anything is sent, so the server never has it.)
import type { UsAddress } from './address';

const key = (caseId: string) => `medbill.providerAddress.${caseId}`;

export function saveProviderAddress(caseId: string, address: UsAddress | null): void {
  if (!address) return;
  try {
    window.localStorage.setItem(key(caseId), JSON.stringify(address));
  } catch {
    // storage blocked: the user can type the address instead
  }
}

export function loadProviderAddress(caseId: string): UsAddress | null {
  try {
    const raw = window.localStorage.getItem(key(caseId));
    return raw ? (JSON.parse(raw) as UsAddress) : null;
  } catch {
    return null;
  }
}

/** Forgets every stored provider address (demo reset). */
export function clearProviderAddresses(): void {
  try {
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith('medbill.providerAddress.'));
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {
    // storage blocked: nothing stored either
  }
}
