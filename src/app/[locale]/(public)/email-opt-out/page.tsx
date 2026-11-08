import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { emailOptOutSecret } from '@/lib/env';
import { verifyOptOutToken, type OptOutKind } from '@/lib/email/opt-out';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Pick<PageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'EmailOptOut' });
  // The address bar holds a signed token: no index, and no Referer to carry it off.
  return { title: t('title'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/**
 * NG-42 — where the opt-out link of a first message lands. Showing this page
 * records nothing (see src/app/api/email/opt-out/route.ts); the button does.
 */
export default async function EmailOptOutPage({ params, searchParams }: PageProps) {
  const { locale: raw } = await params;
  const locale = raw === 'en' ? 'en' : 'tr';
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'EmailOptOut' });

  const doneKind: OptOutKind | null =
    query.status === 'done' ? (query.k === 'decline' ? 'decline' : 'unsubscribe') : null;
  const secret = emailOptOutSecret();
  const token = typeof query.t === 'string' ? query.t : '';
  const payload = !doneKind && secret ? verifyOptOutToken(token, secret) : null;
  const invalid = !doneKind && !payload;

  return (
    <div className="flex-1 flex flex-col bg-background text-ink">
      <main id="main" className="flex-1 w-full max-w-2xl mx-auto px-edge sm:px-4 py-12 sm:py-16">
        <section
          data-testid="email-opt-out"
          className={`rounded-xl border bg-surface p-6 ${invalid ? 'border-bad' : doneKind ? 'border-ok' : 'border-border'}`}
        >
          {invalid ? <CircleAlert className="h-8 w-8 text-bad" aria-hidden="true" /> : null}
          {doneKind ? <CircleCheck className="h-8 w-8 text-ok" aria-hidden="true" /> : null}
          {invalid ? (
            <>
              <h1 className="mt-3 text-xl font-semibold">{t('invalidHeading')}</h1>
              <p className="mt-2">{t('invalidBody')}</p>
            </>
          ) : doneKind ? (
            <>
              <h1 className="mt-3 text-xl font-semibold">{t(`done.${doneKind}.heading`)}</h1>
              <p className="mt-2">{t(`done.${doneKind}.body`)}</p>
            </>
          ) : payload ? (
            <form method="post" action={`/api/email/opt-out?t=${encodeURIComponent(token)}`}>
              <h1 className="text-xl font-semibold">{t(`confirm.${payload.kind}.heading`)}</h1>
              <p className="mt-2">{t(`confirm.${payload.kind}.body`)}</p>
              <input type="hidden" name="confirm" value="1" />
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                data-testid="email-opt-out-confirm"
                className="mt-4 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
              >
                {t(`confirm.${payload.kind}.button`)}
              </button>
            </form>
          ) : null}
        </section>
      </main>
    </div>
  );
}
