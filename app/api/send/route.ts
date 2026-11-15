// POST /api/send — { caseId, letterText, to, from } → { mailLetterId, previewUrl }  (status → "sent")
// Creates a certified letter with the mail provider (PostGrid, TEST mode only). The filled letter passes
// through here to the provider and is not stored; the case keeps only the placeholder draft.
// Needs a paid case or a plan letter left (lib/billing.ts); otherwise 402 with a readable message.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { setCasePaidVia } from '@/lib/billing-repo';
import { caseAccess } from '@/lib/billing-server';
import { getCase, updateCase } from '@/lib/cases-repo';
import { jsonError, readBody, serverError } from '@/lib/http';
import { letterToHtml } from '@/lib/letter-html';
import { MailError, mail, waitUntilAccepted } from '@/lib/mail';

// Creating the letter + waiting for the provider's content checks takes ~10s.
export const maxDuration = 60;

const Contact = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(80),
  addressLine1: z.string().trim().min(3, 'Street address is required.').max(100),
  addressLine2: z.string().trim().max(100).optional(),
  city: z.string().trim().min(1, 'City is required.').max(60),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/, 'State must be a 2-letter code like OH.').transform((s) => s.toUpperCase()),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'ZIP must be 5 digits (or ZIP+4).'),
});

const Body = z.object(
  {
    caseId: z.uuid({ error: 'caseId must be a case id.' }),
    letterText: z
      .string()
      .trim()
      .min(50, 'The letter is empty or too short.')
      .max(20_000, 'The letter is too long.')
      .refine((t) => !/\{\{[A-Z_]+\}\}/.test(t), 'The letter still has placeholders. Approve it first so your details are filled in.'),
    to: Contact,
    from: Contact,
  },
  { error: 'Send JSON like { "caseId", "letterText", "to", "from" }.' },
);

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;
  try {
    const found = await getCase(body.caseId, user.id);
    if (!found) return jsonError(404, "We couldn't find that case.");
    if (found.status !== 'letter_ready') {
      return jsonError(409, found.mailLetterId ? 'This letter has already been sent.' : 'Draft and approve the letter first.');
    }
    const pay = await caseAccess(found.id, user.id);
    if (!pay?.access.ok) return jsonError(402, pay && !pay.access.ok ? pay.access.message : 'Payment is required to send this letter.');

    const html = letterToHtml(body.letterText);
    // Retries of the same letter reuse the key (no duplicate mail); an edited letter gets a new one.
    const idempotencyKey = createHash('sha256').update(JSON.stringify([found.id, html, body.to, body.from])).digest('hex');
    const created = await mail.createCertifiedLetter({
      to: body.to,
      from: body.from,
      html,
      idempotencyKey,
      description: `MedBill dispute ${found.id}`,
    });
    const letter = await waitUntilAccepted(mail, created);
    if (letter.cancelledReason) {
      return jsonError(422, `The mail service couldn't print this letter: ${letter.cancelledReason}`);
    }

    await updateCase(found.id, user.id, { status: 'sent', mailLetterId: letter.id, previewUrl: letter.previewUrl, sentAt: new Date().toISOString() });
    // A plan send uses one plan letter (counted from sent cases with paid_via = 'plan').
    if (pay.access.via === 'plan') await setCasePaidVia(found.id, user.id, 'plan');
    return Response.json({ mailLetterId: letter.id, previewUrl: letter.previewUrl });
  } catch (err) {
    if (err instanceof MailError) return jsonError(err.status, err.message);
    return serverError(err, "We couldn't send your letter. Please try again.");
  }
}
