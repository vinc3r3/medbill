'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useActionState } from 'react';
import { signIn, signUp, type AuthState } from './actions';

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const next = useSearchParams().get('next') ?? '/dashboard';
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === 'signin' ? signIn : signUp, { error: null, email: '' });
  const isSignIn = mode === 'signin';
  const other = `${isSignIn ? '/signup' : '/signin'}${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" defaultValue={state.email}
          className="input" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Password</span>
        <input name="password" type="password" required minLength={isSignIn ? undefined : 8}
          autoComplete={isSignIn ? 'current-password' : 'new-password'}
          className="input" />
        {!isSignIn && <span className="text-xs text-neutral-500">At least 8 characters.</span>}
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{state.error}</p>
      )}
      <button type="submit" disabled={pending}
        className="btn btn-primary">
        {pending ? 'Please wait…' : isSignIn ? 'Sign in' : 'Create account'}
      </button>
      <p className="text-sm text-muted">
        {isSignIn ? 'New here? ' : 'Already have an account? '}
        <Link href={other} className="font-medium underline">{isSignIn ? 'Create an account' : 'Sign in'}</Link>
      </p>
    </form>
  );
}
