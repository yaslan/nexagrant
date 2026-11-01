'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Wall-clock milliseconds, re-read every `intervalMs`; `null` until the first client render.
 *
 * Reading `Date.now()` straight from a component body is an impure render
 * (`react-hooks/purity`): the output silently depends on when React happened to run, and
 * nothing re-renders when the answer changes — a countdown or an expiry check computed that
 * way freezes at whatever value the last unrelated render produced.
 *
 * The clock is an external store, so it is subscribed to like one. The snapshot is floored to
 * the interval so it is stable between ticks — `getSnapshot` has to return the same value on
 * repeated calls within a render or React re-renders forever. `null` is the server snapshot
 * because the server's clock is not the viewer's; callers treat it as "not known yet" and
 * fall back to whatever is safe before the first tick.
 */
export function useNow(intervalMs: number): number | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const id = setInterval(onStoreChange, intervalMs);
      return () => clearInterval(id);
    },
    [intervalMs],
  );

  const getSnapshot = useCallback(
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    [intervalMs],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
