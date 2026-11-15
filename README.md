# MedBill Checker

**Catch overcharges on your medical bill, and send the dispute letter for you.**

Upload a bill and your insurer's Explanation of Benefits (EOB). MedBill compares them line by line, flags what
doesn't add up, drafts a polite dispute letter, mails it by certified mail, and tracks the outcome.

**Live demo:** https://medbill-zimran.vercel.app · test mode, synthetic data, no real mail or charges

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)
![Claude](https://img.shields.io/badge/Claude-D97757?style=for-the-badge&logo=anthropic&logoColor=white)
![Tesseract](https://img.shields.io/badge/Tesseract.js-OCR_in_browser-4B8BBE?style=for-the-badge)
![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=for-the-badge&logo=stripe&logoColor=white)
![PostGrid](https://img.shields.io/badge/PostGrid-Certified_mail-1F6FEB?style=for-the-badge)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)

## The problem

Medical bills often ask for more than the insurer says you owe: duplicate charges, services the insurer never
saw, or a balance that ignores the insurance payment. Checking means comparing two confusing documents line by
line, and disputing means writing a letter and mailing it. Most people just pay.

## What it does

| Step | What happens |
| --- | --- |
| 1. Upload | Photo of the bill + EOB (or one-click sample cases) |
| 2. Read on your device | OCR and redaction run **in the browser**; name, DOB, member ID and address never leave it |
| 3. Extract | AI turns the *redacted* text into structured JSON, validated against strict types |
| 4. Check | A pure, unit-tested rule engine (no AI) flags duplicates, items not on the EOB, items the EOB says are $0, and totals above your share |
| 5. Letter | A fixed template drafts a factual letter; you edit it, and your details are filled in on your device |
| 6. Send | Certified letter via PostGrid, paid by Stripe ($14.99, or $39/year for 4) |
| 7. Track | Delivery via webhook, log the provider's reply, see **money saved** on the dashboard |

<p>
  <img src="docs/screenshots/case-review.png" width="280" alt="Case review: bill asks $412, EOB says $45, $367 to question">
  &nbsp;&nbsp;
  <img src="docs/screenshots/dashboard.png" width="280" alt="Dashboard showing $367 saved on a resolved case">
</p>

## Try it in 2 minutes

1. Open the [live demo](https://medbill-zimran.vercel.app) and sign up (any email, no confirmation).
2. **Settings:** enter any made-up name, DOB, member ID and address.
3. **New check:** click **"C: billed too much"**, then **Read my documents** and **Check my bill**. You'll see **$367 to question**.
4. **Draft a letter → Approve → Pay $14.99 and send.** Use card `4242 4242 4242 4242`, any future date, any CVC.
5. **Simulate delivery → I got a reply → Corrected the bill.** Use the sample corrected statement.
6. The dashboard shows **$367 saved**. Use **Demo tools → Reset demo** to run it again.

## Why it's built this way

- **Privacy by design.** OCR and redaction run on-device, with Tesseract self-hosted so it makes zero external
  requests. The server and the AI only see redacted text. The letter uses placeholders that the browser fills in
  at approval, and the filled letter goes only to the mail provider. It is never stored.
- **AI where it helps, rules where it matters.** The AI only extracts data, its JSON is schema-validated and
  retried once on failure, and results are cached by SHA-256. Flags come from a deterministic rule engine with
  tests, so every number can be explained.
- **Careful wording.** Flags are phrased as questions to verify, never accusations or legal advice.
- **Payments done properly.** Access is granted only by the signature-verified, idempotent Stripe webhook, never
  by the redirect. It handles refunds, failed renewals and cancellations.
- **Every user sees only their own cases.** Supabase Auth guards every route. Other users' cases return 404,
  and webhooks are public but signature-verified.

## Business model

Checking is **free**. The paid step is the one that costs money to deliver: a certified letter, **$14.99** each
or **$39/year for 4**. That leaves a margin of about $4–9 per letter after PostGrid and Stripe fees. Bills come
a few times a year, so pay-per-use fits better than a monthly subscription.

## Tested

- **182 unit tests** (Vitest): flag rules, redaction on real OCR output, billing rules, replies, timeline.
- **Browser end-to-end checks** (Playwright) for each feature, e.g. `npm run e2e:stripe` covers payment →
  webhook → send, a declined card, a refund, a 5th plan letter blocked, a failed renewal (Stripe test clock)
  and cancellation. `npm run e2e:demo` runs the full demo 3× in a row.

## Run locally

```bash
npm install
cp .env.example .env.local   # Supabase, Gemini, PostGrid test key, Stripe test key
# run supabase/migrations/*.sql in the Supabase SQL editor
npm run stripe:setup         # creates the two test Prices
npm run dev:stripe           # dev server + Stripe webhook forwarding
```

`npm run test` · `npm run lint` · `npm run build`

## Project map

| Path | What |
| --- | --- |
| `lib/flags.ts` | Bill ↔ EOB matching and flag rules (pure, tested) |
| `lib/redact.ts` | On-device redaction |
| `lib/extract*.ts` | AI extraction (Gemini default, Claude via `EXTRACT_PROVIDER`) + cache |
| `lib/letter.ts` | Letter template |
| `lib/mail/` | PostGrid certified mail (test key only) |
| `lib/billing*.ts` | Stripe rules, webhook handling |
| `docs/spec.md` | Full contract: types, rules, API |
| `docs/tasks.md` | Build log, task by task |

---

All documents are synthetic. Test mode only: no real mail is sent and no card is charged. Not legal or medical advice.
