import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

/** Renders children only for a signed-in user; otherwise sends them to sign in. Wrap in <Suspense>. */
export async function RequireUser({ children, next = '/' }: { children: React.ReactNode; next?: string }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return <>{children}</>;
}
