'use client';

import { useState } from 'react';
import { useHydrated } from '@/app/hooks/useHydrated';
import { useProfile } from '@/app/hooks/useProfile';
import { isProfileEmpty, saveProfile, type Profile } from '@/lib/profile';

const FIELDS: Array<{ key: keyof Profile; label: string; type?: string; placeholder?: string; autoComplete: string }> = [
  { key: 'name', label: 'Full name', placeholder: 'As it appears on your bill', autoComplete: 'name' },
  { key: 'dateOfBirth', label: 'Date of birth', type: 'date', autoComplete: 'bday' },
  { key: 'memberId', label: 'Insurance member ID', placeholder: 'From your insurance card', autoComplete: 'off' },
  { key: 'address', label: 'Mailing address', placeholder: 'Street, City, State ZIP', autoComplete: 'street-address' },
];

export function ProfileForm() {
  const profile = useProfile();
  const hydrated = useHydrated();
  const empty = isProfileEmpty(profile);
  const [message, setMessage] = useState<string | null>(null);
  // null = not chosen by the user yet: open while there are no saved details, collapsed once there are.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);

  return (
    <details
      data-testid="profile-form"
      data-ready={hydrated || undefined}
      open={userOpen ?? empty}
      onToggle={(e) => setUserOpen(e.currentTarget.open)}
      className="rounded-xl border border-neutral-300 p-4 dark:border-neutral-700">
      <summary className="cursor-pointer font-semibold">
        Your details{' '}
        <span className="font-normal text-neutral-600 dark:text-neutral-400">
          {empty ? '(add them so we can remove them from your documents)' : `(saved on this device: ${profile.name || 'no name'})`}
        </span>
      </summary>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        These stay in this browser. We use them to remove your personal details before anything is sent, and to fill in
        your letter when you approve it.
      </p>
      <form
        // Re-mount when the stored profile changes so the inputs show the saved values.
        key={JSON.stringify(profile)}
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const next = Object.fromEntries(FIELDS.map(({ key }) => [key, String(data.get(key) ?? '').trim()])) as Profile;
          setUserOpen(true); // keep the confirmation in view
          setMessage(saveProfile(next) ? 'Saved on this device.' : "Your browser blocked saving. Your details will be used for this visit only.");
        }}
      >
        {FIELDS.map(({ key, label, type, placeholder, autoComplete }) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{label}</span>
            <input
              name={key}
              type={type ?? 'text'}
              defaultValue={profile[key]}
              placeholder={placeholder}
              autoComplete={autoComplete}
              className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
        ))}
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
            Save details
          </button>
          {!empty && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => {
                saveProfile(null);
                setMessage('Removed from this device.');
              }}
            >
              Clear
            </button>
          )}
          {message && (
            <span role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
              {message}
            </span>
          )}
        </div>
      </form>
    </details>
  );
}
