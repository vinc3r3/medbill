// Cases table round-trip and ownership. Run with `npm run test:db`.
// Needs .env.local and migrations 0001–0004 applied. Creates two temporary users and deletes them (cascade).
import { loadEnvConfig } from '@next/env';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// @next/env skips .env.local when NODE_ENV=test (which Vitest sets), so load it as development.
const nodeEnv = process.env.NODE_ENV;
(process.env as Record<string, string | undefined>).NODE_ENV = 'development';
loadEnvConfig(process.cwd(), true);
(process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;

const { createClient } = await import('@supabase/supabase-js');
const { createCase, deleteCase, getCase, listCases, updateCase } = await import('@/lib/cases-repo');
const { missingEnv } = await import('@/lib/env');
import type { BillDoc, EobDoc } from '@/lib/types';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const users: string[] = [];
async function tempUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `db-test-${crypto.randomUUID()}@example.com`,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  users.push(data.user.id);
  return data.user.id;
}

let alice = '';
let bob = '';
beforeAll(async () => {
  alice = await tempUser();
  bob = await tempUser();
});
afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

const bill: BillDoc = {
  provider: 'Integration Test Clinic',
  serviceDate: '2026-01-02',
  lines: [{ date: '2026-01-02', code: '99213', description: 'Office visit', billed: 45 }],
  amountDue: 45,
};
const eob: EobDoc = {
  insurer: 'Integration Test Health',
  claimId: 'TEST-0001',
  lines: [{ date: '2026-01-02', code: '99213', description: 'Office visit', billed: 180, allowed: 120, planPaid: 75, patientResponsibility: 45 }],
  totalPatientResponsibility: 45,
};

describe('cases table', () => {
  it('has the env vars it needs', () => {
    expect(missingEnv()).toEqual([]);
  });

  it('saves a case for its owner and reads it back', async () => {
    const created = await createCase(alice, bill, eob);
    try {
      expect(created.status).toBe('uploaded');
      const loaded = await getCase(created.id, alice);
      expect(loaded?.bill).toEqual(bill);
      expect(loaded?.eob).toEqual(eob);
      expect(loaded?.savedAmount).toBe(0);
      expect(loaded).not.toHaveProperty('userId');
    } finally {
      await deleteCase(created.id, alice);
    }
  });

  it("never shows, lists, updates or deletes another user's case", async () => {
    const created = await createCase(alice, bill, eob);
    try {
      expect(await getCase(created.id, bob)).toBeNull();
      expect((await listCases(bob)).map((c) => c.id)).not.toContain(created.id);
      await expect(updateCase(created.id, bob, { status: 'checked' })).rejects.toThrow();
      await deleteCase(created.id, bob);
      expect((await getCase(created.id, alice))?.status).toBe('uploaded'); // untouched
    } finally {
      await deleteCase(created.id, alice);
    }
  });
});
