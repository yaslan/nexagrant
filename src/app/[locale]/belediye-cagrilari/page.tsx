import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import { toDecimalString } from '@/lib/money';
import {
  PUBLIC_SECTOR_ORG_TYPES,
  PUBLIC_SECTOR_PROGRAMMES,
  getPublicSectorProgramme,
  type GrantRange,
  type PublicOrgType,
  type PublicSectorProgramme,
} from '@/lib/public-sector/catalog';
import {
  RECENTLY_CLOSED_DAYS,
  listPublicSectorCalls,
  type PublicSectorCall,
} from '@/lib/public-sector/radar';
import LocalDeadline from '../calls/turkey/local-deadline';
import FitCheck from './fit-check';

/** Deadlines move daily and the org-type filter is a query param. */
export const dynamic = 'force-dynamic';

type Translate = Awaited<ReturnType<typeof getTranslations<'publicSectorCalls'>>>;

function pagePath(locale: string): string {
  return locale === 'tr' ? `/${locale}/belediye-cagrilari` : `/${locale}/municipal-calls`;
}

function readinessPath(locale: string): string {
  return locale === 'tr' ? `/${locale}/fon-hazirlik` : `/${locale}/funding-readiness`;
}

function intlLocale(locale: string): string {
  return locale === 'tr' ? 'tr-TR' : 'en-GB';
}

function parseOrgType(value: string | string[] | undefined): PublicOrgType {
  const v = Array.isArray(value) ? value[0] : value;
  return (PUBLIC_SECTOR_ORG_TYPES as readonly string[]).includes(v ?? '')
    ? (v as PublicOrgType)
    : 'municipality';
}

/** Whole euros from minor units, through src/lib/money.ts (rule 9). */
function formatEur(cents: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(toDecimalString(cents, 'EUR')));
}

function grantText(range: GrantRange | null, locale: string, t: Translate): string | null {
  if (!range || range.minCents === null) return null;
  const min = formatEur(range.minCents, locale);
  return range.maxCents === null
    ? t('grant_min', { min })
    : t('grant_range', { min, max: formatEur(range.maxCents, locale) });
}

function cofinancingText(pct: number | null, t: Translate): string {
  if (pct === null) return t('cofinancing_unknown');
  if (pct === 0) return t('cofinancing_none');
  return t('cofinancing_pct', { pct });
}

const TURKEY_BADGE: Record<PublicSectorProgramme['turkeyEligibility'], string> = {
  eligible: 'bg-ok/15 text-ok border-ok/30',
  partial: 'bg-amber/15 text-ink border-amber/40',
  check_call: 'bg-amber/15 text-ink border-amber/40',
  not_eligible: 'bg-bad/15 text-bad border-bad/30',
};

const PHASE_BADGE: Record<PublicSectorCall['phase'], string> = {
  open: 'bg-ok/15 text-ok border-ok/30',
  forthcoming: 'bg-accent/15 text-accent-ink border-accent/30',
  recently_closed: 'bg-surface text-muted border-border',
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function ProgrammeFacts({
  programme,
  locale,
  t,
}: {
  programme: PublicSectorProgramme;
  locale: string;
  t: Translate;
}) {
  const grant = grantText(programme.typicalGrantEur, locale, t);
  const source = programme.sourceNote[0];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className="bg-surface text-ink border-border">
        {t('difficulty_label')}: {t(`difficulty.${programme.difficulty}`)}
      </Badge>
      <Badge className="bg-surface text-ink border-border">{cofinancingText(programme.cofinancingPct, t)}</Badge>
      <Badge className={TURKEY_BADGE[programme.turkeyEligibility]}>{t(`turkey.${programme.turkeyEligibility}`)}</Badge>
      {grant && <span className="text-xs text-muted">{grant}</span>}
      {source && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted underline underline-offset-2"
        >
          {t('source')}
        </a>
      )}
    </div>
  );
}

function OfficialDeadline({ call, locale, t }: { call: PublicSectorCall; locale: string; t: Translate }) {
  if (!call.nextDeadlineAt) {
    return <p className="text-sm text-muted">{t('deadline_none')}</p>;
  }
  const official = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: call.deadlineTz,
  }).format(new Date(call.nextDeadlineAt));
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between gap-3">
        <span className="text-muted">{t('deadline_official', { tz: call.deadlineTz })}</span>
        <time className="font-mono text-xs font-semibold" dateTime={call.nextDeadlineAt}>
          {official}
        </time>
      </div>
      <LocalDeadline iso={call.nextDeadlineAt} locale={locale} label={t('deadline_local')} />
    </div>
  );
}

