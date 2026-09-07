import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import CookieConsent from '@/components/CookieConsent';

import { CartProvider } from '@/components/cart/CartContext';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { getActiveTier } from '@/lib/billing/active-tier';

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  
  if (!routing.locales.includes(locale as typeof routing.locales[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      {/* The running campaign is decided here, on the server, and handed down
          read-only: the cart and every price card render under the same tier
          the checkout route prices with. */}
      <CartProvider activeTier={getActiveTier()}>
        {children}
        <CartDrawer locale={locale} />
        <CookieConsent />
      </CartProvider>
    </NextIntlClientProvider>
  );
}
