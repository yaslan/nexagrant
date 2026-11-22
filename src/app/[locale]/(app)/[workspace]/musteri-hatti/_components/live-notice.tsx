'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Page-level notice line for the pipeline and tasks screens (NG-135 / F3, round-4 finding 1).
 * `router.refresh()` after a stage move or a task toggle re-renders the card, and a notice kept
 * inside that card is lost with it. The notice lives here instead: the provider sits above the
 * cards, so it survives the refresh. The region is always mounted, so screen readers hear it.
 */

export type LiveNotice = { kind: 'ok' | 'err'; text: string } | null;

interface LiveNoticeValue {
  notice: LiveNotice;
  announce: (notice: LiveNotice) => void;
}

const LiveNoticeContext = createContext<LiveNoticeValue | null>(null);

export function LiveNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<LiveNotice>(null);
  const value = useMemo(() => ({ notice, announce: setNotice }), [notice]);
  return (
    <LiveNoticeContext.Provider value={value}>
      <div aria-live="polite" className={notice?.kind === 'err' ? 'text-sm text-red-700' : 'text-sm text-emerald-700'}>
        {notice?.text ?? ''}
      </div>
      {children}
    </LiveNoticeContext.Provider>
  );
}

export function useLiveNotice(): LiveNoticeValue {
  const value = useContext(LiveNoticeContext);
  if (!value) throw new Error('useLiveNotice must be used inside LiveNoticeProvider');
  return value;
}
