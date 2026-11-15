// Data access for the `cases` table. Server only (uses the Supabase secret key, which bypasses RLS), so
// every user-facing function takes the signed-in user's id and filters by it.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';
import type { BillDoc, Case, CaseStatus, EobDoc, Flag, Reply } from './types';

export type CaseRow = {
  id: string;
  user_id?: string; // never exposed in Case
  status: CaseStatus;
  bill: BillDoc;
  eob: EobDoc;
  flags: Flag[];
  letter: string | null;
  mail_letter_id: string | null;
  preview_url: string | null;
  sent_at: string | null;
  saved_amount: number | string; // Postgres numeric may arrive as a string
  created_at: string;
  replies: Reply[] | null;
};

export function rowToCase(row: CaseRow): Case {
  return {
    id: row.id,
    status: row.status,
    bill: row.bill,
    eob: row.eob,
    flags: row.flags ?? [],
    letter: row.letter,
    mailLetterId: row.mail_letter_id,
    previewUrl: row.preview_url,
    sentAt: row.sent_at,
    savedAmount: Number(row.saved_amount),
    createdAt: row.created_at,
    replies: row.replies ?? [],
  };
}

type CasePatch = Partial<Pick<Case, 'status' | 'flags' | 'letter' | 'mailLetterId' | 'previewUrl' | 'sentAt' | 'savedAmount' | 'replies'>>;

export function patchToRow(patch: CasePatch): Partial<CaseRow> {
  const row: Partial<CaseRow> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.flags !== undefined) row.flags = patch.flags;
  if (patch.letter !== undefined) row.letter = patch.letter;
  if (patch.mailLetterId !== undefined) row.mail_letter_id = patch.mailLetterId;
  if (patch.previewUrl !== undefined) row.preview_url = patch.previewUrl;
  if (patch.sentAt !== undefined) row.sent_at = patch.sentAt;
  if (patch.savedAmount !== undefined) row.saved_amount = patch.savedAmount;
  if (patch.replies !== undefined) row.replies = patch.replies;
  return row;
}

let client: SupabaseClient | null = null;
export function db(): SupabaseClient {
  client ??= createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false },
  });
  return client;
}

export async function createCase(userId: string, bill: BillDoc, eob: EobDoc): Promise<Case> {
  const { data, error } = await db().from('cases').insert({ user_id: userId, bill, eob }).select().single();
  if (error) throw new Error(`Could not save case: ${error.message}`);
  return rowToCase(data as CaseRow);
}

/** The case if it exists AND belongs to this user; otherwise null (callers answer 404 either way). */
export async function getCase(id: string, userId: string): Promise<Case | null> {
  const { data, error } = await db().from('cases').select().eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Could not load case: ${error.message}`);
  return data ? rowToCase(data as CaseRow) : null;
}

export async function listCases(userId: string): Promise<Case[]> {
  const { data, error } = await db().from('cases').select().eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(`Could not list cases: ${error.message}`);
  return (data as CaseRow[]).map(rowToCase);
}

export async function updateCase(id: string, userId: string, patch: CasePatch): Promise<Case> {
  const { data, error } = await db().from('cases').update(patchToRow(patch)).eq('id', id).eq('user_id', userId).select().single();
  if (error) throw new Error(`Could not update case: ${error.message}`);
  return rowToCase(data as CaseRow);
}

export async function deleteCase(id: string, userId: string): Promise<void> {
  const { error } = await db().from('cases').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error(`Could not delete case: ${error.message}`);
}

/**
 * For signature-verified webhooks only (no signed-in user): which case a mail-provider letter belongs to.
 * Returns just what the webhook needs to update the status.
 */
export async function findCaseByMailLetterId(mailLetterId: string): Promise<{ id: string; userId: string; status: CaseStatus } | null> {
  const { data, error } = await db().from('cases').select('id, user_id, status').eq('mail_letter_id', mailLetterId).maybeSingle();
  if (error) throw new Error(`Could not look up letter: ${error.message}`);
  return data ? { id: data.id, userId: data.user_id, status: data.status } : null;
}

/** Deletes every case of this user (demo reset). Returns how many were removed. */
export async function deleteAllCases(userId: string): Promise<number> {
  const { data, error } = await db().from('cases').delete().eq('user_id', userId).select('id');
  if (error) throw new Error(`Could not delete cases: ${error.message}`);
  return data.length;
}
