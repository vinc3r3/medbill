'use client';

import { useState } from 'react';
import { useHydrated } from '@/app/hooks/useHydrated';
import { useProfile } from '@/app/hooks/useProfile';
import { postJson } from '@/lib/api-client';
import { caseChanged } from '@/app/cases/actions';
import { isProfileEmpty } from '@/lib/profile';
import { redact } from '@/lib/redact';
import { OUTCOME_LABELS } from '@/lib/replies';
import type { BillDoc, Case, ReplyOutcome } from '@/lib/types';
import { DropZone } from '../../components/DropZone';

const OUTCOME_HINTS: Record<ReplyOutcome, string> = {
  corrected: 'They sent a corrected statement. Upload it and we compare it with your EOB.',
  denied: 'They say the bill is right and kept the amount.',
  more_info: 'They need something else from you (for example a copy of the EOB).',
};

type State = { kind: 'idle' } | { kind: 'busy'; label: string } | { kind: 'error'; message: string };

/**
 * "I got a reply": the user picks the outcome; for a corrected statement the photo is read on this device,
 * redacted, and only the redacted text goes to /api/extract. The reply is then logged on the case.
 */
export function ReplyPanel({ caseId, caseRef }: { caseId: string; caseRef: string }) {
  const hydrated = useHydrated();
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<ReplyOutcome | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const busy = state.kind === 'busy';
  const profileReady = !isProfileEmpty(profile);
  const needsFile = outcome === 'corrected';
  const canSave = outcome !== null && !busy && (!needsFile || (file !== null && profileReady));

  async function save() {
    if (!outcome) return;
    try {
      let bill: BillDoc | null = null;
      if (outcome === 'corrected' && file) {
        setState({ kind: 'busy', label: 'Reading the statement on this device' });
        const { ocrImages } = await import('@/lib/ocr');
        const [raw] = await ocrImages([file]);
        setState({ kind: 'busy', label: 'Reading the new amounts (about 10 seconds)' });
        bill = await postJson<BillDoc>('/api/extract', { docType: 'bill', redactedText: redact(raw, profile) });
      }
      setState({ kind: 'busy', label: 'Saving the reply' });
      await postJson<Case>(`/api/cases/${caseId}/reply`, { outcome, bill });
      setState({ kind: 'idle' });
      setOpen(false);
      setOutcome(null);
      setFile(null);
      await caseChanged(caseId); // re-renders this page and refreshes the dashboard
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="got-reply"
        data-ready={hydrated || undefined}
        onClick={() => setOpen(true)}
        className="btn btn-primary self-start"
      >
        I got a reply
      </button>
    );
  }

  return (
    <section aria-label="Log a reply" data-testid="reply-panel" className="card flex flex-col gap-4 border-brand/40">
      <div>
        <h2 className="text-lg font-semibold">What did the provider say?</h2>
        <p className="text-sm text-muted">
          Their reply should mention your reference <span className="font-mono font-semibold">{caseRef}</span>.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="sr-only">Outcome</legend>
        {(Object.keys(OUTCOME_LABELS) as ReplyOutcome[]).map((o) => (
          <label key={o} className="flex cursor-pointer gap-3 rounded-xl border border-line bg-surface p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="mt-1" />
            <span>
              <span className="font-medium">{OUTCOME_LABELS[o]}</span>
              <span className="block text-sm text-muted">{OUTCOME_HINTS[o]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {needsFile && (
        <>
          <DropZone label="Statement" hint="A photo or scan of the corrected statement" file={file} onChange={setFile} />
          <p className="text-sm text-muted">
            {profileReady
              ? 'The text is read on this device and your personal details are removed before anything is sent.'
              : 'Save your details in Settings first, so your name and address are removed before sending.'}
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="btn btn-primary"
        >
          {busy ? 'Saving…' : 'Save reply'}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="text-sm underline disabled:opacity-60">
          Cancel
        </button>
        {state.kind === 'busy' && (
          <p role="status" className="text-sm text-muted">
            {state.label}…
          </p>
        )}
      </div>
      {state.kind === 'error' && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      )}
    </section>
  );
}
