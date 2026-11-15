'use server';
// Demo controls on the dashboard: load the three synthetic sample cases, or delete all of your cases.
// Seeding runs the same pure flag rules as /api/check; no AI call, no documents involved.
import { revalidatePath } from 'next/cache';
import a from '@/samples/a/expected.json';
import b from '@/samples/b/expected.json';
import c from '@/samples/c/expected.json';
import { getCurrentUser } from '@/lib/auth';
import { createCase, deleteAllCases, updateCase } from '@/lib/cases-repo';
import type { SampleKey } from '@/lib/demo';
import { checkFlags, savedAmount } from '@/lib/flags';
import { SampleExpectedSchema } from '@/lib/schemas';

export type DemoResult = { ok: true; created: Array<{ key: SampleKey; id: string }>; deleted: number } | { ok: false; error: string };

const SAMPLES: Record<SampleKey, unknown> = { a, b, c };

export async function seedDemo(): Promise<DemoResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Please sign in to continue.' };
  try {
    const created: Array<{ key: SampleKey; id: string }> = [];
    // In order A, B, C, so C (the most interesting) is listed first on the dashboard.
    for (const key of ['a', 'b', 'c'] as const) {
      const { bill, eob } = SampleExpectedSchema.parse(SAMPLES[key]);
      const made = await createCase(user.id, bill, eob);
      const flags = checkFlags(bill, eob);
      await updateCase(made.id, user.id, { flags, savedAmount: savedAmount(flags), status: 'checked' });
      created.push({ key, id: made.id });
    }
    revalidatePath('/dashboard');
    return { ok: true, created, deleted: 0 };
  } catch (err) {
    console.error(err);
    return { ok: false, error: "We couldn't load the sample cases. Please try again." };
  }
}

export async function resetDemo(): Promise<DemoResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Please sign in to continue.' };
  try {
    const deleted = await deleteAllCases(user.id);
    revalidatePath('/dashboard');
    return { ok: true, created: [], deleted };
  } catch (err) {
    console.error(err);
    return { ok: false, error: "We couldn't reset your cases. Please try again." };
  }
}
