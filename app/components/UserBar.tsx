import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';
import { getCurrentUser } from '@/lib/auth';
import { NavLinks } from './NavLinks';

/** Header right side: app navigation + sign out when signed in; sign in / create account otherwise. */
export async function UserBar() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Link href="/signin" className="rounded-lg px-3 py-1.5 font-medium hover:bg-brand-soft">Sign in</Link>
        <Link href="/signup" className="btn btn-primary px-3 py-1.5 text-sm">Create account</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-sm">
      <NavLinks />
      <span data-testid="user-email" className="hidden max-w-48 truncate text-muted lg:inline">{user.email}</span>
      <form action={signOut}>
        <button type="submit" className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-brand-soft hover:text-foreground">Sign out</button>
      </form>
    </div>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <svg aria-hidden viewBox="0 0 24 24" className="size-7 shrink-0" fill="none">
        <rect x="3" y="2" width="18" height="20" rx="4" className="fill-brand" />
        <path d="M7 7h10M7 11h6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="m10 16 2 2 4-4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      MedBill Checker
    </span>
  );
}

export function AppHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" aria-label="MedBill Checker home">
          <Logo />
        </Link>
        {children}
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap justify-between gap-2 px-4 py-6 text-xs text-muted">
        <p>Demo build: synthetic sample documents, test mode only. No real mail is sent and no card is charged.</p>
        <p>Not legal or medical advice.</p>
      </div>
    </footer>
  );
}
