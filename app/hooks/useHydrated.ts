'use client';

import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/** false during server render and hydration, true once React runs in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
