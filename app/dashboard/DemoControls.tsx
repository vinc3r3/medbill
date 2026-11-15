'use client';

import { useState, useTransition } from 'react';
import { useHydrated } from '@/app/hooks/useHydrated';
import { SAMPLE_PROVIDER_ADDRESSES } from '@/lib/demo';
import { clearProviderAddresses, saveProviderAddress } from '@/lib/provider-address-store';
import { resetDemo, seedDemo } from './actions';

/** Demo tools: load the three sample cases, or delete all of this account's cases (with a confirm step). */
export function DemoControls({ caseCount }: { caseCount: number }) {
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const seed = () =>
    start(async () => {
      setMessage(null);
      const r = await seedDemo();
      if (!r.ok) return setMessage({ text: r.error, error: true });
      // As an upload would: remember each sample's billing address on this device for the letter.
      for (const { key, id } of r.created) saveProviderAddress(id, SAMPLE_PROVIDER_ADDRESSES[key]);
      setMessage({ text: 'Loaded sample cases A, B and C.' });
    });

  const reset = () =>
    start(async () => {
      setMessage(null);
      const r = await resetDemo();
      setConfirming(false);
      if (!r.ok) return setMessage({ text: r.error, error: true });
      clearProviderAddresses();
      setMessage({ text: `Deleted ${r.deleted} case${r.deleted === 1 ? '' : 's'}. Your details on this device were kept.` });
    });

  return (
    <section aria-label="Demo tools" data-testid="demo-tools" data-ready={hydrated || undefined} className="card flex flex-col gap-3 border-dashed">
      <div>
        <h2 className="font-semibold">Demo tools</h2>
        <p className="text-sm text-muted">Synthetic sample cases only. Reset to start the demo again from a clean slate.</p>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm reset">
          <span className="text-sm font-medium">
            Delete all {caseCount} case{caseCount === 1 ? '' : 's'}? This can&apos;t be undone.
          </span>
          <button type="button" onClick={reset} disabled={pending} className="btn bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800 disabled:bg-neutral-400">
            {pending ? 'Deleting…' : 'Delete all'}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="btn btn-secondary px-3 py-1.5 text-sm">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={seed} disabled={pending} className="btn btn-secondary px-3 py-1.5 text-sm">
            {pending ? 'Working…' : 'Load sample cases'}
          </button>
          <button type="button" onClick={() => setConfirming(true)} disabled={pending || caseCount === 0} className="btn btn-secondary px-3 py-1.5 text-sm">
            Reset demo
          </button>
        </div>
      )}
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`text-sm ${message.error ? 'text-red-700 dark:text-red-400' : 'text-muted'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
