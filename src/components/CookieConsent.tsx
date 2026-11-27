'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { buttonClass } from '@/components/ui/Button';
import { getPublicRoute } from '@/lib/routes';
import { focusRing } from '@/components/expert-prereg/styles';
import {
  OPEN_COOKIE_PREFERENCES_EVENT,
  OPTIONAL_COOKIE_CATEGORIES,
  type ConsentCategories,
  type CookieChoice,
  type OptionalCookieCategory,
  forgetAnalyticsWithoutConsent,
  saveConsent,
  storedConsent,
  storedConsentLevel,
} from '@/lib/cookie-consent';

/**
 * Whether this browser has a current answer. Client-only: the server cannot see storage.
 * NG-371: an expired or older-policy answer is no answer, so the banner asks again.
 */
function hasStoredConsent(): boolean {
  const current = storedConsent() !== null;
  // NG-371: no current answer → the banner asks again and any analytics id from the old answer goes.
  if (!current) forgetAnalyticsWithoutConsent();
  return current;
}

const NONE: ConsentCategories = { analytics: false, marketing: false };

/**
 * NG-9: "Reject" and "Accept all" carry the same weight — one class for both, so neither
 * is the louder default (KVKK Kurul çerez rehberi / EDPB 03/2022 deceptive design).
 */
const ANSWER_BUTTON = `${buttonClass('primary', 'md')} flex-1`;
const QUIET_BUTTON = `${buttonClass('secondary', 'md')}`;

