// Supabase client bound to the signed-in user's session cookies (publishable key, so it acts with the
// user's own rights). Create one per request. Server only.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireEnv } from '../env';

export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_PUBLISHABLE_KEY'), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes the session.
        }
      },
    },
  });
}
