'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { findProviderAddress } from '@/lib/address';
import { postJson } from '@/lib/api-client';
import { caseChanged } from '@/app/cases/actions';
import { saveProviderAddress } from '@/lib/provider-address-store';
import type { BillDoc, Case, EobDoc, Flag } from '@/lib/types';

type Step = 'extract' | 'save' | 'check';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'extract', label: 'Reading the details of your bill and EOB (about 20 seconds)' },
  { id: 'save', label: 'Saving your case' },
  { id: 'check', label: 'Comparing your bill with your EOB' },
];

type State = { kind: 'idle' } | { kind: 'running'; step: Step } | { kind: 'error'; step: Step; message: string };

/**
 * Sends the redacted text (only) for extraction, saves the case, runs the flag rules,
 * then opens the review screen.
 */
export function SendForCheck({
  billText,
  eobText,
  rawBillText,
  patientAddress,
  profileReady,
}: {
  billText: string;
  eobText: string;
  /** Unredacted OCR text: used here in the browser only, to find the provider's mailing address. */
  rawBillText: string;
  patientAddress: string;
  profileReady: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const running = state.kind === 'running';

  async function run() {
    let step: Step = 'extract';
    try {
      setState({ kind: 'running', step });
      const [bill, eob] = await Promise.all([
        postJson<BillDoc>('/api/extract', { docType: 'bill', redactedText: billText }),
        postJson<EobDoc>('/api/extract', { docType: 'eob', redactedText: eobText }),
      ]);
      step = 'save';
      setState({ kind: 'running', step });
      const created = await postJson<Case>('/api/cases', { bill, eob });
      saveProviderAddress(created.id, findProviderAddress(rawBillText, [patientAddress]));
      step = 'check';
      setState({ kind: 'running', step });
      await postJson<Flag[]>('/api/check', { caseId: created.id });
      await caseChanged(created.id);
      router.push(`/cases/${created.id}`);
    } catch (err) {
      setState({ kind: 'error', step, message: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    }
  }

  const current = state.kind === 'idle' ? null : state.step;
  const currentIdx = current ? STEPS.findIndex((s) => s.id === current) : -1;

  return (
    <section className="card flex flex-col gap-3 border-brand/40 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={run}
          disabled={!profileReady || running}
          className="btn btn-primary"
        >
          {running ? 'Checking…' : state.kind === 'error' ? 'Try again' : 'Check my bill'}
        </button>
        <p className="text-sm text-muted">
          {profileReady
            ? 'Sends only the redacted text shown above.'
            : 'Save your details above first, so your name and address are removed before sending.'}
        </p>
      </div>

      {current && (
        <ol className="flex flex-col gap-1 text-sm" aria-live="polite">
          {STEPS.map((s, i) => {
            const failed = state.kind === 'error' && i === currentIdx;
            const done = i < currentIdx;
            const active = state.kind === 'running' && i === currentIdx;
            return (
              <li key={s.id} className={i > currentIdx ? 'text-neutral-400' : ''}>
                <span aria-hidden className="inline-block w-5">
                  {failed ? '✕' : done ? '✓' : active ? '…' : '·'}
                </span>
                {s.label}
              </li>
            );
          })}
        </ol>
      )}

      {state.kind === 'error' && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      )}
    </section>
  );
}
