'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import type { PartnerSignal } from '@/core/contracts/partner-search';

import { AnnouncementBrowser, Attribution } from './AnnouncementBrowser';
import { useRegionName, type AnnouncementLinks } from './AnnouncementCard';
import { readSignal, topCountries } from './model';
import { PartnerSearchBoundary } from './PartnerSearchBoundary';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; signal: PartnerSignal }
  | { kind: 'upgrade' }
  | { kind: 'hidden' }
  | { kind: 'error' };

/**
 * "Partner signal" of one topic on the call detail page (FO-62, card item 1).
 *
 * The signal endpoint counts only and is never metered, so it loads with the
 * page; the announcement list (a metered read on Discover/Basic) loads only
 * when the user opens it.
 */
export function PartnerSignalBox(props: { topicIdentifier: string; links: AnnouncementLinks; upgradeHref: string }) {
  return (
    <PartnerSearchBoundary>
      <SignalBox {...props} />
    </PartnerSearchBoundary>
  );
}

function SignalBox({
  topicIdentifier,
  links,
  upgradeHref,
}: {
  topicIdentifier: string;
  links: AnnouncementLinks;
  upgradeHref: string;
}) {
  const t = useTranslations('PartnerSignal');
  const regionName = useRegionName();
  const listId = useId();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/topics/${encodeURIComponent(topicIdentifier)}/partner-signal`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        const body: unknown = await res.json().catch(() => null);
        const reason = body && typeof body === 'object' && 'reason' in body ? body.reason : undefined;
        const signal = res.ok ? readSignal(body) : null;
        if (signal) setState({ kind: 'ready', signal });
        else if (res.ok) setState({ kind: 'error' });
        else if (res.status === 403 && reason === 'PLAN_UPGRADE_REQUIRED') setState({ kind: 'upgrade' });
        // Switched off, role without access, or a topic id the API refuses: nothing to say here.
        else if (res.status === 403 || res.status === 401 || res.status === 400) setState({ kind: 'hidden' });
        else setState({ kind: 'error' });
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      }
    })();
    return () => controller.abort();
  }, [topicIdentifier]);

  if (state.kind === 'hidden') return null;

  return (
    <section
      aria-labelledby={`${listId}-title`}
      className="mt-8 rounded-xl border border-border bg-ground/50 p-4 sm:p-5"
      data-testid="partner-signal-box"
    >
      <h2 id={`${listId}-title`} className="text-base font-bold text-ink sm:text-lg">
        {t('box.title')}
      </h2>

      <div aria-live="polite" className="mt-2">
        {state.kind === 'loading' && <p className="text-xs text-muted">{t('box.loading')}</p>}
        {state.kind === 'error' && <p className="text-xs text-rose-700">{t('box.error')}</p>}
        {state.kind === 'upgrade' && (
          <p className="text-xs text-ink-2" data-testid="partner-signal-upgrade">
            {t('box.locked')}{' '}
            <Link href={upgradeHref} className="font-bold text-accent underline focus-visible:outline-2 focus-visible:outline-accent">
              {t('list.upgradeCta')}
            </Link>
          </p>
        )}
        {state.kind === 'ready' && <SignalSummary signal={state.signal} regionName={regionName} />}
      </div>

      {state.kind === 'ready' && state.signal.total > 0 && (
        <>
          <button
            type="button"
            className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent/40 bg-surface px-3 py-1.5 text-xs font-semibold text-accent hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
            aria-expanded={open}
            aria-controls={`${listId}-list`}
            onClick={() => setOpen((v) => !v)}
            data-testid="partner-signal-toggle"
          >
            {open ? t('box.hide') : t('box.show')}
          </button>
          {open && (
            <div id={`${listId}-list`} className="mt-4">
              <AnnouncementBrowser topic={topicIdentifier} links={links} upgradeHref={upgradeHref} />
            </div>
          )}
        </>
      )}

      {(state.kind !== 'ready' || state.signal.total === 0 || !open) && (
        <div className="mt-3">
          <Attribution />
        </div>
      )}
    </section>
  );
}

function SignalSummary({ signal, regionName }: { signal: PartnerSignal; regionName: (c: string | null) => string }) {
  const t = useTranslations('PartnerSignal');
  const locale = useLocale();
  if (signal.total === 0) {
    return (
      <p className="text-xs text-ink-2" data-testid="partner-signal-empty">
        {t('box.empty')}
      </p>
    );
  }
  const countries = topCountries(signal.byCountry);
  const list = countryList(
    countries.map((c) => `${regionName(c.country)} (${new Intl.NumberFormat(locale).format(c.count)})`),
    locale
  );
  return (
    <div className="space-y-1">
      <p className="text-sm text-ink" data-testid="partner-signal-summary">
        {t('box.summary', { total: signal.total, requests: signal.requests, offers: signal.offers })}
        {signal.trCount > 0 && <> · {t('box.fromTurkey', { count: signal.trCount })}</>}
      </p>
      {countries.length > 0 && (
        <p className="text-xs text-ink-2">
          {t('box.topCountries', { list })}
        </p>
      )}
    </div>
  );
}

/** "Germany (5), Belgium (3) and Türkiye (3)", in the UI language. */
function countryList(items: string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}
