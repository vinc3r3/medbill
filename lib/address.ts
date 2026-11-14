// US mailing addresses: split a one-line address into parts, and find the provider's address in raw
// bill text. findProviderAddress runs in the browser on raw OCR text, which never leaves the device.
import { findStreetAddresses } from './redact';

export type UsAddress = { addressLine1: string; addressLine2?: string; city: string; state: string; zip: string };

const UNIT_RE = /^(?:apt|apartment|suite|ste|unit|#|fl|floor|rm|room)\b\.?\s*[\w-]*$|^#\s*[\w-]+$/i;

/** "88 Harbor View Dr, Suite 200, Fairhaven, OH 45098" → parts. Accepts commas or line breaks. */
export function parseUsAddress(input: string): UsAddress | null {
  const flat = input.replace(/\s*\n\s*/g, ', ').replace(/\s+/g, ' ').trim();
  const m = flat.match(/^(.+?),\s*([A-Za-z][A-Za-z .'-]*?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!m) return null;
  const [, street, city, state, zip] = m;
  const parts = street.split(/\s*,\s*/).filter(Boolean);
  const unitIdx = parts.findIndex((p, i) => i > 0 && UNIT_RE.test(p));
  const addressLine1 = (unitIdx > 0 ? parts.slice(0, unitIdx) : parts).join(', ');
  const addressLine2 = unitIdx > 0 ? parts.slice(unitIdx).join(', ') : undefined;
  if (!/\d/.test(addressLine1)) return null;
  return { addressLine1, ...(addressLine2 ? { addressLine2 } : {}), city: city.trim(), state: state.toUpperCase(), zip };
}

export function formatAddress(a: UsAddress): string {
  return [a.addressLine1, a.addressLine2, a.city, `${a.state} ${a.zip}`].filter(Boolean).join(', ');
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** First complete street address in the text that isn't one of `exclude` (e.g. the patient's address). */
export function findProviderAddress(rawText: string, exclude: string[]): UsAddress | null {
  const skip = exclude.filter(Boolean).map(squash);
  for (const candidate of findStreetAddresses(rawText)) {
    if (skip.some((s) => squash(candidate).includes(s) || s.includes(squash(candidate)))) continue;
    const parsed = parseUsAddress(candidate);
    if (parsed) return parsed;
  }
  return null;
}
