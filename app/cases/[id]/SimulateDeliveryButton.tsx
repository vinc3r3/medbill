'use client';

import { useState } from 'react';
import { postJson } from '@/lib/api-client';
import { caseChanged } from '@/app/cases/actions';

/** Demo only: advances the PostGrid test letter to "completed" so the case shows as delivered. */
export function SimulateDeliveryButton({ caseId }: { caseId: string }) {
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
            await caseChanged(caseId); // re-renders this page and refreshes the dashboard
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not simulate delivery.');
          } finally {
            setBusy(false);
          }
        }}
        className="btn btn-secondary self-start px-3 py-1.5 text-sm"
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
