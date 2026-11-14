'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { PROFILE_CHANGED_EVENT, parseProfile, readStoredProfile, type Profile } from '@/lib/profile';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange); // other tabs
  window.addEventListener(PROFILE_CHANGED_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(PROFILE_CHANGED_EVENT, onChange);
  };
}

/** The saved profile. Empty on the server and on first render, then the stored value. */
export function useProfile(): Profile {
  const raw = useSyncExternalStore(subscribe, readStoredProfile, () => null);
  return useMemo(() => parseProfile(raw), [raw]);
}
