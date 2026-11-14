'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useProfile } from '@/app/hooks/useProfile';
import { parseUsAddress, type UsAddress } from '@/lib/address';
import { postJson } from '@/lib/api-client';
import { loadProviderAddress } from '@/lib/provider-address-store';

type Contact = UsAddress & { name: string };
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
        className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
    </label>
  );
  return (
    <fieldset data-testid={testId} className="grid grid-cols-6 gap-3 rounded-xl border border-neutral-300 p-4 dark:border-neutral-700">
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

/** Confirm addresses and send the approved, filled letter by certified mail (test mode). */
export function SendPanel({ caseId, providerName, filledLetter }: { caseId: string; providerName: string; filledLetter: string }) {
  const router = useRouter();
  const profile = useProfile();
  const [to, setTo] = useState<Contact>(() => {
    const found = typeof window === 'undefined' ? null : loadProviderAddress(caseId);
    return { ...EMPTY, ...(found ?? {}), name: providerName };
  });
  const [from, setFrom] = useState<Contact>(() => ({ ...EMPTY, ...(parseUsAddress(profile.address) ?? {}), name: profile.name }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    const clean = (c: Contact) => ({ ...c, addressLine2: c.addressLine2?.trim() || undefined });
    try {
      await postJson('/api/send', { caseId, letterText: filledLetter, to: clean(to), from: clean(from) });
      router.refresh(); // the review page re-renders with the "sent" panel
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not send your letter.');
      setSending(false);
    }
  }

  return (
    <section aria-label="Send letter" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Where to send it</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        We found the billing address on your bill. Check both addresses before sending.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <AddressFields legend="To (billing office)" value={to} onChange={setTo} testId="send-to" />
        <AddressFields legend="From (you)" value={from} onChange={setFrom} testId="send-from" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="rounded-lg bg-blue-700 px-5 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {sending ? 'Sending… (about 10 seconds)' : 'Approve and send by certified mail'}
        </button>
        <span className="text-sm text-neutral-600 dark:text-neutral-400">Test mode: nothing is printed or mailed.</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
