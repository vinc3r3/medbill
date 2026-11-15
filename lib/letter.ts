// Dispute letter from a fixed template (docs/spec.md, "Letter"). Pure: no AI, no I/O.
// Drafted with placeholders; the browser fills them from the profile at approval time.
import { formatUsd, formatUsDate } from './format';
import type { Profile } from './profile';
import { caseRef } from './replies';
import type { Case, Flag } from './types';

export const PLACEHOLDERS = ['{{PATIENT_NAME}}', '{{MEMBER_ID}}', '{{ADDRESS}}'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 2026-11-14 → November 14, 2026 (no time zones involved). */
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const cents = (n: number) => Math.round(n * 100);

/** One numbered paragraph per flag: what the bill says, what the EOB says, what to correct. */
function flagParagraph(c: Case, flag: Flag): string {
  const line = flag.billLineIdx !== null ? c.bill.lines[flag.billLineIdx] : null;
  const eobLine = flag.eobLineIdx !== null ? c.eob.lines[flag.eobLineIdx] : null;
  const service = line ? `"${line.description}"${line.code ? ` (code ${line.code})` : ''} on ${formatUsDate(line.date)}` : '';

  switch (flag.kind) {
    case 'over_patient_responsibility':
      return (
        `The statement shows an amount due of ${formatUsd(flag.billed)}. My EOB shows my total responsibility for this claim as ` +
        `${formatUsd(flag.expected)}, a difference of ${formatUsd(flag.difference)}. Please check whether the insurance payment ` +
        `and contractual adjustments have been applied to my account.`
      );
    case 'duplicate':
      return (
        `${service} appears more than once on the statement, at ${formatUsd(flag.billed)} each. My EOB lists it once` +
        `${eobLine ? `, with my responsibility as ${formatUsd(eobLine.patientResponsibility)}` : ''}. ` +
        `If this service was provided only once, please remove the duplicate charge of ${formatUsd(flag.difference)}.`
      );
    case 'not_on_eob':
      return (
        `${service}, billed at ${formatUsd(flag.billed)}, does not appear on my EOB. Please confirm whether this service was ` +
        `submitted to ${c.eob.insurer}, and please hold this charge until the claim has been processed.`
      );
    case 'eob_says_zero':
      return (
        `${service} is billed at ${formatUsd(flag.billed)}. My EOB shows my responsibility for this service as ` +
        `${formatUsd(0)}. Please adjust this charge to ${formatUsd(0)}.`
      );
  }
}

export function draftLetter(c: Case, todayIso: string): string {
  if (c.flags.length === 0) throw new Error('There is nothing to question on this bill, so no letter is needed.');

  const serviceDate = formatUsDate(c.bill.serviceDate);
  const correctedCents = cents(c.bill.amountDue) - cents(c.savedAmount);
  const lines = c.bill.lines.map((l) => `- ${formatUsDate(l.date)}  ${l.description}${l.code ? ` (code ${l.code})` : ''}: ${formatUsd(l.billed)}`);

  return [
    '{{PATIENT_NAME}}',
    '{{ADDRESS}}',
    '',
    longDate(todayIso),
    '',
    `${c.bill.provider}`,
    'Attn: Billing Department',
    '',
    `Re: Statement for services on ${serviceDate}`,
    'Patient: {{PATIENT_NAME}}',
    `Insurance: ${c.eob.insurer}, member ID {{MEMBER_ID}}`,
    `Insurance claim ID: ${c.eob.claimId}`,
    `Ref: ${caseRef(c.id)} (please quote this reference in your reply)`,
    '',
    'Dear Billing Department,',
    '',
    `I am writing about the statement I received for services on ${serviceDate}. I compared it with the Explanation ` +
      `of Benefits (EOB) from ${c.eob.insurer} for claim ${c.eob.claimId}, and ` +
      (c.flags.length === 1 ? 'one item does not seem to match. Could you please review it?' : 'some items do not seem to match. Could you please review them?'),
    '',
    ...c.flags.flatMap((flag, i) => [`${i + 1}. ${flagParagraph(c, flag)}`, '']),
    'For reference, the statement lists these services:',
    ...lines,
    '',
    'What I am asking for:',
    `- Please review the items above and send me a corrected statement. Based on my EOB, I believe the amount I owe ` +
      `should be ${formatUsd(correctedCents / 100)} rather than ${formatUsd(c.bill.amountDue)}.`,
    '- Please send me an itemized bill showing each charge, the insurance payment and any adjustments.',
    '- Please do not send this balance to collections while it is being reviewed.',
    '',
    'Thank you for your help. You can reach me at the address above.',
    '',
    'Sincerely,',
    '',
    '{{PATIENT_NAME}}',
    '',
  ].join('\n');
}

const PROFILE_FOR: Record<Placeholder, keyof Profile> = {
  '{{PATIENT_NAME}}': 'name',
  '{{MEMBER_ID}}': 'memberId',
  '{{ADDRESS}}': 'address',
};

/** Fills placeholders from the profile (browser only). Unfilled ones stay visible and are reported. */
export function fillPlaceholders(letter: string, profile: Profile): { text: string; missing: Placeholder[] } {
  let text = letter;
  const missing: Placeholder[] = [];
  for (const placeholder of PLACEHOLDERS) {
    if (!text.includes(placeholder)) continue;
    const value = profile[PROFILE_FOR[placeholder]].trim();
    if (value) text = text.split(placeholder).join(value);
    else missing.push(placeholder);
  }
  return { text, missing };
}
