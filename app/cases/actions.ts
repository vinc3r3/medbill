'use server';
// After a case changes (sent, delivered, reply logged), refresh the pages that show it. Called from the
// browser after the API route succeeds. Revalidating from a server action also drops the client's
// prefetched copies, so going back to the dashboard never shows the old status first.
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';

export async function caseChanged(caseId: string): Promise<void> {
  if (!(await getCurrentUser())) return;
  revalidatePath('/dashboard');
  if (/^[0-9a-f-]{36}$/i.test(caseId)) revalidatePath(`/cases/${caseId}`);
}
