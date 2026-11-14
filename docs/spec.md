# Spec — MedBill Checker MVP

## Data shapes (`lib/types.ts`)

```ts
export type BillLine = { date: string; code: string | null; description: string; billed: number };
export type BillDoc = { provider: string; serviceDate: string; lines: BillLine[]; amountDue: number };

export type EobLine = {
  date: string; code: string | null; description: string;
  billed: number; allowed: number; planPaid: number; patientResponsibility: number;
};
export type EobDoc = { insurer: string; claimId: string; lines: EobLine[]; totalPatientResponsibility: number };

export type FlagKind = 'duplicate' | 'over_patient_responsibility' | 'not_on_eob' | 'eob_says_zero';
export type Flag = {
  kind: FlagKind;
  billLineIdx: number | null;
  eobLineIdx: number | null;
  expected: number;     // what the patient should owe for this item
  billed: number;       // what the bill asks for
  difference: number;   // billed - expected
  explanation: string;  // plain language, phrased as a question to verify
};

export type CaseStatus = 'uploaded' | 'checked' | 'letter_ready' | 'sent' | 'delivered' | 'resolved';
export type Case = {
  id: string; status: CaseStatus; bill: BillDoc; eob: EobDoc; flags: Flag[];
  letter: string | null; lobLetterId: string | null; savedAmount: number; createdAt: string;
};
```

Dates are ISO strings (`YYYY-MM-DD`). Money is in US dollars as numbers with 2 decimals.
Compare money in integer cents (`Math.round(x * 100)`) to avoid float errors.

`BillLine.billed` is the **patient's share** for that line (what the bill asks the patient to pay), not the
provider's gross charge. Bill lines sum to `bill.amountDue`.

## Flag rules — `checkFlags(bill, eob): Flag[]` (pure function, no AI)

| Kind | Fires when | expected | billed |
| --- | --- | --- | --- |
| `duplicate` | Two bill lines share the same date, code and amount (flag the second one) | 0 | that line's amount |
| `over_patient_responsibility` | `bill.amountDue` exceeds `eob.totalPatientResponsibility` by more than $1, **and** the excess is not already explained by line-level flags (see below) | EOB total patient responsibility | `bill.amountDue` |
| `not_on_eob` | A bill line has no EOB line with the same date and code | 0 | that line's amount |
| `eob_says_zero` | The matched EOB line has `patientResponsibility === 0` but the bill charges for it | 0 | that line's amount |

Matching: bill line ↔ EOB line by same `date` and same `code`. If `code` is null on either side, match by
date plus case-insensitive description similarity (simple token overlap ≥ 0.5 is enough for the MVP).
Matching is many-to-one: several bill lines may match the same EOB line (repeats are caught by `duplicate`).

**At most one line-level flag per bill line**, by precedence: `duplicate` > `not_on_eob` > `eob_says_zero`.

**Case-level vs line-level:** compute line-level flags first. Let `excess = amountDue − totalPatientResponsibility`
and `lineSum` = sum of line-level differences. Fire `over_patient_responsibility` only if `excess > $1` and
`excess − lineSum > $1` (the gap isn't explained by line flags). When it fires, return it **together with**
any line-level flags.

`savedAmount` for a case = the `over_patient_responsibility` difference if present, otherwise the sum of
line-level differences. Never double count.

## Redaction (browser)

Profile stored in `localStorage`: `{ name, dateOfBirth, memberId, address }`.
Replace, case-insensitively, before any network call:
- each profile value → `[NAME]`, `[DOB]`, `[MEMBER_ID]`, `[ADDRESS]`
- patterns: dates next to "DOB" / "Date of birth" → `[DOB]`; strings after "Member ID" / "Account" /
  "Acct" → `[MEMBER_ID]` / `[ACCOUNT]`; US street addresses → `[ADDRESS]`
- `[ACCOUNT]` comes from the pattern only. There is no account field in the profile.

## API routes

| Route | Input | Output |
| --- | --- | --- |
| `POST /api/extract` | `{ redactedText: string, docType: 'bill' \| 'eob' }` | `BillDoc` or `EobDoc` |
| `POST /api/cases` | `{ bill: BillDoc, eob: EobDoc }` | `Case` (status `uploaded`) |
| `POST /api/check` | `{ caseId }` | `Flag[]` (status → `checked`) |
| `POST /api/letter` | `{ caseId }` | `{ letter: string }` with placeholders (status → `letter_ready`) |
| `POST /api/send` | `{ caseId, letterHtml, to, from }` | `{ lobLetterId, previewUrl }` (status → `sent`) |
| `POST /api/lob-webhook` | Lob tracking event | updates `status` |
| `POST /api/cases/:id/simulate-delivery` | none | status → `delivered` (demo only) |
| `GET /api/cases` | none | `Case[]` |

`/api/letter` and `/api/extract` must never receive profile values.

## Letter

Plain, factual, polite. Includes: provider name, service date, claim ID, each flagged line with date,
description and amounts, the EOB figure, the requested correction, and a request for an itemized bill.
Placeholders: `{{PATIENT_NAME}}`, `{{MEMBER_ID}}`, `{{ADDRESS}}`. No legal claims.

## Lob

Create a letter with `extra_services: 'certified'` using the test key. Store the returned id and preview
URL on the case. Reminder date = sent date + 30 days.

## Sample cases (`/samples`)

| Case | Files | Expected flags | savedAmount |
| --- | --- | --- | --- |
| A, clean | `a-bill`, `a-eob` | none | 0 |
| B, duplicate | `b-bill`, `b-eob` | 1 × `duplicate` (same lab test twice) | price of the duplicate line |
| C, overbilled | `c-bill`, `c-eob` | `over_patient_responsibility`, billed $412, expected $45 | 367 |

Data constraints so the expected flags hold:
- **A:** every bill line matches an EOB line with the same patient share; `amountDue` = EOB total.
- **B:** the lab test appears twice on the bill and once on the EOB. Every other line matches the EOB, and
  `amountDue` = EOB total + the duplicate's amount. That excess is covered by the duplicate flag, so
  `over_patient_responsibility` does not fire.
- **C:** every bill line matches an EOB line with `patientResponsibility > 0` (so no line flags fire), but
  the bill's line amounts are higher than the EOB's. `amountDue` = 412, EOB total = 45.

Each case folder has `expected.json`: `{ bill: BillDoc, eob: EobDoc, flags: Flag[], savedAmount: number }`.
