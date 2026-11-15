// POST /api/cases/:id/reply — { outcome, bill } → Case. Logs the provider's reply (docs/spec.md, "Replies").
// `bill` is the corrected statement as extracted by /api/extract from redacted text (no personal details);
// it is required for `corrected` and ignored otherwise. A corrected statement resolves the case.
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { getCase, updateCase } from '@/lib/cases-repo';
import { jsonError, readBody, serverError } from '@/lib/http';
import { ReplyError, applyReply } from '@/lib/replies';
import { BillDocSchema } from '@/lib/schemas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object(
  {
    outcome: z.enum(['corrected', 'denied', 'more_info'], { error: 'outcome must be "corrected", "denied" or "more_info".' }),
    bill: BillDocSchema.nullable().optional(),
  },
  { error: 'Send JSON like { "outcome": "corrected", "bill": { ... } }.' },
);

export async function POST(request: Request, { params }: RouteContext<'/api/cases/[id]/reply'>) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, "We couldn't find that case.");
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;
  try {
    const found = await getCase(id, user.id);
    if (!found) return jsonError(404, "We couldn't find that case.");
    const bill = body.outcome === 'corrected' ? (body.bill ?? null) : null;
    const patch = applyReply(found, { outcome: body.outcome, bill }, new Date().toISOString());
    return Response.json(await updateCase(id, user.id, patch));
  } catch (err) {
    if (err instanceof ReplyError) return jsonError(409, err.message);
    return serverError(err, "We couldn't save the reply. Please try again.");
  }
}
