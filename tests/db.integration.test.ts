// Task 1 check: a test case saves to Supabase and reads back.
// Run with `npm run test:db`. Needs .env.local and the migration in supabase/migrations applied.
import { loadEnvConfig } from '@next/env';
import { describe, expect, it } from 'vitest';

// @next/env skips .env.local when NODE_ENV=test (which Vitest sets), so load it as development.
const nodeEnv = process.env.NODE_ENV;
(process.env as Record<string, string | undefined>).NODE_ENV = 'development';
loadEnvConfig(process.cwd(), true);
(process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;

const { createCase, deleteCase, getCase } = await import('@/lib/cases-repo');
const { missingEnv } = await import('@/lib/env');
import type { BillDoc, EobDoc } from '@/lib/types';

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

  it('saves a case and reads it back', async () => {
    const created = await createCase(bill, eob);
    try {
      expect(created.status).toBe('uploaded');
      const loaded = await getCase(created.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.bill).toEqual(bill);
      expect(loaded!.eob).toEqual(eob);
      expect(loaded!.flags).toEqual([]);
      expect(loaded!.savedAmount).toBe(0);
    } finally {
      await deleteCase(created.id);
    }
  });
});
