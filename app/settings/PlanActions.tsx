'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { postJson } from '@/lib/api-client';
import { PRICES } from '@/lib/billing';

/** Get the plan (Stripe Checkout) or manage billing (Customer Portal). After Checkout, waits for the webhook. */
export function PlanActions({ planActive, hasCustomer }: { planActive: boolean; hasCustomer: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('checkout') !== 'done') return;
    window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL after hydration
    setConfirming(true);
  }, []);

  // Re-read the plan every 2s (up to 45s) until the webhook has switched it on.
  useEffect(() => {
    if (!confirming || planActive) return;
    const tick = setInterval(() => router.refresh(), 2_000);
    const stop = setTimeout(() => {
      clearInterval(tick);
      setConfirming(false);
    }, 45_000);
    return () => {
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [confirming, planActive, router]);

  async function go(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const { url: next } = await postJson<{ url: string }>(url, body);
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {confirming && !planActive && (
        <p role="status" data-testid="plan-confirming" className="text-sm font-medium">
          Payment received. Confirming your plan with Stripe…
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!planActive && (
          <button type="button" disabled={busy} onClick={() => go('/api/checkout', { kind: 'plan' })} className="btn btn-primary px-3 py-1.5 text-sm">
            Get the annual plan, {PRICES.plan.label}
          </button>
        )}
        {hasCustomer && (
          <button type="button" disabled={busy} onClick={() => go('/api/billing-portal', {})} className="btn btn-secondary px-3 py-1.5 text-sm">
            Manage billing
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
