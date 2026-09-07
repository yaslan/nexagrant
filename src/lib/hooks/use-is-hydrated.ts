'use client';

import { useSyncExternalStore } from 'react';

/** A store that never changes, so React never has to resubscribe or re-read on its account. */
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * `false` on the server and through the hydration pass, `true` from the first
 * client-only render onwards.
 *
 * The usual spelling of this is `useState(false)` plus `useEffect(() => setMounted(true), [])`,
 * which React 19 flags (`react-hooks/set-state-in-effect`): it commits one render, then
 * immediately schedules a second one from the effect body — a cascading render on every mount
 * of every component that guards its markup this way.
 *
 * `useSyncExternalStore` expresses the same thing as what it actually is: a value the server
 * and the client disagree about. React reads `getServerSnapshot` while rendering on the server
 * and while hydrating, then switches to `getClientSnapshot`, so the hydrated HTML still matches
 * the server output without a state update driving it.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
