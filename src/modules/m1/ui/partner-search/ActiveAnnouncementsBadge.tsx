'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { createBadgeLoader, scopedLoader } from './badge-loader';
import { PartnerSearchBoundary } from './PartnerSearchBoundary';
import { isPic, readListResponse } from './model';

const loaderFor = scopedLoader(() =>
  createBadgeLoader(async (pic) => {
    const res = await fetch(`/api/organizations/${pic}/announcements?page=1`, { headers: { accept: 'application/json' } });
    const result = readListResponse(res.status, await res.json().catch(() => null));
    return result.kind === 'ok' ? result.page.meta.total : null;
  })
);

/**
 * "Has an active announcement (N)" next to an organisation in the M1 table
 * (FO-62, card item 3). The page renders it on unmetered plans only: on a
 * metered plan each badge would spend one of the month's list queries.
 */
export function ActiveAnnouncementsBadge(props: { pic: string; scope: string }) {
  return (
    <PartnerSearchBoundary fallback={null}>
      <Badge {...props} />
    </PartnerSearchBoundary>
  );
}

function Badge({ pic, scope }: { pic: string; scope: string }) {
  const t = useTranslations('PartnerSignal');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isPic(pic)) return;
    let live = true;
    void loaderFor(scope)
      .load(pic)
      .then((n) => {
        if (live) setCount(n);
      });
    return () => {
      live = false;
    };
  }, [pic, scope]);

  if (!count) return null;
  return (
    <span
      className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-800"
      title={t('badge.title')}
      data-testid="ps-active-badge"
    >
      {t('badge.label', { count })}
    </span>
  );
}
