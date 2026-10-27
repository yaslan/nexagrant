'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import {
  CONSENT_STORAGE_KEY,
  OPEN_COOKIE_PREFERENCES_EVENT,
  clearAnalyticsStorage,
  storedConsentLevel,
} from '@/lib/cookie-consent';

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
  /**
   * FO-180: a "Cookie preferences" link (footer, /privacy) reopens the banner so
   * an answer can be changed as easily as it was given. `current` is the answer
   * shown while reopened; `trigger` gets focus back when the banner closes.
   */
  const [reopened, setReopened] = useState<{ current: 'all' | 'essential' | null } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const firstButton = useRef<HTMLButtonElement>(null);
  const visible = isHydrated && (reopened !== null || (!answered && !dismissed));
  const locale = useLocale();
  const t = useTranslations('legal.cookieConsent');

  useEffect(() => {
    const open = () => {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setReopened({ current: storedConsentLevel() });
    };
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, open);
  }, []);

  // Opened on purpose: the keyboard user who pressed the link lands in the banner.
  useEffect(() => {
    if (reopened) firstButton.current?.focus();
  }, [reopened]);

  const close = () => {
    setDismissed(true);
    if (reopened) {
      setReopened(null);
      trigger.current?.focus();
    }
  };

  // Only a reopened banner can be left without an answer: one is already stored.
  useEffect(() => {
    if (!reopened) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setReopened(null);
      trigger.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [reopened]);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      accepted: true,
      time: new Date().toISOString(),
      level: 'all',
    }));
    close();
  };

  const handleReject = () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      accepted: false,
      time: new Date().toISOString(),
      level: 'essential',
    }));
    // Withdrawal leaves nothing behind (KVKK / ePrivacy).
    clearAnalyticsStorage();
    close();
  };

  if (!visible) return null;

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
              {t('title')}
            </h2>
            <p id="cookie-description" className="text-sm text-ink-2 mt-2">
              {t('description')}
              <a
                href={`/${locale}/privacy`}
                className="text-accent underline font-medium hover:no-underline focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:outline-none rounded"
                aria-label={t('privacyLink')}
              >
                {t('privacyLink')}
              </a>
            </p>
            {reopened?.current && (
              <p data-testid="cookie-current-choice" className="text-xs text-muted mt-2">
                {t(reopened.current === 'all' ? 'currentAll' : 'currentEssential')}
              </p>
            )}
          </div>
          <div className="flex gap-3 flex-col sm:flex-row">
            <button
              ref={firstButton}
              onClick={handleReject}
              aria-label={t('essentialOnly')}
              className="text-xs font-semibold border border-border px-4 py-2 rounded-lg text-ink-2 hover:bg-surface-hover hover:text-ink focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:outline-none transition-colors"
            >
              {t('essentialOnly')}
            </button>
            <button
              onClick={handleAccept}
              aria-label={t('acceptAll')}
              className="text-xs font-semibold bg-accent-strong text-white px-4 py-2 rounded-lg hover:opacity-90 focus:ring-2 focus:ring-offset-2 focus:ring-white focus:outline-none shadow-2xs transition-opacity"
            >
              {t('acceptAll')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
