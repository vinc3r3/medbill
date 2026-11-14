// POST /api/letter — { caseId } → { letter } with placeholders  (status → "letter_ready")
// Built from a fixed template (lib/letter.ts); no AI. Never receives profile values: the request carries
// only the case id, and placeholders are filled in the browser at approval.
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { getCase, updateCase } from '@/lib/cases-repo';
import { jsonError, readBody, serverError } from '@/lib/http';
import { draftLetter } from '@/lib/letter';

const Body = z.object(
  { caseId: z.uuid({ error: 'caseId must be a case id.' }) },
  { error: 'Send JSON like { "caseId": "..." }.' },
);
const LOCKED = new Set(['sent', 'delivered', 'resolved']);

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;
  try {
    const found = await getCase(body.caseId, user.id);
    if (!found) return jsonError(404, "We couldn't find that case.");
    if (LOCKED.has(found.status)) return jsonError(409, 'The letter for this case has already been sent.');
    if (found.status === 'uploaded') return jsonError(409, 'Check the bill first, then draft the letter.');
    if (found.flags.length === 0) return jsonError(409, 'There is nothing to question on this bill, so no letter is needed.');

    const today = new Date().toISOString().slice(0, 10);
    const letter = draftLetter(found, today);
    await updateCase(found.id, user.id, { letter, status: 'letter_ready' });
    return Response.json({ letter });
  } catch (err) {
    return serverError(err, "We couldn't draft your letter. Please try again.");
  }
}
