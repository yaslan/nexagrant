import React from 'react';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { appUrl } from '@/lib/app-url';
import { PRODUCT_NAME } from '@/lib/brand';
import { ThemeProvider } from '@/components/ThemeProvider';
import { parseTheme, THEME_COOKIE_NAME, type ResolvedTheme, type Theme } from '@/lib/theme';
import './globals.css';

/**
 * Every `alternates.canonical` and `openGraph.url` in the app is written as a
 * path; without a base they render relative, which crawlers reject. Set
 * NEXT_PUBLIC_APP_URL per environment so those resolve to the real host.
 */
export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: 'Avrupa fonları için proje pipeline SaaS',
  metadataBase: new URL(appUrl()),
  icons: {
    icon: '/favicon.ico',
    apple: {
      url: '/apple-icon.png',
      sizes: '180x180',
      type: 'image/png',
    },
  },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F6F8' },
    { media: '(prefers-color-scheme: dark)', color: '#080D1A' },
  ],
};

/**
 * Decide the theme before a single byte of HTML is sent.
 *
 * The preference is a cookie (see ThemeProvider) precisely so this can happen on
 * the server: the class goes straight onto <html>, so there is no parse-time
 * <script> to write it and therefore no React "Encountered a script tag" warning.
 *
 * When no explicit preference exists, `Sec-CH-Prefers-Color-Scheme` is the only
 * thing the server has to go on. Chrome and Edge send it once `Accept-CH` has
 * asked for it (next.config.ts); Safari and Firefox do not implement client hints
 * and never will send it, so a system-dark user there gets one light first paint
 * and ThemeProvider corrects it after hydration. From their next visit onwards a
 * cookie exists and the server is right again. That single flash is the accepted
 * price of removing the script.
 */
async function resolveTheme(): Promise<{ theme: Theme; resolved: ResolvedTheme }> {
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE_NAME)?.value);
  if (theme !== 'system') return { theme, resolved: theme };

  const hint = (await headers()).get('sec-ch-prefers-color-scheme');
  return { theme, resolved: hint === 'dark' ? 'dark' : 'light' };
}

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
  const { theme, resolved } = await resolveTheme();

  return (
    <html
      lang={locale}
      className={resolved === 'dark' ? 'dark' : undefined}
      data-theme={resolved}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-ink antialiased">
        <ThemeProvider initialTheme={theme} initialResolvedTheme={resolved}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
