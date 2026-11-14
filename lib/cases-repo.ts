// Data access for the `cases` table. Server only (uses the Supabase secret key).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';
import type { BillDoc, Case, CaseStatus, EobDoc, Flag } from './types';

export type CaseRow = {
  id: string;
  status: CaseStatus;
  bill: BillDoc;
  eob: EobDoc;
  flags: Flag[];
  letter: string | null;
  lob_letter_id: string | null;
  saved_amount: number | string; // Postgres numeric may arrive as a string
  created_at: string;
};

export function rowToCase(row: CaseRow): Case {
  return {
    id: row.id,
    status: row.status,
    bill: row.bill,
    eob: row.eob,
    flags: row.flags ?? [],
    letter: row.letter,
    lobLetterId: row.lob_letter_id,
    savedAmount: Number(row.saved_amount),
    createdAt: row.created_at,
  };
}

type CasePatch = Partial<Pick<Case, 'status' | 'flags' | 'letter' | 'lobLetterId' | 'savedAmount'>>;

export function patchToRow(patch: CasePatch): Partial<CaseRow> {
  const row: Partial<CaseRow> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.flags !== undefined) row.flags = patch.flags;
  if (patch.letter !== undefined) row.letter = patch.letter;
  if (patch.lobLetterId !== undefined) row.lob_letter_id = patch.lobLetterId;
  if (patch.savedAmount !== undefined) row.saved_amount = patch.savedAmount;
  return row;
}

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  client ??= createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false },
  });
  return client;
}

export async function createCase(bill: BillDoc, eob: EobDoc): Promise<Case> {
  const { data, error } = await db().from('cases').insert({ bill, eob }).select().single();
  if (error) throw new Error(`Could not save case: ${error.message}`);
  return rowToCase(data as CaseRow);
}

export async function getCase(id: string): Promise<Case | null> {
  const { data, error } = await db().from('cases').select().eq('id', id).maybeSingle();
  if (error) throw new Error(`Could not load case: ${error.message}`);
  return data ? rowToCase(data as CaseRow) : null;
}

export async function listCases(): Promise<Case[]> {
  const { data, error } = await db().from('cases').select().order('created_at', { ascending: false });
  if (error) throw new Error(`Could not list cases: ${error.message}`);
  return (data as CaseRow[]).map(rowToCase);
}

export async function updateCase(id: string, patch: CasePatch): Promise<Case> {
  const { data, error } = await db().from('cases').update(patchToRow(patch)).eq('id', id).select().single();
  if (error) throw new Error(`Could not update case: ${error.message}`);
  return rowToCase(data as CaseRow);
}

export async function deleteCase(id: string): Promise<void> {
  const { error } = await db().from('cases').delete().eq('id', id);
  if (error) throw new Error(`Could not delete case: ${error.message}`);
}
