// POST /api/cases/:id/simulate-delivery — demo only (TEST mode). Moves the case's test letter through
// PostGrid's test progressions (ready → printing → processed_for_delivery → completed) and marks the case
// `delivered`. On the deployed site PostGrid's webhook reports the same changes; this works locally too.
import { requireApiUser } from '@/lib/auth';
import { getCase, updateCase } from '@/lib/cases-repo';
import { jsonError, serverError } from '@/lib/http';
import { MailError, mail } from '@/lib/mail';
import { caseStatusForLetter } from '@/lib/tracking';

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: RouteContext<'/api/cases/[id]/simulate-delivery'>) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, "We couldn't find that case.");
  try {
    const found = await getCase(id, user.id);
    if (!found) return jsonError(404, "We couldn't find that case.");
    if (found.status === 'delivered' || found.status === 'resolved') return Response.json({ status: found.status });
    if (found.status !== 'sent' || !found.mailLetterId) return jsonError(409, 'Send the letter first.');

    let letter = await mail.getLetter(found.mailLetterId);
    for (let i = 0; i < 5 && letter.status !== 'completed' && letter.status !== 'cancelled'; i++) {
      letter = await mail.advanceTestLetter(found.mailLetterId);
    }
    if (letter.status === 'cancelled') return jsonError(409, 'The mail service cancelled this letter, so it cannot be delivered.');

    // The webhook may have got here first; re-read so we never move the case backwards.
    const current = (await getCase(id, user.id))?.status ?? found.status;
    const next = caseStatusForLetter(current, letter.status);
    if (next) await updateCase(id, user.id, { status: next });
    return Response.json({ status: next ?? current, letterStatus: letter.status });
  } catch (err) {
    if (err instanceof MailError) return jsonError(err.status, err.message);
    return serverError(err, "We couldn't simulate delivery. Please try again.");
  }
}
