// Letter template (docs/spec.md, "Letter"). Written before lib/letter.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFlags, savedAmount } from './flags';
import { PLACEHOLDERS, draftLetter, fillPlaceholders } from './letter';
import type { Profile } from './profile';
import type { Case } from './types';

const SAMPLES = join(__dirname, '..', 'samples');
const profile: Profile = JSON.parse(readFileSync(join(SAMPLES, 'profile.json'), 'utf8'));

function sampleCase(key: string): Case {
  const exp = JSON.parse(readFileSync(join(SAMPLES, key, 'expected.json'), 'utf8'));
  const flags = checkFlags(exp.bill, exp.eob);
  return {
    id: '00000000-0000-4000-8000-000000000000', status: 'checked', bill: exp.bill, eob: exp.eob, flags,
    letter: null, mailLetterId: null, previewUrl: null, sentAt: null, savedAmount: savedAmount(flags), createdAt: '2026-11-14T00:00:00Z', replies: [],
  };
}
const TODAY = '2026-11-14';

describe('draftLetter, case C (over patient responsibility)', () => {
  const letter = draftLetter(sampleCase('c'), TODAY);

  it('cites provider, service date, insurer and claim ID', () => {
    for (const s of ['Summit Urgent Care', '07/21/2026', 'Cedarline Health Plan', 'CLM-260721-0956']) expect(letter).toContain(s);
  });

  it('cites the amounts: billed, EOB figure, difference and the corrected total', () => {
    for (const s of ['$412.00', '$45.00', '$367.00']) expect(letter).toContain(s);
    expect(letter).toMatch(/should be \$45\.00/);
  });

  it('lists each service line with its date and description', () => {
    expect(letter).toContain('Office visit, new patient, moderate');
    expect(letter).toContain('X-ray, ankle, 3 views');
  });

  it('asks for an itemized bill', () => {
    expect(letter).toMatch(/itemized bill/i);
  });
});

describe('draftLetter, case B (duplicate)', () => {
  const letter = draftLetter(sampleCase('b'), TODAY);

  it('cites the duplicate line: date, description, code, amount and the EOB figure', () => {
    for (const s of ['05/12/2026', 'Comprehensive metabolic panel', '80053', '$28.75']) expect(letter).toContain(s);
    expect(letter).toMatch(/EOB lists it once/i);
  });

  it('asks for the correction and states the corrected total', () => {
    expect(letter).toMatch(/remove the duplicate charge of \$28\.75/i);
    expect(letter).toMatch(/should be \$89\.75/); // $118.50 - $28.75
  });
});

describe('every letter', () => {
  const letters = ['b', 'c'].map((k) => draftLetter(sampleCase(k), TODAY));

  it('uses all three placeholders and contains no profile values', () => {
    for (const letter of letters) {
      for (const p of PLACEHOLDERS) expect(letter).toContain(p);
      for (const v of [...Object.values(profile), 'Jordan', 'Rivera']) expect(letter.toLowerCase()).not.toContain(v.toLowerCase());
    }
  });

  it('is polite and makes no legal claims', () => {
    for (const letter of letters) {
      expect(letter).toMatch(/please/i);
      expect(letter).toMatch(/thank you/i);
      expect(letter).not.toMatch(/\b(lawsuit|sue|attorney|lawyer|legal action|violat\w*|illegal|fraud\w*|demand\w*|liable|statute)\b/i);
    }
  });

  it('carries the case reference so a reply can be matched (Ref: MB- + first 4 hex of the id)', () => {
    for (const letter of letters) expect(letter).toContain('Ref: MB-0000');
  });

  it('includes the letter date', () => {
    expect(letters[0]).toContain('November 14, 2026');
  });

  it('refuses to draft when there is nothing to question', () => {
    expect(() => draftLetter(sampleCase('a'), TODAY)).toThrow(/nothing to question/i);
  });
});

describe('fillPlaceholders', () => {
  const draft = draftLetter(sampleCase('c'), TODAY);

  it('replaces every placeholder with profile values', () => {
    const { text, missing } = fillPlaceholders(draft, profile);
    expect(missing).toEqual([]);
    expect(text).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(text).toContain(profile.name);
    expect(text).toContain(profile.memberId);
    expect(text).toContain(profile.address);
  });

  it('reports placeholders it could not fill and leaves them visible', () => {
    const { text, missing } = fillPlaceholders(draft, { ...profile, memberId: '  ' });
    expect(missing).toEqual(['{{MEMBER_ID}}']);
    expect(text).toContain('{{MEMBER_ID}}');
  });

  it('fills placeholders the user typed in by hand, too', () => {
    expect(fillPlaceholders('Hi {{PATIENT_NAME}}, {{PATIENT_NAME}}!', profile).text).toBe(`Hi ${profile.name}, ${profile.name}!`);
  });
});
