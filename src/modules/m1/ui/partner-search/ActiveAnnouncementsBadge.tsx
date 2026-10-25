'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { createBadgeLoader, type BadgeLoader } from './badge-loader';
import { isPic, readListResponse } from './model';

/** One loader per page load, shared by every badge in the table. */
let loader: BadgeLoader | null = null;

function sharedLoader(): BadgeLoader {
  loader ??= createBadgeLoader(async (pic) => {
    const res = await fetch(`/api/organizations/${pic}/announcements?page=1`, { headers: { accept: 'application/json' } });
    const result = readListResponse(res.status, await res.json().catch(() => null));
    if (result.kind === 'quota') return { total: 0, metered: true };
    if (result.kind !== 'ok') return null;
    return { total: result.page.meta.total, metered: result.page.meta.quota !== undefined };
  });
  return loader;
}

/** "Has an active announcement (N)" next to an organisation in the M1 table (FO-62, card item 3). */
export function ActiveAnnouncementsBadge({ pic }: { pic: string }) {
  const t = useTranslations('PartnerSignal');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isPic(pic)) return;
    let live = true;
    void sharedLoader()
      .load(pic)
      .then((n) => {
        if (live) setCount(n);
      });
    return () => {
      live = false;
    };
  }, [pic]);

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
