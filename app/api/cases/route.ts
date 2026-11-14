// POST /api/cases — { bill, eob } → Case (status "uploaded")
// GET  /api/cases — Case[]
import { connection } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { createCase, listCases } from '@/lib/cases-repo';
import { readBody, serverError } from '@/lib/http';
import { BillDocSchema, EobDocSchema } from '@/lib/schemas';

const Body = z.object(
  {
    bill: BillDocSchema,
    eob: EobDocSchema,
  },
  { error: 'Send JSON like { "bill": {...}, "eob": {...} }.' },
);

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;
  try {
    return Response.json(await createCase(user.id, body.bill, body.eob), { status: 201 });
  } catch (err) {
    return serverError(err, "We couldn't save your case. Please try again.");
  }
}

export async function GET() {
  await connection(); // always read fresh data at request time
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  try {
    return Response.json(await listCases(user.id));
  } catch (err) {
    return serverError(err, "We couldn't load your cases. Please try again.");
  }
}
