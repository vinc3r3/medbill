'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/api-client';

/** Demo only: advances the PostGrid test letter to "completed" so the case shows as delivered. */
export function SimulateDeliveryButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await postJson(`/api/cases/${caseId}/simulate-delivery`, {});
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not simulate delivery.');
          } finally {
            setBusy(false);
          }
        }}
        className="self-start rounded-lg border border-neutral-400 px-3 py-1.5 text-sm font-medium disabled:opacity-60 dark:border-neutral-600"
      >
        {busy ? 'Simulating…' : 'Simulate delivery (test mode)'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
