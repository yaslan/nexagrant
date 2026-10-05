'use client';

import { useSyncExternalStore } from 'react';

/** No-op subscribe: the "am I in the browser" answer never changes after mount. */
const noopSubscribe = () => () => {};

/**
 * A deadline on the viewer's own clock.
 *
 * CLAUDE.md rule 10 wants both readings side by side: the call's published
 * ("official") time and the user's local time. The official line is rendered on
 * the server — it is the same for every visitor — while this one can only be
 * computed in the browser, so it appears after hydration. The server has no
 * viewer timezone, and printing a guessed one would state a wrong deadline.
 *
 * `useSyncExternalStore` is the hydration-safe way to say "server snapshot is
 * false, client snapshot is true": the server markup and the first client
 * render agree, and React swaps in the local time on the commit after.
 */
export default function LocalDeadline({
  iso,
  locale,
  label,
}: {
  iso: string;
  locale: string;
  label: string;
}) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

  if (!isClient) return null;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatted = new Date(iso).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-xs">{`${formatted} (${tz})`}</span>
    </div>
  );
}
