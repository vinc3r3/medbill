// POST /api/mail-webhook — PostGrid `letter.updated` events (TEST mode). Public, but every delivery must be
// a JWT signed (HS256) with POSTGRID_WEBHOOK_SECRET; anything else is rejected with 401.
// Moves a `sent` case to `delivered` when its letter is `completed`. Idempotent (PostGrid may retry).
import { findCaseByMailLetterId, updateCase } from '@/lib/cases-repo';
import { requireEnv } from '@/lib/env';
import { jsonError, serverError } from '@/lib/http';
import { verifyHs256 } from '@/lib/jwt';
import { extractToken, toLetterEvent } from '@/lib/mail-webhook';
import { caseStatusForLetter } from '@/lib/tracking';

export async function POST(request: Request) {
  const token = extractToken(await request.text());
  const claims = token ? verifyHs256(token, requireEnv('POSTGRID_WEBHOOK_SECRET')) : null;
  if (!claims) return jsonError(401, 'Invalid signature.');

  const event = toLetterEvent(claims);
  if (!event) return Response.json({ ok: true, ignored: 'not a letter event' });
  try {
    const found = await findCaseByMailLetterId(event.letterId);
    if (!found) return Response.json({ ok: true, ignored: 'unknown letter' });
    const next = caseStatusForLetter(found.status, event.letterStatus);
    if (next) await updateCase(found.id, found.userId, { status: next });
    console.log(`mail-webhook ${event.type} ${event.letterId} → ${event.letterStatus}; case ${found.status} → ${next ?? 'unchanged'}`);
    return Response.json({ ok: true, caseStatus: next ?? found.status });
  } catch (err) {
    return serverError(err, 'Could not process the event.'); // non-200 → PostGrid retries
  }
}
