'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useProfile } from '@/app/hooks/useProfile';
import { postJson } from '@/lib/api-client';
import { PLACEHOLDERS, fillPlaceholders, type Placeholder } from '@/lib/letter';
import { SendPanel } from './SendPanel';

const PLACEHOLDER_HELP: Record<Placeholder, string> = {
  '{{PATIENT_NAME}}': 'your name',
  '{{MEMBER_ID}}': 'your insurance member ID',
  '{{ADDRESS}}': 'your mailing address',
};

type State =
  | { kind: 'none' }
  | { kind: 'drafting' }
  | { kind: 'editing'; draft: string; original: string }
  | { kind: 'approved'; draft: string; original: string; filled: string };

/**
 * Draft (from the server, with placeholders) → edit → approve. Approval fills the placeholders here in
 * the browser from the saved profile; edits are not saved to the server.
 */
export function LetterEditor({ caseId, initialLetter, providerName }: { caseId: string; initialLetter: string | null; providerName: string }) {
  const profile = useProfile();
  const [state, setState] = useState<State>(
    initialLetter ? { kind: 'editing', draft: initialLetter, original: initialLetter } : { kind: 'none' },
  );
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Placeholder[]>([]);

  async function draft() {
    setError(null);
    setState({ kind: 'drafting' });
    try {
      const { letter } = await postJson<{ letter: string }>('/api/letter', { caseId });
      setState({ kind: 'editing', draft: letter, original: letter });
    } catch (err) {
      setState({ kind: 'none' });
      setError(err instanceof Error ? err.message : 'We could not draft your letter.');
    }
  }

  if (state.kind === 'none' || state.kind === 'drafting') {
    return (
      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={draft}
          disabled={state.kind === 'drafting'}
          className="btn btn-primary self-start"
        >
          {state.kind === 'drafting' ? 'Drafting…' : 'Draft a letter'}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </section>
    );
  }

  if (state.kind === 'approved') {
    return (
      <section aria-label="Approved letter" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your letter, ready to send</h2>
        <p className="text-sm text-muted">
          Your details were filled in on this device. Read it once more before sending.
        </p>
        <pre
          data-testid="letter-final"
          className="card font-sans text-sm leading-relaxed whitespace-pre-wrap"
        >
          {state.filled}
        </pre>
        <button
          type="button"
          className="self-start text-sm underline"
          onClick={() => setState({ kind: 'editing', draft: state.draft, original: state.original })}
        >
          Edit again
        </button>
        <SendPanel caseId={caseId} providerName={providerName} filledLetter={state.filled} />
      </section>
    );
  }

  const usedPlaceholders = PLACEHOLDERS.filter((p) => state.draft.includes(p));
  return (
    <section aria-label="Letter editor" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Your letter</h2>
      <p className="text-sm text-muted">
        Edit anything you like.{' '}
        {usedPlaceholders.length > 0 && (
          <>
            When you approve, {usedPlaceholders.map((p, i) => (
              <span key={p}>
                {i > 0 && (i === usedPlaceholders.length - 1 ? ' and ' : ', ')}
                <code className="rounded bg-neutral-100 px-1 text-xs dark:bg-neutral-800">{p}</code> becomes {PLACEHOLDER_HELP[p]}
              </span>
            ))}
            , filled in on this device.
          </>
        )}
      </p>
      <textarea
        aria-label="Letter text"
        data-testid="letter-editor"
        value={state.draft}
        onChange={(e) => {
          setMissing([]);
          setState({ ...state, draft: e.target.value });
        }}
        rows={28}
        spellCheck
        className="input w-full rounded-2xl p-4 text-sm leading-relaxed"
      />
      {missing.length > 0 && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Add {missing.map((p) => PLACEHOLDER_HELP[p]).join(' and ')} in{' '}
          <Link href="/settings" className="link">
            Settings
          </Link>
          , then approve again.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const { text, missing: notFilled } = fillPlaceholders(state.draft, profile);
            if (notFilled.length) return setMissing(notFilled);
            setState({ kind: 'approved', draft: state.draft, original: state.original, filled: text });
          }}
          className="btn btn-primary"
        >
          Approve letter
        </button>
        {state.draft !== state.original && (
          <button type="button" className="link text-sm" onClick={() => setState({ ...state, draft: state.original })}>
            Undo my edits
          </button>
        )}
      </div>
    </section>
  );
}
