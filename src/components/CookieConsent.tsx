'use client';

import React, { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';

const CONSENT_STORAGE_KEY = 'fabrika_cookie_consent';

/** Whether this browser has already answered. Client-only: the server cannot see storage. */
function hasStoredConsent(): boolean {
  try {
    return Boolean(localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    // Storage disabled (private mode, blocked site data): treat it as unanswered.
    return false;
  }
}

export default function CookieConsent() {
  /**
   * The banner used to decide its own visibility from a `useState` initialiser that read
   * `localStorage` — during render, so the server (no storage) rendered nothing while the
   * client's first render already rendered the dialog, and the trees diverged. The read now
   * waits for `useIsHydrated`, which is `false` on the server and through hydration.
   */
  const isHydrated = useIsHydrated();
  const answered = useMemo(() => (isHydrated ? hasStoredConsent() : false), [isHydrated]);
  const [dismissed, setDismissed] = useState(false);
  const visible = isHydrated && !answered && !dismissed;
  const locale = useLocale();

  const handleAccept = () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      accepted: true,
      time: new Date().toISOString(),
      level: 'all',
    }));
    setDismissed(true);
  };

  const handleReject = () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      accepted: false,
      time: new Date().toISOString(),
      level: 'essential',
    }));
    setDismissed(true);
  };

  if (!visible) return null;

  const isTr = locale === 'tr';
  const title = isTr ? 'Çerez Tercihleri' : 'Cookie Preferences';
  const description = isTr
    ? 'Web sitesini geliştirmek ve analitik verilerini toplama için çerezleri kullanıyoruz. Tercihlerinizi ayarlayabilir veya '
    : 'We use cookies to improve your experience and collect analytics data. You can adjust your preferences or read our ';
  const privacyLabel = isTr ? 'Gizlilik Bildirimi' : 'Privacy Policy';
  const accept = isTr ? 'Tümünü Kabul Et' : 'Accept All';
  const reject = isTr ? 'Gerekli Çerezler' : 'Essential Only';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-description"
    >
      <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-md text-ink p-4 border-t border-border shadow-2xl transition-all sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-sm sm:rounded-lg">
        <div className="space-y-4">
          <div>
            <h2 id="cookie-title" className="text-base font-semibold text-ink">
              {title}
            </h2>
            <p id="cookie-description" className="text-sm text-ink-2 mt-2">
              {description}
              <a
                href={`/${locale}/privacy`}
                className="text-accent underline font-medium hover:no-underline focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:outline-none rounded"
                aria-label={`${privacyLabel}`}
              >
                {privacyLabel}
              </a>
            </p>
          </div>
          <div className="flex gap-3 flex-col sm:flex-row">
            <button
              onClick={handleReject}
              aria-label={reject}
              className="text-xs font-semibold border border-border px-4 py-2 rounded-lg text-ink-2 hover:bg-surface-hover hover:text-ink focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:outline-none transition-colors"
            >
              {reject}
            </button>
            <button
              onClick={handleAccept}
              aria-label={accept}
              className="text-xs font-semibold bg-accent-strong text-white px-4 py-2 rounded-lg hover:opacity-90 focus:ring-2 focus:ring-offset-2 focus:ring-white focus:outline-none shadow-2xs transition-opacity"
            >
              {accept}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
