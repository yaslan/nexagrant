import React from 'react';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';

export default async function NotFound() {
  // This boundary sits above the `[locale]` segment, so there is no route param
  // to read the language from: `getRequestConfig` resolves the request locale
  // and falls back to the default one. `getTranslations` works server-side
  // without a NextIntlClientProvider, which the root layout does not render.
  const locale = await getLocale();
  const t = await getTranslations('NotFound');
  // The public header and footer (FO-68) are on every public page, this one
  // included. The header is a client component, and being above `[locale]` this
  // page gets no provider from a layout, so it brings its own.
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="min-h-screen flex flex-col bg-background text-ink">
        <PublicNavbar locale={locale} />
        <main id="main" className="flex-1 flex items-center justify-center px-edge sm:px-6 py-16">
          <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-8 text-center shadow-sm space-y-4">
            <div className="w-16 h-16 bg-accent/10 border border-accent/30 rounded-full flex items-center justify-center mx-auto text-accent-ink font-bold text-2xl font-mono">
              404
            </div>
            <h1 className="text-2xl font-bold font-heading text-ink">{t('title')}</h1>
            <p className="text-muted text-sm leading-relaxed">
              {t('description')}
            </p>
            <div className="pt-4">
              <Link
                href={`/${locale}`}
                className="inline-block bg-accent-strong hover:opacity-90 text-white font-semibold px-6 py-2.5 rounded-lg transition shadow-sm text-sm"
              >
                {t('backHome')}
              </Link>
            </div>
          </div>
        </main>
        <PublicFooter locale={locale} />
      </div>
    </NextIntlClientProvider>
  );
}
