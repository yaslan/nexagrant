import React from 'react';
import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { env } from '@/lib/env';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

/**
 * Every `alternates.canonical` and `openGraph.url` in the app is written as a
 * path; without a base they render relative, which crawlers reject. Set
 * NEXT_PUBLIC_APP_URL per environment so those resolve to the real host.
 */
export const metadata: Metadata = {
  title: 'Fabrika',
  description: 'Avrupa fonları için proje pipeline SaaS',
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The <html> element lives here, above the [locale] segment, so the language
  // has to come from the request rather than from route params. Without it
  // screen readers and translation tools fall back to guessing (Lighthouse:
  // "html-has-lang"). Non-localised routes get the default locale.
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" suppressHydrationWarning></script>
      </head>
      <body className="min-h-screen bg-background text-ink antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
