// Small helpers for route handlers: readable JSON errors and body parsing.
import type { z } from 'zod';

export const jsonError = (status: number, message: string) => Response.json({ error: message }, { status });

/** Parses and validates a JSON body. Returns the data, or a 400 Response with a readable message. */
export async function readBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | Response> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  return jsonError(400, issue ? `${where}${issue.message}` : 'Invalid request.');
}

/** Logs the real error server-side and returns a generic 500. */
export function serverError(err: unknown, message = 'Something went wrong. Please try again.') {
  console.error(err);
  return jsonError(500, message);
}
