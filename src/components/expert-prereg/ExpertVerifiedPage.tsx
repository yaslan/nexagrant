import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { authSecret } from '@/lib/env';
import { decodeVerifiedOutcome } from '@/lib/expert-prereg/server/verified-outcome';
import { VERIFY_TOKEN_TTL_MS } from '@/lib/expert-prereg/server/constants';
import { expertPreregPath } from './paths';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function expertVerifiedMetadata({ params }: Pick<PageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ExpertPrereg.meta' });
  return { title: t('verified_title'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/**
 * FO-20 — where GET /api/expert-preregistration/verify redirects (FO-19). The
 * result arrives as one signed `?r=` (FO-29, verified-outcome.ts) and is checked
 * here, on the server: a missing, tampered or expired `r`, or a hand-typed
 * `?n=`, shows "invalid link". Only a value the verify route signed says verified.
 */
export default async function ExpertVerifiedPage({ params, searchParams }: PageProps) {
  const { locale: raw } = await params;
  const locale = raw === 'en' ? 'en' : 'tr';
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'ExpertPrereg.verified' });

  const secret = authSecret();
  const result = secret ? decodeVerifiedOutcome(query.r, { secret }) : null;
  const error = result === null ? 'invalid' : result.outcome === 'ok' ? null : result.outcome;
  const founder = result?.founderNumber ?? null;

  return (
    <div className="flex-1 flex flex-col bg-background text-ink">
      <main id="main" className="flex-1 w-full max-w-2xl mx-auto px-edge sm:px-4 py-12 sm:py-16">
        <section
          aria-labelledby="ep-verified-heading"
          data-testid="ep-verified"
          className={`rounded-xl border bg-surface p-6 ${error ? 'border-bad' : 'border-ok'}`}
        >
          {error ? (
            <CircleAlert className="h-8 w-8 text-bad" aria-hidden="true" />
          ) : (
            <CircleCheck className="h-8 w-8 text-ok" aria-hidden="true" />
          )}
          <h1 id="ep-verified-heading" className="mt-3 font-heading text-3xl font-semibold text-ink">
            {error ? t(`heading_${error}`) : t('heading_ok')}
          </h1>
          {error ? (
            <p className="mt-2 text-sm text-ink-2">{t(`text_${error}`, { hours: VERIFY_TOKEN_TTL_MS / 3_600_000 })}</p>
          ) : founder !== null ? (
            <p data-testid="ep-founder-number" className="mt-3 text-xl font-semibold text-accent-ink">
              {t('founder', { number: founder })}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-2">{t('no_founder')}</p>
          )}
          <Link
            href={expertPreregPath(locale)}
            className="mt-6 inline-flex min-h-11 items-center font-semibold text-accent-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t('back')}
          </Link>
        </section>
      </main>
    </div>
  );
}
