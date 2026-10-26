'use client';

import Script from 'next/script';
import React, { useEffect, useRef, useState } from 'react';
import {
  CORDIS_PROJECT_COUNT,
  CORDIS_PROJECT_QUERY,
  CORDIS_PROJECT_SORT,
  CORDIS_SEARCH_URL,
  CORDIS_WIDGET_CSS_URL,
  CORDIS_WIDGET_LOADER_URL,
  CORDIS_WIDGET_TIMEOUT_MS,
} from '@/lib/cordis-widget';

const TARGET_ID = 'cordis-projects-widget';

/** Globals CORDIS's widgetManagement.js defines once the loader has run. */
type CordisWindow = Window & {
  runWidget?: (action: string, target: string, prefix: string, rootUrl: string, config: string) => void;
};

/**
 * The loader is an IIFE: it renders once, when its script first executes. Next's
 * <Script> loads it once per page load, so after a client-side navigation back to
 * this page the target is empty and the widget has to be asked to render again.
 */
let loaderHasRun = false;

function rerunWidget() {
  const w = window as CordisWindow;
  const tag = document.querySelector<HTMLScriptElement>(`script[src="${CORDIS_WIDGET_LOADER_URL}"]`);
  const rootUrl = tag?.dataset.rootUrl;
  if (!w.runWidget || !tag || !rootUrl) return; // the timeout shows the fallback
  w.runWidget('run', TARGET_ID, '', rootUrl, JSON.stringify(tag.dataset));
}

interface CordisProjectsWidgetProps {
  apiKey: string | null;
  lang: string;
  nonce?: string;
  labels: { loading: string; fallback: string; fallbackLink: string };
}

type Status = 'loading' | 'ready' | 'fallback';

/**
 * CORDIS's widget, or a link to the same search when it cannot show: no key, the
 * script fails to load (blocked, offline), or no result table within
 * CORDIS_WIDGET_TIMEOUT_MS — an invalid key renders an error paragraph instead of
 * the table, so it lands here too. The box keeps its min-height in every state, so
 * the page does not jump when the table or the link replaces the loading line.
 */
export default function CordisProjectsWidget({ apiKey, lang, nonce, labels }: CordisProjectsWidgetProps) {
  const [status, setStatus] = useState<Status>(apiKey ? 'loading' : 'fallback');
  const targetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!apiKey || !target) return;
    // The "table" is CORDIS's `div.SearchResult` (display: table in its CSS);
    // an invalid key comes back as a bare error paragraph instead.
    const hasTable = () => target.querySelector('.SearchResult') !== null;
    if (hasTable()) {
      setStatus('ready');
      return;
    }
    const observer = new MutationObserver(() => {
      if (!hasTable()) return;
      observer.disconnect();
      window.clearTimeout(timer);
      setStatus('ready');
    });
    observer.observe(target, { childList: true, subtree: true });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      setStatus((s) => (s === 'loading' ? 'fallback' : s));
    }, CORDIS_WIDGET_TIMEOUT_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [apiKey]);

  return (
    <div
      className="relative min-h-[28rem] min-w-0 bg-surface border border-border rounded-2xl shadow-xs"
      aria-busy={status === 'loading'}
      data-testid="cordis-projects"
      data-status={status}
    >
      {/* CORDIS writes its table in here; it scrolls sideways on its own on narrow screens. */}
      <div
        id={TARGET_ID}
        ref={targetRef}
        hidden={status === 'fallback'}
        className="max-w-full overflow-x-auto p-4 sm:p-6 text-sm text-ink"
      />

      {status === 'loading' && (
        <p role="status" className="absolute inset-0 flex items-center justify-center p-6 text-xs text-muted">
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

      {apiKey && (
        <Script
          id="cordis-widget-loader"
          src={CORDIS_WIDGET_LOADER_URL}
          strategy="afterInteractive"
          nonce={nonce}
          data-output="table"
          data-detailledView="on"
          data-target={TARGET_ID}
          data-css={CORDIS_WIDGET_CSS_URL}
          data-query={CORDIS_PROJECT_QUERY}
          data-nbi={String(CORDIS_PROJECT_COUNT)}
          data-sort={CORDIS_PROJECT_SORT}
          data-type="search-html"
          data-lv={lang}
          data-apikey={apiKey}
          onReady={() => {
            if (loaderHasRun) rerunWidget();
            loaderHasRun = true;
          }}
          onError={() => setStatus('fallback')}
        />
      )}
    </div>
  );
}
