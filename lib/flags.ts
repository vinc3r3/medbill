// Flag rules (docs/spec.md, "Flag rules"). Pure: no I/O, no AI. All money is compared in cents.
import { formatUsd, formatUsDate as usDate } from './format';
import type { BillDoc, BillLine, EobDoc, EobLine, Flag } from './types';

const cents = (n: number) => Math.round(n * 100);
const dollars = (c: number) => c / 100;
const usd = (c: number) => formatUsd(c / 100);

const tokens = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);

/** Shared words ÷ words in the shorter description (0..1). Case-insensitive, punctuation ignored. */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const MATCH_THRESHOLD = 0.5;

/** Index of the EOB line matching a bill line, or null. Many bill lines may match one EOB line. */
function matchEobLine(line: BillLine, eobLines: EobLine[]): number | null {
  let best: { idx: number; score: number } | null = null;
  for (const [idx, e] of eobLines.entries()) {
    if (e.date !== line.date) continue;
    if (line.code !== null && e.code !== null) {
      if (line.code === e.code) return idx; // exact code match wins
      continue;
    }
    const score = descriptionSimilarity(line.description, e.description);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) best = { idx, score };
  }
  return best?.idx ?? null;
}

/** Key for "same date, code and amount". Lines without a code must also share a description. */
function duplicateKey(line: BillLine): string {
  const what = line.code ?? `desc:${[...tokens(line.description)].join(' ')}`;
  return `${line.date}|${what}|${cents(line.billed)}`;
}

function lineFlag(kind: Flag['kind'], billLineIdx: number, eobLineIdx: number | null, line: BillLine): Flag {
  const billed = cents(line.billed);
  const what = `"${line.description}" on ${usDate(line.date)}`;
  const explanation = {
    duplicate: `${what} appears more than once on the bill, at ${usd(billed)} each. Was this service provided more than once, or is this line a duplicate?`,
    not_on_eob: `${what} (${usd(billed)}) isn't on your insurer's EOB. Was this service sent to your insurance, and should you owe for it?`,
    eob_says_zero: `Your EOB says you owe ${usd(0)} for ${what}, but the bill asks for ${usd(billed)}. Could the provider check this line against the insurer's decision?`,
    over_patient_responsibility: '',
  }[kind];
  return { kind, billLineIdx, eobLineIdx, expected: 0, billed: dollars(billed), difference: dollars(billed), explanation };
}

export function checkFlags(bill: BillDoc, eob: EobDoc): Flag[] {
  // 1. Line-level flags: at most one per bill line, by precedence duplicate > not_on_eob > eob_says_zero.
  const seen = new Set<string>();
  const lineFlags: Flag[] = [];
  for (const [idx, line] of bill.lines.entries()) {
    if (cents(line.billed) <= 0) continue; // payments, credits and $0 lines are never questioned
    const key = duplicateKey(line);
    const isRepeat = seen.has(key);
    seen.add(key);
    const eobIdx = matchEobLine(line, eob.lines);
    const eobLine = eobIdx === null ? null : eob.lines[eobIdx];

    if (isRepeat) lineFlags.push(lineFlag('duplicate', idx, eobIdx, line));
    else if (eobLine === null) lineFlags.push(lineFlag('not_on_eob', idx, null, line));
    else if (cents(eobLine.patientResponsibility) === 0) lineFlags.push(lineFlag('eob_says_zero', idx, eobIdx, line));
  }

  // 2. Case-level flag: only when more than $1 of the excess isn't already explained by line flags.
  const due = cents(bill.amountDue);
  const owed = cents(eob.totalPatientResponsibility);
  const excess = due - owed;
  const explained = lineFlags.reduce((sum, f) => sum + cents(f.difference), 0);
  if (excess > 100 && excess - explained > 100) {
    const caseFlag: Flag = {
      kind: 'over_patient_responsibility',
      billLineIdx: null,
      eobLineIdx: null,
      expected: dollars(owed),
      billed: dollars(due),
      difference: dollars(excess),
      explanation: `The bill asks for ${usd(due)}, but your EOB says your share is ${usd(owed)}. Could the provider check whether the insurance payment and adjustments were applied?`,
    };
    return [caseFlag, ...lineFlags];
  }
  return lineFlags;
}

/** The case-level difference if present, otherwise the sum of line-level differences. Never double counts. */
export function savedAmount(flags: Flag[]): number {
  const caseFlag = flags.find((f) => f.kind === 'over_patient_responsibility');
  if (caseFlag) return caseFlag.difference;
  return dollars(flags.reduce((sum, f) => sum + cents(f.difference), 0));
}