function CategorySwitch({
  category,
  checked,
  onChange,
}: {
  category: OptionalCookieCategory;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations('legal.cookieConsent');
  const id = useId();
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p id={`${id}-name`} className="text-sm font-semibold text-ink">
          {t(`categories.${category}.name`)}
        </p>
        <p id={`${id}-desc`} className="text-xs text-ink-2 mt-0.5">
          {t(`categories.${category}.description`)}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-desc`}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full ${focusRing}`}
      >
        <span
          aria-hidden="true"
          // Off: an outlined track with a dark knob on the left, so the state does not rest on a
          // pale fill (WCAG 1.4.11 needs 3:1 for the control); on: filled track, white knob right.
          className={`relative inline-block h-6 w-11 shrink-0 rounded-full border-2 transition-colors ${
            checked ? 'bg-accent-strong border-accent-strong' : 'bg-surface border-ink-2'
          }`}
        >
          <span
            className={`absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-transform ${
              checked ? 'translate-x-[22px] bg-white' : 'translate-x-[3px] bg-ink-2'
            }`}
          />
        </span>
        <span aria-hidden="true" className="w-12 text-left text-xs font-semibold text-ink-2">
          {checked ? t('statusOn') : t('statusOff')}
        </span>
      </button>
    </li>
  );
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
   * FO-180: a "Cookie preferences" link (footer, /privacy, /cookies) reopens the banner so
   * an answer can be changed as easily as it was given. `current` is the answer
   * shown while reopened; `trigger` gets focus back when the banner closes.
   */
  const [reopened, setReopened] = useState<{ current: 'all' | 'essential' | 'custom' | null } | null>(null);
  /** NG-9: the preference panel (per-category switches) instead of the two-button banner. */
  const [panel, setPanel] = useState(false);
  const [draft, setDraft] = useState<ConsentCategories>(NONE);
  const trigger = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const firstButton = useRef<HTMLButtonElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const visible = isHydrated && (reopened !== null || (!answered && !dismissed));
  const locale = useLocale();
  const t = useTranslations('legal.cookieConsent');

  useEffect(() => {
    const open = () => {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPanel(false);
      setReopened({ current: storedConsentLevel() });
    };
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, open);
  }, []);

  /**
   * FO-183: focus lands on the least-committing answer when the banner opens. On a first
   * visit it does so only if nothing else holds focus yet (an autofocused field keeps it);
   * the Tab trap below still brings the keyboard into the banner from there.
   */
  useEffect(() => {
    if (!visible || panel) return;
    if (reopened || document.activeElement === null || document.activeElement === document.body) {
      firstButton.current?.focus();
    }
  }, [visible, reopened, panel]);

  /** NG-9: opening the panel moves focus to its heading, so a screen reader starts there. */
  useEffect(() => {
    if (visible && panel) panelHeading.current?.focus();
  }, [visible, panel]);

  /**
   * FO-183: the banner is `aria-modal`, so Tab and Shift+Tab cycle through its own
   * controls and never reach the page behind the overlay.
   */
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusable = Array.from(
        dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      const inside = active instanceof Node && dialog.current.contains(active);
      if (!inside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === panelHeading.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible]);

  const close = () => {
    setDismissed(true);
    setPanel(false);
    if (reopened) {
      setReopened(null);
      trigger.current?.focus();
    }
  };

  /**
   * Escape closes the banner only when an answer is already stored: it then keeps that
   * answer. Without one (first visit, even if opened from the link) the banner stays and
   * waits for a choice, so Escape is ignored rather than half-closing it. In the panel,
   * Escape steps back to the banner first.
   */
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (panel) {
        setPanel(false);
        return;
      }
      if (!reopened || !hasStoredConsent()) return;
      setReopened(null);
      trigger.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, reopened, panel]);

  const answer = (categories: ConsentCategories, choice: CookieChoice) => {
    saveConsent(categories, choice, locale);
    close();
  };
  const handleAccept = () => answer({ analytics: true, marketing: true }, 'accept_all');
  // Withdrawal leaves nothing behind (KVKK / ePrivacy): saveConsent clears analytics storage.
  const handleReject = () => answer(NONE, 'reject_all');
  const handleSave = () => answer(draft, 'custom');

  const openPanel = () => {
    // Default: everything but "necessary" off; reopened, the switches show the stored answer.
    setDraft(storedConsent() ?? NONE);
    setPanel(true);
  };

  if (!visible) return null;

  const currentKey =
    reopened?.current === 'all' ? 'currentAll' : reopened?.current === 'custom' ? 'currentCustom' : 'currentEssential';

  return (
    <div
      ref={dialog}
      className="fixed inset-0 z-50 bg-black/50"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-description"
    >
      <div
        className={`fixed bottom-0 left-0 right-0 max-h-[100dvh] overflow-y-auto bg-surface/95 backdrop-blur-md text-ink p-4 border-t border-border shadow-2xl transition-all sm:bottom-4 sm:left-4 sm:right-auto sm:rounded-lg ${
          panel ? 'sm:max-w-md' : 'sm:max-w-sm'
        }`}
      >
        {panel ? (
          <div className="space-y-3" data-testid="cookie-preferences-panel">
            <h2 id="cookie-title" ref={panelHeading} tabIndex={-1} className="text-base font-semibold text-ink focus:outline-none">
              {t('panelTitle')}
            </h2>
            <p id="cookie-description" className="text-sm text-ink-2">
              {t('panelIntro')}{' '}
              <a href={getPublicRoute('cookies', locale)} className={`text-accent underline font-medium hover:no-underline rounded ${focusRing}`}>
                {t('cookiePolicyLink')}
              </a>
            </p>
            <ul className="divide-y divide-border border-y border-border">
              <li className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{t('categories.necessary.name')}</p>
                  <p className="text-xs text-ink-2 mt-0.5">{t('categories.necessary.description')}</p>
                </div>
                <span className="mt-2 shrink-0 text-xs font-semibold text-ok-ink" data-testid="cookie-necessary-always-on">
                  {t('alwaysOn')}
                </span>
              </li>
              {OPTIONAL_COOKIE_CATEGORIES.map((category) => (
                <CategorySwitch
                  key={category}
                  category={category}
                  checked={draft[category]}
                  onChange={(next) => setDraft((d) => ({ ...d, [category]: next }))}
                />
              ))}
            </ul>
            <div className="flex gap-3 flex-col sm:flex-row">
              <button type="button" onClick={handleReject} className={ANSWER_BUTTON}>
                {t('essentialOnly')}
              </button>
              <button type="button" onClick={handleAccept} className={ANSWER_BUTTON}>
                {t('acceptAll')}
              </button>
            </div>
            <button type="button" onClick={handleSave} className={`${QUIET_BUTTON} w-full`}>
              {t('save')}
            </button>
          </div>
        ) : (
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
                  {t(currentKey)}
                </p>
              )}
            </div>
            <button type="button" onClick={openPanel} aria-haspopup="dialog" className={`${QUIET_BUTTON} w-full`}>
              {t('manage')}
            </button>
            <div className="flex gap-3 flex-col sm:flex-row">
              <button ref={firstButton} type="button" onClick={handleReject} className={ANSWER_BUTTON}>
                {t('essentialOnly')}
              </button>
              <button type="button" onClick={handleAccept} className={ANSWER_BUTTON}>
                {t('acceptAll')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
