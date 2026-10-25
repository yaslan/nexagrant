'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import type { PartnerSearchAnnouncementDto } from '@/core/contracts/partner-search';
import { useModuleEnabled } from '@/lib/modules/hooks';

import { isPic, topicPortalUrl } from './model';

/**
 * Adds the announcing organisation to M4 relationships. Handed in by the page
 * (a server action of the relationships route), so M1 never imports M4.
 */
export type AddToRelationships = (input: {
  kind: string;
  organizationId?: string;
  counterpartName?: string;
  notes?: string;
}) => Promise<unknown>;

export interface AnnouncementLinks {
  /** Partner profile route with `:pic` in place of the PIC; links only render with M1 open. */
  partnerHref: string;
  addToRelationships?: AddToRelationships;
}

export const chipClass = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold';
export const actionClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent';

export function useRegionName(): (iso2: string | null) => string {
  const locale = useLocale();
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    names = null;
  }
  return (iso2) => {
    if (!iso2) return '—';
    try {
      return names?.of(iso2.toUpperCase()) ?? iso2;
    } catch {
      return iso2;
    }
  };
}

export function AnnouncementCard({
  announcement: a,
  links,
  showTopic,
}: {
  announcement: PartnerSearchAnnouncementDto;
  links: AnnouncementLinks;
  /** The topic line is noise inside a topic's own box; shown in the cross-topic lists. */
  showTopic: boolean;
}) {
  const t = useTranslations('PartnerSignal');
  const locale = useLocale();
  const regionName = useRegionName();
  const m1 = useModuleEnabled('M1');
  const m4 = useModuleEnabled('M4');
  const [m4State, setM4State] = useState<'idle' | 'adding' | 'added' | 'failed'>('idle');

  const org = a.organization;
  const pic = org.pic && isPic(org.pic) ? org.pic : null;
  const published = a.publishedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(a.publishedAt))
    : null;
  const isRequest = a.type === 'EXPERTISE_REQUEST';

  async function addToM4() {
    if (!links.addToRelationships) return;
    setM4State('adding');
    try {
      await links.addToRelationships({
        kind: 'partner',
        organizationId: pic ?? undefined,
        counterpartName: org.name,
        notes: t('card.m4Note', { topic: a.topicIdentifier }),
      });
      setM4State('added');
    } catch {
      setM4State('failed');
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-4" data-testid="ps-announcement">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="break-words text-sm font-bold text-ink">
            {pic && m1 ? (
              <Link
                href={links.partnerHref.replace(':pic', pic)}
                className="text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                data-testid="ps-org-link"
              >
                {org.name}
              </Link>
            ) : (
              org.name
            )}
          </h4>
          <p className="mt-0.5 text-xs text-ink-2">
            {regionName(org.country)}
            {org.city ? ` · ${org.city}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`${chipClass} ${
              isRequest ? 'border-accent/30 bg-accent/10 text-accent-ink' : 'border-ok/30 bg-ok/10 text-ok'
            }`}
            data-testid="ps-type-chip"
          >
            {isRequest ? t('card.typeRequest') : t('card.typeOffer')}
          </span>
          <span className={`${chipClass} border-border bg-ground text-ink-2`} title={t(`orgTypes.${org.type}`)}>
            {t(`orgTypesShort.${org.type}`)}
          </span>
          {org.isSme && <span className={`${chipClass} border-border bg-ground text-ink-2`}>{t('card.sme')}</span>}
        </div>
      </div>

      {showTopic && <p className="mt-2 break-all font-mono text-[11px] text-muted">{a.topicIdentifier}</p>}

      <p className="mt-2 whitespace-pre-line break-words text-xs leading-relaxed text-ink-2">
        {a.description ?? t('card.noDescription')}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted">
          {published ? t('card.published', { date: published }) : t('card.undated')}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {m4 && links.addToRelationships && (
            <>
              <button
                type="button"
                className={actionClass}
                onClick={addToM4}
                disabled={m4State === 'adding' || m4State === 'added'}
                data-testid="ps-add-m4"
              >
                {m4State === 'adding' ? t('card.addingM4') : m4State === 'added' ? t('card.addedM4') : t('card.addM4')}
              </button>
              <span role="status" aria-live="polite" className="text-[11px] text-rose-700">
                {m4State === 'failed' ? t('card.addM4Error') : ''}
              </span>
            </>
          )}
          <a
            href={topicPortalUrl(a.topicIdentifier)}
            target="_blank"
            rel="noopener noreferrer"
            className={actionClass}
            aria-label={t('card.openPortalAria', { org: org.name })}
            data-testid="ps-open-portal"
          >
            {t('card.openPortal')} ↗
          </a>
        </div>
      </div>
    </li>
  );
}
