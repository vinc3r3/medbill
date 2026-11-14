// Who is signed in. Server only. Uses getClaims(), which verifies the session token instead of trusting
// the cookie (getSession() alone must never be used for authorization).
import { jsonError } from './http';
import { createSessionClient } from './supabase/server';

export type CurrentUser = { id: string; email: string | null };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Outside the try: during prerendering Next rejects cookies() on purpose to mark this as dynamic,
  // and that signal must propagate rather than be mistaken for "signed out".
  const supabase = await createSessionClient();
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return { id: data.claims.sub, email: typeof data.claims.email === 'string' ? data.claims.email : null };
  } catch (err) {
    console.error('auth check failed', err);
    return null;
  }
}

/** For route handlers: the user, or a 401 Response to return as-is. */
export async function requireApiUser(): Promise<CurrentUser | Response> {
  return (await getCurrentUser()) ?? jsonError(401, 'Please sign in to continue.');
}

/** A safe in-app path to return to after signing in (no open redirects). */
export function safeNext(next: unknown, fallback = '/'): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
}
