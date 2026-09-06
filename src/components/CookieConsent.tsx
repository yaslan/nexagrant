'use client';

import React, { useState, useEffect } from 'react';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('fabrika-cookie-consent');
    if (!consent) setVisible(true);
  }, []);

  const handleAccept = () => {
    localStorage.setItem('fabrika-cookie-consent', 'accepted');
    setVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem('fabrika-cookie-consent', 'rejected');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-md text-ink p-4 border-t border-border shadow-2xl transition-all" role="dialog" aria-label="Cookie consent">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-ink-2">
          Bu site deneyiminizi iyileştirmek için çerez kullanmaktadır. Devam ederek{' '}
          <a href="/privacy" className="text-accent underline font-medium">gizlilik politikamızı</a> kabul etmiş olursunuz.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleReject}
            className="text-xs font-semibold border border-border px-4 py-2 rounded-lg text-ink-2 hover:bg-surface-hover hover:text-ink transition-colors"
          >
            Reddet
          </button>
          <button
            onClick={handleAccept}
            className="text-xs font-semibold bg-accent text-white px-4 py-2 rounded-lg hover:opacity-90 shadow-2xs transition-opacity"
          >
            Kabul Et
          </button>
        </div>
      </div>
    </div>
  );
}
