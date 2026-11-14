// Redaction rules from docs/spec.md ("Redaction (browser)"). Written before lib/redact.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Profile } from './profile';
import { redact } from './redact';

const SAMPLES = join(__dirname, '..', 'samples');
const profile: Profile = JSON.parse(readFileSync(join(SAMPLES, 'profile.json'), 'utf8'));
const ocr = (key: string, doc: string) => readFileSync(join(SAMPLES, key, `${key}-${doc}.ocr.txt`), 'utf8');
const expected = (key: string) => JSON.parse(readFileSync(join(SAMPLES, key, 'expected.json'), 'utf8'));

const squash = (s: string) => s.toLowerCase().replace(/[\s.,]+/g, ' ');
/** Fails if `needle` survives in `text`, ignoring case, spacing and . , punctuation. */
function expectGone(text: string, needle: string) {
  expect(squash(text), `"${needle}" should be redacted`).not.toContain(squash(needle));
}

const ACCOUNTS = { a: '004417-2291', b: 'RB-88120456', c: 'SUC-3307718' } as const;

describe.each(['a', 'b', 'c'] as const)('sample %s (real OCR text)', (key) => {
  const bill = redact(ocr(key, 'bill'), profile);
  const eob = redact(ocr(key, 'eob'), profile);
  const exp = expected(key);

  it('removes every profile value from both documents', () => {
    for (const text of [bill, eob]) {
      for (const value of Object.values(profile)) expectGone(text, value);
      // name parts and the street line on their own
      for (const part of ['Jordan', 'Rivera', '1427 Maple Grove', '45099']) expectGone(text, part);
      // DOB in other formats
      for (const dob of ['1984-03-17', '3/17/1984', '03-17-1984']) expectGone(text, dob);
    }
  });

  it('removes the account number and uses the spec tokens', () => {
    expectGone(bill, ACCOUNTS[key]);
    for (const token of ['[NAME]', '[DOB]', '[MEMBER_ID]', '[ADDRESS]', '[ACCOUNT]']) expect(bill).toContain(token);
    for (const token of ['[NAME]', '[MEMBER_ID]', '[ADDRESS]']) expect(eob).toContain(token);
  });

  it('keeps what extraction needs: claim ID, provider, codes, descriptions, service dates, amounts', () => {
    expect(eob).toContain(exp.eob.claimId);
    expect(bill).toContain(exp.bill.provider);
    for (const line of exp.bill.lines) {
      const [y, m, d] = line.date.split('-');
      expect(bill).toContain(`${m}/${d}/${y}`);
      expect(bill).toContain(line.code);
      expect(bill).toContain(line.description);
      expect(bill).toContain(`$${line.billed.toFixed(2)}`);
    }
    expect(bill).toContain(`$${exp.bill.amountDue.toFixed(2)}`);
    expect(eob).toContain(`$${exp.eob.totalPatientResponsibility.toFixed(2)}`);
  });
});

describe('profile values', () => {
  const p: Profile = { name: 'Jordan A. Rivera', dateOfBirth: '1984-03-17', memberId: 'XKH448210937', address: '1427 Maple Grove Ln, Fairhaven, OH 45099' };

  it('match case-insensitively and across spacing/line breaks', () => {
    const out = redact('Dear JORDAN A.  RIVERA,\nmember xkh448210937 at 1427 maple grove ln,\nfairhaven, oh 45099', p);
    expect(out).toBe('Dear [NAME],\nmember [MEMBER_ID] at [ADDRESS]');
  });

  it('match the name without the middle-initial period or in "Last, First" order', () => {
    expect(redact('Patient: Jordan A Rivera', p)).toBe('Patient: [NAME]');
    expect(redact('RIVERA, JORDAN A', p)).not.toMatch(/rivera|jordan/i);
  });

  it('match the date of birth in any common format', () => {
    for (const s of ['1984-03-17', '03/17/1984', '3/17/1984', '03-17-1984', 'March 17, 1984', 'Mar 17 1984']) {
      expect(redact(`born ${s}.`, p)).toBe('born [DOB].');
    }
  });

  it('accept the profile DOB in MM/DD/YYYY too', () => {
    expect(redact('1984-03-17', { ...p, dateOfBirth: '03/17/1984' })).toBe('[DOB]');
  });

  it('skip empty values and escape regex characters', () => {
    expect(redact('Total $40.00', { name: '', dateOfBirth: '', memberId: '', address: '' })).toBe('Total $40.00');
    expect(redact('Hi Sam (Jr.) O+Brien', { ...p, name: 'Sam (Jr.) O+Brien' })).toBe('Hi [NAME]');
  });
});

describe('patterns (no profile needed)', () => {
  const none: Profile = { name: '', dateOfBirth: '', memberId: '', address: '' };

  it('redacts dates next to DOB / Date of birth, but not other dates', () => {
    expect(redact('DOB: 01/02/1990', none)).toBe('DOB: [DOB]');
    expect(redact('Date of birth 1990-01-02', none)).toBe('Date of birth [DOB]');
    expect(redact('Service date: 01/02/2026', none)).toBe('Service date: 01/02/2026');
  });

  it('redacts IDs after Member ID / Account / Acct', () => {
    expect(redact('Member ID: ABC123456', none)).toBe('Member ID: [MEMBER_ID]');
    expect(redact('Account #: 004417-2291', none)).toBe('Account #: [ACCOUNT]');
    expect(redact('Acct No. RB-88120456', none)).toBe('Acct No. [ACCOUNT]');
  });

  it('does not treat ordinary words after "Account" as an ID', () => {
    expect(redact('Account balance is $40.00', none)).toBe('Account balance is $40.00');
  });

  it('does not touch claim IDs', () => {
    expect(redact('Claim ID: CLM-260512-4402', none)).toBe('Claim ID: CLM-260512-4402');
  });

  it('redacts US street addresses, including suite and city/state/ZIP, on one or two lines', () => {
    expect(redact('88 Harbor View Dr, Suite 200, Fairhaven, OH 45098 Statement', none)).toBe('[ADDRESS] Statement');
    expect(redact('Send to 12 Oak St\nSpringfield, IL 62704-1234\nThanks', none)).toBe('Send to [ADDRESS]\nThanks');
    expect(redact('PO Box 4410, Dayton, OH 45401', none)).toBe('[ADDRESS]');
  });

  it('leaves service lines alone', () => {
    const line = '05/12/2026 36415 Routine venipuncture (blood draw) $25.00';
    expect(redact(line, none)).toBe(line);
    const line2 = '07/21/2026 73610 X-ray, ankle, 3 views $127.00';
    expect(redact(line2, none)).toBe(line2);
  });
});
