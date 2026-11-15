'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useProfile } from '@/app/hooks/useProfile';
import { parseUsAddress } from '@/lib/address';
import { postJson } from '@/lib/api-client';
import { caseChanged } from '@/app/cases/actions';
import { loadProviderAddress } from '@/lib/provider-address-store';
import { clearApprovedLetter, saveApprovedLetter, type ApprovedLetter, type Contact } from '@/lib/approved-letter-store';
import { PLAN_LETTERS_PER_YEAR, PRICES, type PaymentView } from '@/lib/billing';

const EMPTY: Contact = { name: '', addressLine1: '', addressLine2: '', city: '', state: '', zip: '' };

function AddressFields({ legend, value, onChange, testId }: { legend: string; value: Contact; onChange: (c: Contact) => void; testId: string }) {
  const field = (key: keyof Contact, label: string, extra: { className?: string; autoComplete?: string; maxLength?: number } = {}) => (
    <label className={`flex flex-col gap-1 text-sm ${extra.className ?? ''}`}>
      <span className="font-medium">{label}</span>
      <input
        value={value[key] ?? ''}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        autoComplete={extra.autoComplete ?? 'off'}
        maxLength={extra.maxLength}
        className="input"
      />
    </label>
  );
  return (
    <fieldset data-testid={testId} className="card grid grid-cols-6 gap-3 p-4">
      <legend className="px-1 font-semibold">{legend}</legend>
      {field('name', 'Name', { className: 'col-span-6' })}
      {field('addressLine1', 'Street address', { className: 'col-span-6' })}
      {field('addressLine2', 'Suite / apt (optional)', { className: 'col-span-6' })}
      {field('city', 'City', { className: 'col-span-6 sm:col-span-3' })}
      {field('state', 'State', { className: 'col-span-2 sm:col-span-1', maxLength: 2 })}
      {field('zip', 'ZIP', { className: 'col-span-4 sm:col-span-2' })}
    </fieldset>
  );
}

type Letter = Pick<ApprovedLetter, 'draft' | 'original' | 'filled'>;
type Checkout = 'none' | 'done' | 'cancelled';
const CONFIRM_TIMEOUT_MS = 45_000;

/**
 * Confirm addresses and send the approved, filled letter by certified mail (test mode). Sending needs a paid
 * case or a plan letter (checked again by /api/send). Otherwise: pay for this letter or get the plan via Stripe
 * Checkout; the approved letter waits in this tab's sessionStorage, and once the webhook has granted access the
 * letter is sent.
 */
export function SendPanel({
  caseId,
  providerName,
  letter,
  restored,
  payment,
}: {
  caseId: string;
  providerName: string;
  letter: Letter;
  restored?: ApprovedLetter;
  payment: PaymentView | null;
}) {
  const router = useRouter();
  const profile = useProfile();
  const [to, setTo] = useState<Contact>(() => {
    if (restored?.to) return restored.to;
    const found = typeof window === 'undefined' ? null : loadProviderAddress(caseId);
    return { ...EMPTY, ...(found ?? {}), name: providerName };
  });
  const [from, setFrom] = useState<Contact>(
    () => restored?.from ?? { ...EMPTY, ...(parseUsAddress(profile.address) ?? {}), name: profile.name },
  );
  const [busy, setBusy] = useState<null | 'sending' | 'checkout'>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Checkout>('none');
  const [waitedOut, setWaitedOut] = useState(false);
  const autoSent = useRef(false);

  // Coming back from Checkout (?checkout=done|cancelled): note it, then tidy the URL.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('checkout');
    if (value !== 'done' && value !== 'cancelled') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL after hydration
    setCheckout(value);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const canSend = !!payment?.canSend;
  // Paid, but the webhook hasn't granted access yet: re-read the page every 2s until it has.
  useEffect(() => {
    if (checkout !== 'done' || canSend) return;
    const tick = setInterval(() => router.refresh(), 2_000);
    const stop = setTimeout(() => {
      clearInterval(tick);
      setWaitedOut(true);
    }, CONFIRM_TIMEOUT_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [checkout, canSend, router]);

  const clean = (c: Contact) => ({ ...c, addressLine2: c.addressLine2?.trim() || undefined });

  async function send() {
    setBusy('sending');
    setError(null);
    try {
      await postJson('/api/send', { caseId, letterText: letter.filled, to: clean(to), from: clean(from) });
      clearApprovedLetter(caseId);
      // Re-renders this page and refreshes the dashboard; the change is already saved, so a failure here just reloads.
      await caseChanged(caseId).catch(() => window.location.reload());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not send your letter.');
      setBusy(null);
    }
  }

  // "Pay … and send": once payment is confirmed after returning from Checkout, send without another click.
  useEffect(() => {
    if (checkout === 'done' && canSend && restored && !autoSent.current) {
      autoSent.current = true;
      void send();
    }
  });

  async function pay(kind: 'letter' | 'plan') {
    setBusy('checkout');
    setError(null);
    try {
      saveApprovedLetter(caseId, { ...letter, to, from });
      const { url } = await postJson<{ url: string }>('/api/checkout', { kind, caseId });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not start the payment.');
      setBusy(null);
    }
  }

  const confirming = checkout === 'done' && !canSend && !waitedOut;
  return (
    <section aria-label="Send letter" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Where to send it</h2>
      <p className="text-sm text-muted">
        We found the billing address on your bill. Check both addresses before sending.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <AddressFields legend="To (billing office)" value={to} onChange={setTo} testId="send-to" />
        <AddressFields legend="From (you)" value={from} onChange={setFrom} testId="send-from" />
      </div>
      {checkout === 'cancelled' && !canSend && (
        <p role="status" className="text-sm text-muted">Payment cancelled. Your letter is still here when you&apos;re ready.</p>
      )}
      {confirming ? (
        <p role="status" data-testid="payment-confirming" className="text-sm font-medium">
          Payment received. Confirming it with Stripe, then sending your letter…
        </p>
      ) : canSend ? (
        <div className="flex flex-wrap items-center gap-3" data-testid="send-ready">
          <button type="button" onClick={send} disabled={!!busy} className="btn btn-primary">
            {busy === 'sending' ? 'Sending… (about 10 seconds)' : 'Approve and send by certified mail'}
          </button>
          <span className="text-sm text-muted">
            {payment?.via === 'plan'
              ? `Uses 1 of your ${payment.lettersLeft} plan letter${payment.lettersLeft === 1 ? '' : 's'} left.`
              : 'Paid for this letter.'}{' '}
            Test mode: nothing is printed or mailed.
          </span>
        </div>
      ) : (
        <div className="card flex flex-col gap-3 p-4" data-testid="paywall">
          <p className="text-sm">
            {waitedOut
              ? "We haven't had the payment confirmation yet. Reload the page in a minute; you won't be charged twice."
              : payment?.message ?? `Sending a certified letter costs ${PRICES.letter.label}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pay('letter')} disabled={!!busy} className="btn btn-primary">
              {busy === 'checkout' ? 'Opening checkout…' : `Pay ${PRICES.letter.label} and send`}
            </button>
            {!payment?.planActive && (
              <button type="button" onClick={() => pay('plan')} disabled={!!busy} className="btn btn-secondary">
                Get the annual plan, {PRICES.plan.label}
              </button>
            )}
          </div>
          <p className="text-xs text-muted">
            Plan: {PLAN_LETTERS_PER_YEAR} certified letters a year, cancel any time. Test mode: use card 4242 4242 4242 4242;
            no real charge.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
