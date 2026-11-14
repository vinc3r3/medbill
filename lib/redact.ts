// Browser-side redaction (docs/spec.md, "Redaction"). Pure: no I/O, safe to unit test.
//
// Order matters:
//   1. exact profile values (most reliable), tolerant of case, spacing, line breaks and . , punctuation
//   2. label/shape patterns that work without a profile (DOB, Member ID, Account, US addresses)
//   3. individual name words, so "RIVERA, JORDAN" or a lone surname can't slip through
import type { Profile } from './profile';

export const REDACTION_TOKENS = ['[NAME]', '[DOB]', '[MEMBER_ID]', '[ADDRESS]', '[ACCOUNT]'] as const;
export type RedactionToken = (typeof REDACTION_TOKENS)[number];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Not glued to a letter/digit on either side (works even when the value starts or ends with punctuation).
const bounded = (body: string) => `(?<![A-Za-z0-9])(?:${body})(?![A-Za-z0-9])`;
const SEP = '[\\s.,]+'; // what OCR may put between the words of a value

/** Regex body for a free-text value: words in order, any spacing/punctuation between them. */
function looseValue(value: string): string | null {
  const words = value.split(/[\s.,]+/).filter(Boolean);
  return words.length ? words.map(escapeRe).join(SEP) : null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Regex body matching a date of birth in the formats US documents use. Falls back to the literal value. */
function dobValue(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const parts = iso ? { y: iso[1], m: +iso[2], d: +iso[3] } : us ? { y: us[3], m: +us[1], d: +us[2] } : null;
  if (!parts || parts.m < 1 || parts.m > 12) return looseValue(v);
  const { y, m, d } = parts;
  const month = MONTHS[m - 1];
  return [
    `0?${m}[/.-]0?${d}[/.-](?:${y}|${y.slice(2)})`, // 03/17/1984, 3-17-84
    `${y}[/.-]0?${m}[/.-]0?${d}`, // 1984-03-17
    `(?:${month}|${month.slice(0, 3)})\\.?\\s+0?${d}(?:st|nd|rd|th)?,?\\s+${y}`, // March 17, 1984 / Mar 17 1984
    `0?${d}\\s+(?:${month}|${month.slice(0, 3)})\\.?,?\\s+${y}`, // 17 March 1984
  ].join('|');
}

// ---- Patterns that need no profile --------------------------------------------------------
const DATE = String.raw`(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})`;
// An ID-looking value: starts alphanumeric, contains at least one digit (so "Account balance" is safe).
const ID = String.raw`(?=[A-Za-z0-9-]*\d)[A-Za-z0-9][A-Za-z0-9-]{3,}`;
const STREET_SUFFIX = 'St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Dr|Drive|Blvd|Boulevard|Ct|Court|Pkwy|Parkway|Way|Pl|Place|Ter|Terrace|Cir|Circle|Hwy|Highway|Trl|Trail|Sq|Square';
const UNIT = String.raw`(?:,?\s*(?:Apt|Suite|Ste|Unit|#)\.?\s*[A-Za-z0-9-]+)?`;
const CITY_STATE_ZIP = String.raw`[A-Z][A-Za-z.' -]*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?`;

const PATTERNS: Array<[RegExp, string]> = [
  [new RegExp(String.raw`\b(DOB|D\.O\.B\.?|Date\s+of\s+birth|Birth\s*date)(\s*[:#-]?\s*)${DATE}`, 'gi'), '$1$2[DOB]'],
  [new RegExp(String.raw`\b(Member\s*(?:ID|#|No\.?|Number)|Subscriber\s*(?:ID|#))(\s*[:#]?\s*)${ID}\b`, 'gi'), '$1$2[MEMBER_ID]'],
  [new RegExp(String.raw`\b(Account|Acct)(\.?\s*(?:#|No\.?|Number)?\s*[:#]?\s*)${ID}\b`, 'gi'), '$1$2[ACCOUNT]'],
  // Street address, optional unit, optional city/state/ZIP (same line or next line).
  [
    new RegExp(String.raw`\b\d{1,6}\s+(?:[A-Z0-9][A-Za-z0-9'.-]*\s+){0,4}(?:${STREET_SUFFIX})\b\.?${UNIT}(?:,?\s*${CITY_STATE_ZIP})?`, 'g'),
    '[ADDRESS]',
  ],
  [new RegExp(String.raw`\bP\.?\s*O\.?\s*Box\s+\d+(?:,?\s*${CITY_STATE_ZIP})?`, 'gi'), '[ADDRESS]'],
  // A city/state/ZIP line left on its own.
  [new RegExp(String.raw`\b${CITY_STATE_ZIP}\b`, 'g'), '[ADDRESS]'],
];

export function redact(text: string, profile: Profile): string {
  let out = text;

  // 1. Exact profile values, longest first so an address containing the name city etc. wins.
  const values: Array<[string | null, RedactionToken]> = [
    [looseValue(profile.address), '[ADDRESS]'],
    [looseValue(profile.name), '[NAME]'],
    [looseValue(profile.memberId), '[MEMBER_ID]'],
    [dobValue(profile.dateOfBirth), '[DOB]'],
  ];
  values.sort((a, b) => (b[0]?.length ?? 0) - (a[0]?.length ?? 0));
  for (const [body, token] of values) {
    if (body) out = out.replace(new RegExp(bounded(body), 'gi'), token);
  }

  // 2. Patterns.
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);

  // 3. Individual name words (2+ letters), e.g. "RIVERA, JORDAN A" or a surname on its own.
  for (const word of profile.name.split(/[\s.,]+/)) {
    if (/^[A-Za-z][A-Za-z'-]+$/.test(word)) out = out.replace(new RegExp(bounded(escapeRe(word)), 'gi'), '[NAME]');
  }

  return out;
}
