'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { PartnerSearchAnnouncementDto } from '@/core/contracts/partner-search';

import { Attribution } from './AnnouncementBrowser';
import { AnnouncementCard, type AnnouncementLinks } from './AnnouncementCard';
import { isPic, keywordSnapshot, readListResponse } from './model';
import { PartnerSearchBoundary } from './PartnerSearchBoundary';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: PartnerSearchAnnouncementDto[]; total: number }
  | { kind: 'error' }
  | { kind: 'hidden' };

/**
 * "Published announcements" on an M1 organisation profile (FO-62, card item 3),
 * with the keywords the organisation used in them. First page only (20 rows):
 * the busiest organisation on the portal has far fewer live announcements.
 */
export function OrganizationAnnouncements(props: { pic: string; links: AnnouncementLinks }) {
  return (
    <PartnerSearchBoundary>
      <Announcements {...props} />
    </PartnerSearchBoundary>
  );
}

function Announcements({ pic, links }: { pic: string; links: AnnouncementLinks }) {
  const t = useTranslations('PartnerSignal');
  const titleId = useId();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!isPic(pic)) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/organizations/${pic}/announcements?page=1`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        const result = readListResponse(res.status, await res.json().catch(() => null));
        if (result.kind === 'ok') setState({ kind: 'ready', rows: result.page.data, total: result.page.meta.total });
        else if (result.kind === 'denied' || result.kind === 'quota') setState({ kind: 'hidden' });
        else setState({ kind: 'error' });
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      }
    })();
    return () => controller.abort();
  }, [pic]);

  if (!isPic(pic) || state.kind === 'hidden') return null;
  const keywords = state.kind === 'ready' ? keywordSnapshot(state.rows) : [];

  return (
    <section aria-labelledby={titleId} className="mb-8" data-testid="org-announcements">
      <h2 id={titleId} className="mb-4 text-lg font-bold font-heading text-ink">
        {t('profile.title')}
        {state.kind === 'ready' && state.total > 0 && (
          <span className="ml-2 text-sm font-semibold text-muted">({state.total})</span>
        )}
      </h2>
      <div aria-live="polite">
        {state.kind === 'loading' && <p className="text-xs text-muted">{t('list.loading')}</p>}
        {state.kind === 'error' && <p className="text-xs text-rose-700">{t('list.error')}</p>}
        {state.kind === 'ready' && state.rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted" data-testid="org-announcements-empty">
            {t('profile.empty')}
          </p>
        )}
      </div>
      {keywords.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t('profile.keywords')}</h3>
          <ul className="flex flex-wrap gap-1.5" data-testid="org-announcement-keywords">
            {keywords.map((kw) => (
              <li key={kw} className="rounded-full border border-border bg-ground px-2.5 py-0.5 text-[11px] text-ink-2">
                {kw}
              </li>
            ))}
          </ul>
        </div>
      )}
      {state.kind === 'ready' && state.rows.length > 0 && (
        <ul className="space-y-3">
          {state.rows.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} links={links} showTopic />
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Attribution />
      </div>
    </section>
  );
}
