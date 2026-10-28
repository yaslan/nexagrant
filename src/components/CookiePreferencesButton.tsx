'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { openCookiePreferences } from '@/lib/cookie-consent';

/**
 * Reopens the cookie banner (FO-180) so a visitor can change or withdraw the
 * answer they gave. A button, not a link: it opens a dialog and goes nowhere.
 */
export default function CookiePreferencesButton({ className }: { className?: string }) {
  const t = useTranslations('legal.cookieConsent');
  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      aria-haspopup="dialog"
      data-testid="cookie-preferences-link"
      className={className}
    >
      {t('preferencesLink')}
    </button>
  );
}
