// Supabase-backed ExtractionStore (table `extractions`, migration 0003). Server only.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';
import type { ExtractionStore } from './extract-cache';

let client: SupabaseClient | null = null;
const db = () =>
  (client ??= createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), { auth: { persistSession: false } }));

export function supabaseExtractionStore(meta: { provider: string; model: string }): ExtractionStore {
  return {
    async get(hash) {
      const { data, error } = await db().from('extractions').select('result').eq('hash', hash).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.result ?? null;
    },
    async put(hash, docType, result) {
      const { error } = await db()
        .from('extractions')
        .upsert({ hash, doc_type: docType, result, provider: meta.provider, model: meta.model }, { onConflict: 'hash' });
      if (error) throw new Error(error.message);
    },
  };
}
