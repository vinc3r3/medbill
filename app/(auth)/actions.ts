'use server';
// Sign-in, sign-up and sign-out as server actions: credentials go straight from the form to Supabase Auth
// on the server; the session is stored in httpOnly cookies.
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/auth';
import { createSessionClient } from '@/lib/supabase/server';

export type AuthState = { error: string | null; email: string };

function read(formData: FormData) {
  return {
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    password: String(formData.get('password') ?? ''),
    next: safeNext(formData.get('next')),
  };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password, next } = read(formData);
  if (!email || !password) return { error: 'Enter your email and password.', email };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Same message for unknown email and wrong password, so accounts can't be probed.
    return { error: error.status === 429 ? 'Too many attempts. Please wait a minute.' : 'Wrong email or password.', email };
  }
  redirect(next);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password, next } = read(formData);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.', email };
  if (password.length < 8) return { error: 'Use a password with at least 8 characters.', email };
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    if (/registered|exists/i.test(error.message)) return { error: 'An account with this email already exists. Sign in instead.', email };
    if (error.status === 429) return { error: 'Too many sign-ups right now. Please wait a minute.', email };
    if (/invalid/i.test(error.message)) return { error: "This email address can't be used. Please try a different one.", email };
    console.error('sign-up failed', error.message);
    return { error: "We couldn't create your account. Please try again.", email };
  }
  if (!data.session) return { error: 'Check your email to confirm your account, then sign in.', email };
  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect('/signin');
}
