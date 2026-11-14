// POST /api/check — { caseId } → Flag[]  (status → "checked")
// Runs the pure flag rules (lib/flags.ts) on the stored bill and EOB. No AI involved.
import { z } from 'zod';
import { getCase, updateCase } from '@/lib/cases-repo';
import { checkFlags, savedAmount } from '@/lib/flags';
import { jsonError, readBody, serverError } from '@/lib/http';

const Body = z.object(
  { caseId: z.uuid({ error: 'caseId must be a case id.' }) },
  { error: 'Send JSON like { "caseId": "..." }.' },
);

// Once a letter is on its way, the flags it cites must not change underneath it.
const LOCKED = new Set(['sent', 'delivered', 'resolved']);

export async function POST(request: Request) {
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;
  try {
    const found = await getCase(body.caseId);
    if (!found) return jsonError(404, "We couldn't find that case.");
    if (LOCKED.has(found.status)) return jsonError(409, 'This case has already been sent, so it can no longer be re-checked.');

    const flags = checkFlags(found.bill, found.eob);
    await updateCase(found.id, { flags, savedAmount: savedAmount(flags), status: 'checked' });
    return Response.json(flags);
  } catch (err) {
    return serverError(err, "We couldn't check your case. Please try again.");
  }
}
