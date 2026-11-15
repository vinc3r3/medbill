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

export type ReplyOutcome = 'corrected' | 'denied' | 'more_info';
export type Reply = { outcome: ReplyOutcome; receivedAt: string; bill: BillDoc | null };

export type CaseStatus = 'uploaded' | 'checked' | 'letter_ready' | 'sent' | 'delivered' | 'resolved';
export type Case = {
  id: string; status: CaseStatus; bill: BillDoc; eob: EobDoc; flags: Flag[];
  letter: string | null; mailLetterId: string | null; previewUrl: string | null; sentAt: string | null;
  savedAmount: number; createdAt: string; replies: Reply[];
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

Details (decided in Task 7):
- Bill lines of $0 or less (payments, credits) never get a flag.
- Two lines without a code count as duplicates only if their descriptions also match.
- Description similarity = shared words ÷ words in the shorter description (so "CBC" matches
  "Complete blood count (CBC)"). A line with both codes present matches on code only.
- The case-level flag, when present, is listed first.

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
| `POST /api/send` | `{ caseId, letterText, to, from }` | `{ mailLetterId, previewUrl }` (status → `sent`) |
| `POST /api/mail-webhook` | PostGrid `letter.updated` event | updates `status` |
| `POST /api/cases/:id/reply` | `{ outcome, bill?: BillDoc }` | `Case` (corrected → `resolved`) |
| `POST /api/cases/:id/simulate-delivery` | none | status → `delivered` (demo only) |
| `GET /api/cases` | none | `Case[]` |
| `GET /api/cases/:id/preview` | none | redirect to a fresh PDF preview link (provider links expire) |

`/api/letter` and `/api/extract` must never receive profile values. `/api/letter` uses no AI (template).

## Letter

Plain, factual, polite. Includes: provider name, service date, claim ID, each flagged line with date,
description and amounts, the EOB figure, the requested correction, and a request for an itemized bill.
Placeholders: `{{PATIENT_NAME}}`, `{{MEMBER_ID}}`, `{{ADDRESS}}`. No legal claims.

Generated from a fixed template (`lib/letter.ts`), not by AI (decided before Task 9): predictable wording,
no invented claims, no AI cost. Includes the corrected total (`amountDue − savedAmount`). Edits in the browser
are not saved to the server; placeholders are filled in the browser at approval.

## Mail (PostGrid)

Mail provider is PostGrid Print & Mail (switched from Lob before Task 10; code sits behind `lib/mail`).
Create a letter with `mailingClass: 'certified'` and `addressPlacement: 'insert_blank_page'` (addresses on
their own cover page, so content never overlaps the envelope window) using the TEST key only (`test_…`;
the code refuses any other key). Send an `Idempotency-Key` derived from the case + content so retries never
create a second letter. PostGrid may cancel a letter a few seconds after creating it (content checks), so
`/api/send` waits for the preview and only then marks the case `sent`.

Store the letter id (`mailLetterId`), preview URL and `sentAt` on the case. Preview links expire, so
`GET /api/cases/:id/preview` fetches a fresh one. Reminder date = `sentAt` + 30 days.

The provider's mailing address is found in the raw OCR text in the browser (redaction removes street
addresses before anything is sent) and confirmed by the user; the patient's address comes from the profile.

PostGrid letter statuses: `ready` → `printing` → `processed_for_delivery` → `completed` (or `cancelled`).

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

## Extraction cache (Task 11)

`extractions(hash text primary key, doc_type, result jsonb, provider, model, created_at)`. `hash` =
SHA-256 of `docType + "\n" + redactedText` (redacted text holds no personal details). Only validated results
are stored. `/api/extract` checks the cache first; on a hit no AI call is made.

## Authentication (Task 12)

Supabase Auth, email + password. `cases.user_id uuid not null references auth.users`. Server routes read the
user from the session cookie and only see that user's cases (unknown or other users' cases → 404).
Public routes: `/`, sign-in/up pages, `/api/mail-webhook`, `/api/stripe-webhook`.

## Payments (decided in Task 16, built in Task 17)

Stripe test mode. Model not decided yet (Task 16): candidates are a subscription (e.g. $12/month incl. 1 letter),
an annual plan, pay per letter, a success fee, or a mix. Working assumption until then: subscription. Checkout to
subscribe, Customer Portal to manage/cancel, `/api/stripe-webhook` keeps the plan in sync. `/api/send`
requires an active plan with a letter left this month.

Running costs to keep in mind for live use: Supabase Pro ~$25/mo, Vercel Pro ~$20/mo (Hobby forbids
commercial use), PostGrid ~$5–10 per certified letter, Stripe ~2.9% + 30¢ per charge.

## Replies (Task 15)

No API can read the user's own mailbox, so replies are logged on the case page: the user uploads the
provider's response (same on-device OCR → redaction → extraction path as a bill) and picks an outcome:
`corrected` | `denied` | `more_info`. A corrected statement is compared with the EOB; the case becomes
`resolved` and `savedAmount` becomes the actual saving (`original amountDue − new amountDue`, never more than
the amount questioned). Each letter carries a case reference (`Ref: MB-` + first 4 hex of the case id,
uppercased) so any reply can be matched. Automatic options (reply-by-email address, virtual mailbox) are stretch.

Details (decided in Task 15; rules in `lib/replies.ts`, migration 0005 adds `cases.replies jsonb`):
- Replies are accepted only while the case is `sent` or `delivered` (a reply may beat the tracking event).
  Every reply is appended to `replies`, so a `more_info` followed by `corrected` keeps both.
- Only `corrected` needs an upload: the photo is read as a `bill` (same OCR → redaction → `/api/extract`)
  and stored as `reply.bill`. `denied` and `more_info` record the outcome only and keep the case open
  (status and `savedAmount` unchanged) with a suggested next step.
- `corrected` resolves the case with `savedAmount` = `original amountDue − new amountDue`, clamped to
  `0…amount questioned` (in cents). A "corrected" statement that isn't lower than the original is refused
  (choose "denied"). The amount questioned is recomputed from the flags, so it survives `savedAmount` changing.
- The corrected statement is compared with the EOB with `checkFlags`; the case page says whether it now matches.
- Reminder (30 days after sending): suggests a follow-up letter quoting the reference. The follow-up letter
  itself isn't generated in the MVP.
- Sample: `samples/c/c-corrected.png` + `corrected.json` (each line at the EOB patient share, $45 due).

