'use client';

import React, { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';

export default function CookieConsent() {
  const [visible, setVisible] = useState(() => {
    try {
      const consent = localStorage.getItem('fabrika_cookie_consent');
      return !consent;
    } catch {
      return false;
    }
  });
  const locale = useLocale();

  const handleAccept = () => {
    localStorage.setItem('fabrika_cookie_consent', JSON.stringify({
      accepted: true,
      time: new Date().toISOString(),
      level: 'all',
    }));
    setVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem('fabrika_cookie_consent', JSON.stringify({
      accepted: false,
      time: new Date().toISOString(),
      level: 'essential',
    }));
    setVisible(false);
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
