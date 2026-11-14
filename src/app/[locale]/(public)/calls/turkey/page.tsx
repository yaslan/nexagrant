import React from 'react';
import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { isCountryEligible } from '@/lib/scoring/g0-features';
import { formatMinorWhole } from '@/lib/money';
import LocalDeadline from './local-deadline';

/** ISO-3166-1 alpha-2 for the country this page is about. */
const COUNTRY = 'TR';

/** The zone a call's deadline is quoted in when its record does not say. */
const DEFAULT_DEADLINE_TZ = 'Europe/Brussels';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'calls_turkey' });

  return {
    title: t('title'),
    description: t('meta_description'),
    alternates: { canonical: `/${locale}/calls/turkey` },
    openGraph: {
      title: t('title'),
      description: t('og_description'),
      type: 'website',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: `/${locale}/calls/turkey`,
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('og_description'),
    },
  };
}

/**
 * The Topic columns this page renders.
 *
 * The previous version queried `Call.country`, `Call.isOpen` and
 * `Call.deadline`; prisma/schema.prisma has none of them on `model Call`, so
 * the query threw on every render, the try/catch swallowed it and the page
 * showed "0 aktif çağrı" to every visitor whatever the database held. Open
 * calls live on `Topic` (status, nextDeadlineAt, eligibility), and the call and
 * programme hang off it.
 */
interface TurkeyTopicRow {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  nextDeadlineAt: Date | null;
  deadlines: unknown;
  budgetPerProjectCents: bigint | null;
  eligibility: unknown;
  sourceUrl: string | null;
  call: {
    callIdentifier: string;
    budgetCents: bigint | null;
    /** `Call.currency`: TRY for TR agency calls. Topic amounts inherit it (NG-163). */
    currency: string | null;
    url: string | null;
    programme: { name: string } | null;
  } | null;
}

/** `Topic.eligibility` JSON narrowed to the shape `isCountryEligible` reads. */
function toEligibility(value: unknown): {
  restricted?: string | null;
  countriesExcluded?: string[] | null;
} | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    restricted: typeof record.restricted === 'string' ? record.restricted : null,
    countriesExcluded: Array.isArray(record.countriesExcluded)
      ? record.countriesExcluded.filter((c): c is string => typeof c === 'string')
      : null,
  };
}

/**
 * The zone the topic's next deadline is published in. `Topic.deadlines` is
 * `[{ stage, at, tz }]` and `nextDeadlineAt` is one of those instants hoisted
 * into an indexed column, so match on the instant to get the right stage's zone.
 */
function deadlineTimezone(deadlines: unknown, nextDeadlineAt: Date | null): string {
  if (!Array.isArray(deadlines)) return DEFAULT_DEADLINE_TZ;
  const stages = deadlines.filter(
    (d): d is { at?: unknown; tz?: unknown } => typeof d === 'object' && d !== null
  );
  const target = nextDeadlineAt?.getTime();
  const matched =
    target === undefined
      ? undefined
      : stages.find((d) => typeof d.at === 'string' && new Date(d.at).getTime() === target);
  const withTz = matched ?? stages.find((d) => typeof d.tz === 'string' && d.tz.trim() !== '');
  const tz = withTz?.tz;
  return typeof tz === 'string' && tz.trim() !== '' ? tz.trim() : DEFAULT_DEADLINE_TZ;
}

/**
 * Minor units → a localised amount in the call's own currency, through
 * src/lib/money.ts (rule 9). `Topic` carries no currency; it inherits
 * `Call.currency` (TRY for TR agencies), unset meaning the EUR default.
 */
function formatBudget(cents: bigint | null, currency: string | null, locale: string): string | null {
  if (cents === null) return null;
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if (cents > limit || cents < -limit) return null;
  return formatMinorWhole(cents, currency?.trim() || 'EUR', locale === 'tr' ? 'tr-TR' : 'en-GB');
}

