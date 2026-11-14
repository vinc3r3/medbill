import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';
import { getCurrentUser } from '@/lib/auth';

/** Header right side: the signed-in email and a sign-out button (nothing when signed out). */
export async function UserBar() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span data-testid="user-email" className="hidden text-neutral-600 sm:inline dark:text-neutral-400">{user.email}</span>
      <form action={signOut}>
        <button type="submit" className="rounded-md px-2 py-1 underline">Sign out</button>
      </form>
    </div>
  );
}

export function AppHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">MedBill Checker</Link>
        {children}
      </div>
    </header>
  );
}