function CallCard({ call, locale, t }: { call: PublicSectorCall; locale: string; t: Translate }) {
  const programme = getPublicSectorProgramme(call.programme.key);
  if (!programme) return null;
  return (
    <article
      className="space-y-3 rounded-xl border border-border bg-surface p-5"
      data-testid="radar-call"
      data-programme={programme.key}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={PHASE_BADGE[call.phase]}>{t(`phase.${call.phase}`)}</Badge>
        <span className="text-xs font-semibold text-accent-ink">{call.programme.name}</span>
      </div>
      <div>
        <h3 className="text-base font-bold text-ink">{call.title}</h3>
        <p className="mt-0.5 font-mono text-xs text-muted">{call.identifier}</p>
      </div>
      <ProgrammeFacts programme={programme} locale={locale} t={t} />
      <OfficialDeadline call={call} locale={locale} t={t} />
      {programme.turkeyEligibility === 'not_eligible' ? (
        <p className="rounded-md border border-bad/30 bg-bad/10 p-3 text-xs text-ink">{t('not_eligible_note')}</p>
      ) : (
        <FitCheck
          requirements={programme}
          readinessHref={readinessPath(locale)}
          idPrefix={`fit-${call.identifier}`}
        />
      )}
      <a
        href={call.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-sm font-semibold text-accent-ink underline underline-offset-2"
      >
        {t('view_call')}
      </a>
    </article>
  );
}

/** Recently closed rounds, one line per programme — 24 LIFE topics are one fact. */
function ClosedGroups({ calls, locale, t }: { calls: PublicSectorCall[]; locale: string; t: Translate }) {
  const groups = new Map<string, PublicSectorCall[]>();
  for (const c of calls) groups.set(c.programme.key, [...(groups.get(c.programme.key) ?? []), c]);
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeZone: 'Europe/Brussels' });
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {[...groups.entries()].map(([key, items]) => {
        const programme = getPublicSectorProgramme(key);
        const latest = items[0];
        if (!programme || !latest) return null;
        return (
          <article
            key={key}
            className="space-y-3 rounded-xl border border-border bg-surface p-5"
            data-testid="radar-closed"
            data-programme={key}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={PHASE_BADGE.recently_closed}>{t('phase.recently_closed')}</Badge>
              <span className="text-sm font-bold text-ink">{latest.programme.name}</span>
            </div>
            <p className="text-xs text-muted">
              {t('closed_group', {
                count: items.length,
                date: latest.nextDeadlineAt ? fmt.format(new Date(latest.nextDeadlineAt)) : t('deadline_none'),
              })}
            </p>
            <ul className="space-y-1">
              {items.slice(0, 4).map((c) => (
                <li key={c.identifier} className="text-xs">
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-accent-ink underline underline-offset-2"
                  >
                    {c.identifier}
                  </a>
                </li>
              ))}
            </ul>
            <ProgrammeFacts programme={programme} locale={locale} t={t} />
            {programme.turkeyEligibility === 'not_eligible' && (
              <p className="rounded-md border border-bad/30 bg-bad/10 p-3 text-xs text-ink">{t('not_eligible_note')}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'publicSectorCalls' });
  return {
    title: t('meta_title'),
    description: t('meta_description'),
    alternates: { canonical: pagePath(locale) },
  };
}

export default async function BelediyeCagrilariPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const orgType = parseOrgType((await searchParams).orgType);
  const t = await getTranslations({ locale, namespace: 'publicSectorCalls' });

  const calls = await listPublicSectorCalls({ orgType, locale });
  const active = calls.filter((c) => c.phase !== 'recently_closed');
  const closed = calls.filter((c) => c.phase === 'recently_closed');
  const offPortal = PUBLIC_SECTOR_PROGRAMMES.filter(
    (p) => p.sourceKey === null && p.eligibleOrgTypes.includes(orgType)
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-ink">
      <PublicNavbar locale={locale} />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-12 px-4 py-12">
        <header className="space-y-4">
          <Badge className="bg-accent/15 text-accent-ink border-accent/30">{t('badge')}</Badge>
          <h1 className="font-heading text-3xl font-extrabold text-ink md:text-4xl">{t('title')}</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted">{t('intro')}</p>
          <nav aria-label={t('org_type_label')} className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">{t('org_type_label')}:</span>
            {PUBLIC_SECTOR_ORG_TYPES.map((o) => (
              <Link
                key={o}
                href={`${pagePath(locale)}?orgType=${o}`}
                aria-current={o === orgType ? 'page' : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  o === orgType
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-surface text-ink hover:border-accent'
                }`}
              >
                {t(`org_type.${o}`)}
              </Link>
            ))}
          </nav>
          <p className="text-xs text-muted">{t('disclaimer')}</p>
        </header>

        <section id="calls" className="scroll-mt-24 space-y-4">
          <h2 className="text-xl font-bold text-ink">{t('section_open', { count: active.length })}</h2>
          {active.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-8 text-center">
              <p className="text-muted">{t('empty_title')}</p>
              <p className="mt-2 text-sm text-muted">{t('empty_hint')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {active.map((c) => (
                <CallCard key={c.identifier} call={c} locale={locale} t={t} />
              ))}
            </div>
          )}
        </section>

        {closed.length > 0 && (
          <section id="closed" className="scroll-mt-24 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-ink">{t('section_closed')}</h2>
              <p className="mt-1 text-sm text-muted">{t('section_closed_hint', { days: RECENTLY_CLOSED_DAYS })}</p>
            </div>
            <ClosedGroups calls={closed} locale={locale} t={t} />
          </section>
        )}

        {offPortal.length > 0 && (
          <section id="programmes" className="scroll-mt-24 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-ink">{t('section_catalog')}</h2>
              <p className="mt-1 text-sm text-muted">{t('section_catalog_hint')}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {offPortal.map((p) => (
                <article
                  key={p.key}
                  className="space-y-3 rounded-xl border border-border bg-surface p-5"
                  data-testid="radar-programme"
                >
                  <h3 className="text-base font-bold text-ink">{p.name[locale === 'tr' ? 'tr' : 'en']}</h3>
                  {locale === 'tr' && <p className="text-sm leading-relaxed text-ink">{p.plainTr}</p>}
                  <ProgrammeFacts programme={p} locale={locale} t={t} />
                  {p.turkeyRegions && (
                    <p className="text-xs text-muted">{t('turkey_regions', { regions: p.turkeyRegions.join(', ') })}</p>
                  )}
                  {p.turkeyEligibility !== 'not_eligible' && (
                    <FitCheck requirements={p} readinessHref={readinessPath(locale)} idPrefix={`fit-${p.key}`} />
                  )}
                  <a
                    href={p.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm font-semibold text-accent-ink underline underline-offset-2"
                  >
                    {t('official_site')}
                  </a>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      <PublicFooter locale={locale} />
    </div>
  );
}