export default async function TurkeyCalls({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'calls_turkey' });

  // Open topics whose deadline has not passed. There is no per-country column
  // to filter on — country eligibility lives in the `Topic.eligibility` JSON
  // (`restricted`, `countriesExcluded`), so the country test runs in code, on
  // the same helper the G0 gate uses. `take` is generous because that filter
  // removes rows after the query.
  //
  // No try/catch: a failing query used to be swallowed here and shown as an
  // empty list, which is indistinguishable from "no calls today". If the
  // database is unreachable the page must fail loudly, not lie quietly.
  const topics = (await prisma.topic.findMany({
    where: {
      status: 'OPEN',
      nextDeadlineAt: { gt: new Date() },
    },
    take: 100,
    orderBy: { nextDeadlineAt: 'asc' },
    select: {
      id: true,
      identifier: true,
      title: true,
      description: true,
      nextDeadlineAt: true,
      deadlines: true,
      budgetPerProjectCents: true,
      eligibility: true,
      sourceUrl: true,
      call: {
        select: {
          callIdentifier: true,
          budgetCents: true,
          currency: true,
          url: true,
          programme: { select: { name: true } },
        },
      },
    },
  })) as TurkeyTopicRow[];

  const calls = topics
    .filter((topic) => isCountryEligible(COUNTRY, toEligibility(topic.eligibility)).eligible)
    .slice(0, 20);

  return (
    <div className="flex-1 flex flex-col bg-background text-ink">
      <main className="flex-1 max-w-7xl mx-auto px-edge sm:px-6 lg:px-8 py-12 w-full">
        <div className="space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-ink">{t('title')}</h1>
            <p className="text-muted text-lg">{t('count', { count: calls.length })}</p>
          </div>

          {/* Calls Grid */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {calls.map((call) => {
              const tz = deadlineTimezone(call.deadlines, call.nextDeadlineAt);
              const deadlineIso = call.nextDeadlineAt
                ? new Date(call.nextDeadlineAt).toISOString()
                : null;
              const officialDeadline = call.nextDeadlineAt
                ? new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: tz,
                  }).format(new Date(call.nextDeadlineAt))
                : t('not_recorded');
              const callBudget = formatBudget(call.call?.budgetCents ?? null, call.call?.currency ?? null, locale);
              const projectBudget = formatBudget(call.budgetPerProjectCents, call.call?.currency ?? null, locale);
              const href = call.sourceUrl || call.call?.url || null;

              return (
                <div
                  key={call.id}
                  className="bg-surface border border-border rounded-lg p-6 hover:border-accent/50 transition space-y-4"
                >
                  <div>
                    <h3 className="font-semibold text-ink text-lg">{call.title}</h3>
                    <p className="text-xs text-muted mt-1 font-mono">{call.identifier}</p>
                    {call.call?.programme?.name && (
                      <p className="text-xs text-muted mt-1">{call.call.programme.name}</p>
                    )}
                    {call.description && (
                      <p className="text-sm text-muted mt-2 line-clamp-3">{call.description}</p>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">{t('deadline_official', { tz })}</span>
                      <time
                        className="font-mono font-semibold text-xs"
                        dateTime={deadlineIso ?? undefined}
                      >
                        {officialDeadline}
                      </time>
                    </div>
                    {deadlineIso && (
                      <LocalDeadline
                        iso={deadlineIso}
                        locale={locale}
                        label={t('deadline_local')}
                      />
                    )}
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">{t('call_id')}</span>
                      <span className="font-mono text-xs">
                        {call.call?.callIdentifier ?? t('not_recorded')}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">{t('budget')}</span>
                      <span className="font-mono font-semibold text-xs">
                        {callBudget ?? t('not_recorded')}
                      </span>
                    </div>
                    {projectBudget && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted">{t('budget_per_project')}</span>
                        <span className="font-mono font-semibold text-xs">{projectBudget}</span>
                      </div>
                    )}
                  </div>

                  {/* No `href="#"` placeholder: a link is rendered only when the
                      record actually carries a source URL. */}
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-accent text-white text-center py-2 rounded-lg hover:opacity-90 text-sm font-semibold transition"
                    >
                      {t('view_details')}
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {calls.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted text-lg">{t('empty_title')}</p>
              <p className="text-muted text-sm mt-2">{t('empty_hint')}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
