// GET /api/cases/:id/preview — redirects to a fresh PDF preview of the sent letter.
// Provider preview links are signed and expire quickly, so we fetch a new one each time.
import { connection } from 'next/server';
import { getCase } from '@/lib/cases-repo';
import { jsonError, serverError } from '@/lib/http';
import { MailError, mail } from '@/lib/mail';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: RouteContext<'/api/cases/[id]/preview'>) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, "We couldn't find that case.");
  try {
    const found = await getCase(id);
    if (!found?.mailLetterId) return jsonError(404, 'No letter has been sent for this case yet.');
    const letter = await mail.getLetter(found.mailLetterId);
    if (!letter.previewUrl) return jsonError(404, 'The preview is not ready yet. Try again in a few seconds.');
    return Response.redirect(letter.previewUrl, 302);
  } catch (err) {
    if (err instanceof MailError) return jsonError(err.status, err.message);
    return serverError(err, "We couldn't load the letter preview.");
  }
}
