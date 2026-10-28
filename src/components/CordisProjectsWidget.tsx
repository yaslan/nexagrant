'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { CORDIS_SEARCH_URL, CORDIS_WIDGET_MESSAGE_TYPE, CORDIS_WIDGET_TIMEOUT_MS } from '@/lib/cordis-widget';

/**
 * No `allow-same-origin` — ever (K-573263). The framed document gets an opaque
 * origin: CORDIS's scripts cannot reach this page, our storage or our API with the
 * visitor's cookies. Popups so a project link opens CORDIS in a normal tab.
 */
export const CORDIS_IFRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';

/** The embed reports its height; keep the frame between the box's min-height and this. */
const MAX_FRAME_HEIGHT = 4000;

interface CordisProjectsWidgetProps {
  /** `/<locale>/embed/cordis`, or null when there is no widget key. */
  src: string | null;
  labels: { frameTitle: string; loading: string; fallback: string; fallbackLink: string };
}

type Status = 'loading' | 'ready' | 'fallback';

/**
 * CORDIS's widget in a sandboxed iframe, or a link to the same search when it
 * cannot show: no key, the loader fails inside the frame, or no result table within
 * CORDIS_WIDGET_TIMEOUT_MS of the frame loading — an invalid key renders an error
 * paragraph instead of the table, so it lands here too. The frame tells us it is
 * ready (and how tall it is) by postMessage. The box keeps its min-height in every
 * state, so the page does not jump when the table or the link replaces the loading line.
 */
export default function CordisProjectsWidget({ src, labels }: CordisProjectsWidgetProps) {
  const [status, setStatus] = useState<Status>(src ? 'loading' : 'fallback');
  const [height, setHeight] = useState<number | null>(null);
  // The frame is created after hydration, so its load event always reaches onLoad.
  const mounted = useIsHydrated();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!src) return;
    const onMessage = (event: MessageEvent) => {
      // Only our own frame, and it has an opaque origin: anything else is ignored.
      if (event.source !== frameRef.current?.contentWindow || event.origin !== 'null') return;
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null) return;
      const { type, status: reported, height: reportedHeight } = data as Record<string, unknown>;
      if (type !== CORDIS_WIDGET_MESSAGE_TYPE) return;
      if (reported === 'error') {
        window.clearTimeout(timerRef.current);
        setStatus((s) => (s === 'loading' ? 'fallback' : s));
      } else if (reported === 'ready') {
        window.clearTimeout(timerRef.current);
        setStatus((s) => (s === 'fallback' ? s : 'ready'));
        if (typeof reportedHeight === 'number' && Number.isFinite(reportedHeight)) {
          setHeight(Math.min(Math.ceil(reportedHeight), MAX_FRAME_HEIGHT));
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timerRef.current);
    };
  }, [src]);

  const onFrameLoad = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'fallback' : s));
    }, CORDIS_WIDGET_TIMEOUT_MS);
  };

  return (
    <div
      className="relative min-h-[28rem] min-w-0 bg-surface border border-border rounded-2xl shadow-xs overflow-hidden"
      aria-busy={status === 'loading'}
      data-testid="cordis-projects"
      data-status={status}
    >
      {src && mounted && status !== 'fallback' && (
        <iframe
          ref={frameRef}
          src={src}
          title={labels.frameTitle}
          sandbox={CORDIS_IFRAME_SANDBOX}
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          onLoad={onFrameLoad}
          // CORDIS's stylesheet is light-only: the frame stays white in the dark theme too.
          // 28rem less the box's 1px borders, so the box is 28rem tall whatever it shows.
          data-testid="cordis-projects-frame"
          className="block w-full min-h-[calc(28rem-2px)] border-0 bg-white"
          style={height ? { height } : undefined}
        />
      )}

      {status === 'loading' && (
        <p role="status" className="absolute inset-0 flex items-center justify-center p-6 text-xs text-muted bg-surface">
          {labels.loading}
        </p>
      )}

      {status === 'fallback' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="max-w-md text-sm text-ink-2">{labels.fallback}</p>
          <a
            href={CORDIS_SEARCH_URL}
            data-testid="cordis-projects-fallback"
            className="inline-flex min-h-11 items-center gap-2 bg-accent hover:bg-accent/90 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-2xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span>{labels.fallbackLink}</span>
            <span aria-hidden="true">→</span>
          </a>
        </div>
      )}
    </div>
  );
}
