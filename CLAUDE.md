# MedBill Checker — Claude Code guide

## What we're building
A hackathon MVP that catches overcharges on everyday medical bills and sends the dispute for the user.
One working loop: upload a bill + EOB → redact personal details in the browser → AI extracts and matches
lines → user reviews flags and edits a letter → approves → letter sent via PostGrid (test mode) → status tracked
on a dashboard.

Full contract: @docs/spec.md
Task list and progress: @docs/tasks.md

## Rules (always follow)
- Use only the synthetic sample cases in `/samples`. Never use real patient documents.
- Personal details (name, date of birth, member ID, address, account numbers) never reach the AI.
  OCR and redaction run in the browser; the server only receives redacted text.
- Letters are drafted with placeholders (`{{PATIENT_NAME}}`, `{{MEMBER_ID}}`, `{{ADDRESS}}`).
  The browser fills them in at approval; only the mail provider receives the filled letter (not stored).
- Use the PostGrid TEST key only (`test_…`). No real mail is sent.
- Use Stripe TEST keys only (`sk_test_…`, `pk_test_…`). No real charges.
- Every case belongs to a user; routes check the signed-in user. Webhooks are public but signature-verified.
- Every AI call returns JSON that matches the types in `docs/spec.md`. Validate it; on invalid JSON,
  retry once, then show a readable error.
- Flags are worded as questions to verify, never as accusations or legal advice.
- Never read, print or commit `.env.local`. Use `.env.example` for variable names.

## Stack
- Next.js (App Router) + TypeScript + Tailwind, mobile-friendly
- Tesseract.js in a web worker for OCR (browser)
- AI extraction with structured JSON output (server routes only): Gemini by default (free tier,
  `gemini-3.5-flash-lite`), Claude (`claude-opus-5-5`) as an alternative. Switch with `EXTRACT_PROVIDER`.
- Supabase Postgres (`cases`, `extractions` cache) + Supabase Auth (email + password)
- Stripe (test mode) for payments (model decided in Task 16)
- PostGrid Print & Mail API for certified letters (test mode), behind `lib/mail`
- Vitest for unit tests

## Commands
- `npm run dev` — start the app
- `npm run test` — run unit tests
- `npm run lint` — lint
- `npm run build` — production build (run before saying a task is done)

## How to work
- Work on ONE task from `docs/tasks.md` at a time. Plan first, then build.
- A task is done only when its "Done when" check passes. Run the check and show the result.
- When a task passes, tick it in `docs/tasks.md` (`- [x]`) and add a one-line note under it if anything
  changed from the plan.
- Keep the flag rules a pure function with unit tests. Write tests before the code.
- Prefer small, readable files. Shared types live in `lib/types.ts` and match `docs/spec.md` exactly.
- If the spec is unclear or wrong, stop and ask instead of guessing.
