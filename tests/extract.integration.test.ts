// Task 6 check: AI extraction from redacted OCR text matches expected.json for all three cases.
// Run with `npm run test:ai`. Uses EXTRACT_PROVIDER (default gemini; needs its API key in .env.local). Makes 6+ real calls.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { describe, expect, it } from 'vitest';

// @next/env skips .env.local when NODE_ENV=test (which Vitest sets), so load it as development.
const nodeEnv = process.env.NODE_ENV;
(process.env as Record<string, string | undefined>).NODE_ENV = 'development';
loadEnvConfig(process.cwd(), true);
(process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;

const { extractDoc } = await import('@/lib/extract');
const { redact } = await import('@/lib/redact');

const SAMPLES = join(process.cwd(), 'samples');
const profile = JSON.parse(readFileSync(join(SAMPLES, 'profile.json'), 'utf8'));
const redactedOcr = (key: string, doc: string) => redact(readFileSync(join(SAMPLES, key, `${key}-${doc}.ocr.txt`), 'utf8'), profile);

describe.concurrent.each(['a', 'b', 'c'])('case %s', (key) => {
  const expected = JSON.parse(readFileSync(join(SAMPLES, key, 'expected.json'), 'utf8'));

  it('bill: totals and lines match', { timeout: 120_000 }, async () => {
    const bill = await extractDoc('bill', redactedOcr(key, 'bill'));
    console.log(`case ${key} bill: amountDue ${bill.amountDue} (expected ${expected.bill.amountDue}), ${bill.lines.length} lines`);
    expect(bill.amountDue).toBe(expected.bill.amountDue);
    expect(bill.serviceDate).toBe(expected.bill.serviceDate);
    expect(bill.lines.map(({ date, code, billed }) => ({ date, code, billed }))).toEqual(
      expected.bill.lines.map(({ date, code, billed }: { date: string; code: string; billed: number }) => ({ date, code, billed })),
    );
  });

  it('eob: totals and lines match', { timeout: 120_000 }, async () => {
    const eob = await extractDoc('eob', redactedOcr(key, 'eob'));
    console.log(`case ${key} eob: total ${eob.totalPatientResponsibility} (expected ${expected.eob.totalPatientResponsibility}), ${eob.lines.length} lines`);
    expect(eob.totalPatientResponsibility).toBe(expected.eob.totalPatientResponsibility);
    expect(eob.claimId).toBe(expected.eob.claimId);
    type Line = { date: string; code: string | null; billed: number; allowed: number; planPaid: number; patientResponsibility: number };
    const comparable = ({ date, code, billed, allowed, planPaid, patientResponsibility }: Line) => ({ date, code, billed, allowed, planPaid, patientResponsibility });
    expect(eob.lines.map(comparable)).toEqual(expected.eob.lines.map(comparable));
    // No redaction placeholder may leak into the structured data.
    expect(JSON.stringify(eob)).not.toMatch(/\[(NAME|DOB|MEMBER_ID|ADDRESS|ACCOUNT)\]/);
  });
});
