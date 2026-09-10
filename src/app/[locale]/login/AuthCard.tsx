'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { loginWithCredentialsAction, loginWithSocialAction } from '@/lib/actions/auth';
import { useTranslations } from 'next-intl';
import { PRODUCT_NAME } from '@/lib/brand';
import { errorMessage as toErrorMessage, isNextRedirectError } from '@/lib/errors';
import {
  PRIVACY_NOTICE,
  TERMS_OF_SERVICE,
  registrationAcknowledgementToken,
} from '@/lib/legal/consent-documents';

/**
 * The one place this file spells a demo address. Each seat used to write its
 * address twice — once as the handler argument, once as the visible line — so a
 * rename could change the button's label while it still signed in as the old
 * address, or the reverse (TASK-MTV69TO4K8NVZ).
 *
 * The keys of `DEMO_PROFILES` in src/lib/auth.ts are the real source of truth,
 * but that module pulls in NextAuth, the Prisma adapter and the database client,
 * so a `'use client'` component cannot import from it without dragging the whole
 * server auth stack into the browser bundle. Until the addresses live in a
 * server-free module of their own, these two lists have to be kept in step by
 * hand — one list per side, not one per button.
 */
const DEMO_SEATS = {
  platformAdmin: 'admin@yasinaslan.com.tr',
  sme: 'demo@usfinbridge.com',
  tto: 'ayse@tto.edu.tr',
} as const;

interface AuthCardProps {
  locale: string;
  defaultMode?: 'login' | 'register';
}

export default function AuthCard({ locale, defaultMode = 'login' }: AuthCardProps) {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : defaultMode;
  
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const isTr = locale === 'tr';
  const tDemo = useTranslations('DemoSignIn');
  const tCommon = useTranslations('Common');
  const tAuthCard = useTranslations('Auth');

  const rawCallbackUrl = searchParams.get('callbackUrl') || `/${locale}/default/dashboard`;

  // Form states
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * TASK-MTSWLANXSU0IG (A3) — never pre-ticked, and never persisted across a
   * reload. A box that arrives already ticked records nothing about what the
   * person did; the whole value of the record is that the tick was an act.
   *
   * This gates registration only. Signing in to an account that already exists
   * does not need it — the acknowledgement was made when that account was
   * created, and asking again every time trains people to click past it. The
   * server enforces the same rule and does not take this component's word for
   * it: `authorize` demands the stamp only on the branch that creates a user.
   */
  const [acknowledged, setAcknowledged] = useState(false);
  const isRegistering = mode === 'register';

  /**
   * The versions actually on screen, sent with the form. The server refuses a
   * stamp that no longer matches the current documents, so a tab left open
   * across a change to the notice cannot acknowledge the old text.
   */
  const acknowledgementToken = acknowledged ? registrationAcknowledgementToken() : undefined;

  /** Shown next to the box so the screenshot of a consent shows what it covered. */
  const documentVersionLabel = `${PRIVACY_NOTICE.id}@${PRIVACY_NOTICE.version} · ${TERMS_OF_SERVICE.id}@${TERMS_OF_SERVICE.version}`;

  // Social Sign-In
  const handleSocialLogin = async (provider: 'google' | 'microsoft-entra-id') => {
    // An OAuth sign-up creates the account inside the provider callback, where
    // this form is long gone — so the tick has to be taken before the redirect
    // starts, or there is nothing left to take it from.
    if (isRegistering && !acknowledged) {
      setErrorMessage(tAuthCard('disclosureRequired'));
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await loginWithSocialAction(provider, rawCallbackUrl, acknowledgementToken);
    } catch (err) {
      if (isNextRedirectError(err)) {
        return;
      }
      setErrorMessage(toErrorMessage(err, (isTr ? 'Giriş işlemi başlatılamadı.' : 'Login could not be initiated.')));
      setIsLoading(false);
    }
  };

  // Credentials Submit (Handles both Login and Registration)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    // The button is disabled in this state too; this is the second line, for a
    // submit that arrives by keyboard or with the attribute stripped. Neither
    // is the real gate — `authorize` refuses to create an account without the
    // stamp regardless of what this component sends.
    if (isRegistering && !acknowledged) {
      setErrorMessage(tAuthCard('disclosureRequired'));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await loginWithCredentialsAction(
        email.trim(), 
        password || 'demo1234', 
        rawCallbackUrl, 
        locale,
        acknowledgementToken
      );
      
      if (res?.error) {
        setErrorMessage(res.error);
        setIsLoading(false);
      } else {
        window.location.href = rawCallbackUrl;
      }
    } catch (err) {
      if (isNextRedirectError(err)) {
        window.location.href = rawCallbackUrl;
        return;
      }
      setErrorMessage(toErrorMessage(err, (isTr ? 'Bir hata oluştu.' : 'An error occurred.')));
      setIsLoading(false);
    }
  };

  // Demo User Quick Login
  const handleDemoLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await loginWithCredentialsAction(demoEmail, 'demopassword', rawCallbackUrl, locale);
      if (res?.error) {
        setErrorMessage(res.error);
        setIsLoading(false);
      } else {
        window.location.href = rawCallbackUrl;
      }
    } catch (err) {
      if (isNextRedirectError(err)) {
        window.location.href = rawCallbackUrl;
        return;
      }
      setErrorMessage(toErrorMessage(err, (isTr ? 'Demo girişi başarısız.' : 'Demo login failed.')));
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 shadow-2xl w-full max-w-md space-y-6 relative overflow-hidden">
      {/* Decorative Gradient Bar */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-accent via-indigo-500 to-emerald-500"></div>

      {/* Mode Switcher Tabs (Birleştirilmiş Giriş & Kayıt Sekmeleri - High Contrast) */}
      <div className="flex bg-ground p-1.5 rounded-2xl border border-border gap-1.5 shadow-inner">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setErrorMessage(null);
          }}
          className={`flex-1 py-3 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all duration-200 text-center flex items-center justify-center gap-2 cursor-pointer ${
            mode === 'login'
              ? 'bg-accent text-white shadow-md ring-2 ring-accent/30 scale-[1.02]'
              : 'text-ink-2 hover:text-ink hover:bg-surface-hover/60 font-semibold'
          }`}
        >
          <span>🔑</span>
          <span>{isTr ? 'Giriş Yap' : 'Sign In'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setErrorMessage(null);
          }}
          className={`flex-1 py-3 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all duration-200 text-center flex items-center justify-center gap-2 cursor-pointer ${
            mode === 'register'
              ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-500/30 scale-[1.02]'
              : 'text-ink-2 hover:text-ink hover:bg-surface-hover/60 font-semibold'
          }`}
        >
          <span>🚀</span>
          <span>{isTr ? 'Ücretsiz Kayıt Ol' : 'Create Workspace'}</span>
        </button>
      </div>

      {/* Dynamic Header */}
      <div className="text-center space-y-2 pt-1">
        <div className="flex items-center justify-center pb-1">
          <Image src="/logo.png" alt={tCommon('logoAlt', { brand: PRODUCT_NAME })} width={64} height={64} className="object-contain" />
        </div>
        <h1 className="text-2xl font-bold font-heading text-ink tracking-tight">
          {mode === 'login'
            ? tAuthCard('signInTitle', { brand: PRODUCT_NAME })
            : (isTr ? 'Ücretsiz Çalışma Alanı Açın' : 'Create Free Workspace')}
        </h1>
        <p className="text-xs text-muted max-w-xs mx-auto">
          {mode === 'login'
            ? (isTr
                ? 'Horizon Europe, Digital Europe ve Eurostars projelerinizi tek merkezden yönetin.'
                : 'Access your proposal pipeline, CORDIS network graph, and AI modules.')
            : (isTr
                ? '1 dakika içinde kuruluşunuzu kaydedin ve AI proje araçlarını deneyimleyin.'
                : 'Start in seconds with Google, Microsoft or work email.')}
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3 bg-bad/15 border border-bad/30 text-bad text-xs rounded-xl flex items-center justify-between animate-in fade-in duration-200">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold text-bad ml-2">✕</button>
        </div>
      )}

      {/* Social Sign-In Buttons */}
      <div className="space-y-2.5">
        <button
          onClick={() => handleSocialLogin('google')}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-surface hover:bg-surface-hover text-ink border border-border font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl shadow-2xs transition disabled:opacity-60 cursor-pointer"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>{isTr ? 'Google ile Devam Et' : 'Continue with Google'}</span>
        </button>

        <button
          onClick={() => handleSocialLogin('microsoft-entra-id')}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-ground hover:bg-surface-hover text-ink font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl border border-border shadow-2xs transition disabled:opacity-60 cursor-pointer"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 23 23">
            <path fill="#f35325" d="M1 1h10v10H1z"/>
            <path fill="#81bc06" d="M12 1h10v10H12z"/>
            <path fill="#05a6f0" d="M1 12h10v10H1z"/>
            <path fill="#ffba08" d="M12 12h10v10H12z"/>
          </svg>
          <span>{isTr ? 'Microsoft Kurumsal ile Giriş' : 'Sign in with Microsoft'}</span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="border-t border-border w-full"></div>
        <span className="bg-surface px-3 text-[11px] text-muted uppercase font-mono">
          {isTr ? 'veya e-posta ile' : 'or with email'}
        </span>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {mode === 'register' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                {isTr ? 'Ad Soyad' : 'Full Name'}
              </label>
              <input
                type="text"
                placeholder="Dr. Ahmet Yılmaz"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs bg-ground border border-border rounded-xl p-2.5 text-ink placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                {isTr ? 'Kurum Adı' : 'Org Name'}
              </label>
              <input
                type="text"
                placeholder="Ar-Ge Ltd. Şti."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full text-xs bg-ground border border-border rounded-xl p-2.5 text-ink placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-ink mb-1">
            {isTr ? 'Kurumsal E-posta Adresi' : 'Work Email Address'}
          </label>
          <input
            type="email"
            required
            placeholder="ad.soyad@kurum.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full text-xs bg-ground border border-border rounded-xl p-2.5 text-ink placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-ink">
              {isTr ? 'Şifre' : 'Password'}
            </label>
            <span className="text-[10px] text-muted">
              {isTr ? 'Demo için serbest' : 'Optional for demo'}
            </span>
          </div>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full text-xs bg-ground border border-border rounded-xl p-2.5 text-ink placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-accent"
          />
        </div>

        {/*
          TASK-MTSWLANXSU0IG (A3) — the disclosure step.

          It says "I have read ... and I accept ...", NOT "I consent to the
          processing of my data". That wording is not politeness, it is the
          register: docs/legal/processing-register.md §1 puts account creation
          on KVKK md.5/2-c / GDPR art.6(1)(b), the contract. Asking for consent
          to processing that runs on a contract basis would misdescribe the
          basis and imply a right to withdraw that does not exist here — of the
          register's 18 activities, exactly one (§11, calendar OAuth) rests on
          consent, and it writes no data yet. So this box records an art.13
          disclosure and a terms acceptance, and `Consent.kind` keeps them
          distinct from consent on the record.
        */}
        {isRegistering && (
          <div className="rounded-xl border border-border bg-ground/60 p-3 space-y-1.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="disclosureAck"
                data-testid="disclosure-ack"
                // No `defaultChecked`, and no value restored from storage.
                checked={acknowledged}
                onChange={(e) => {
                  setAcknowledged(e.target.checked);
                  if (e.target.checked) setErrorMessage(null);
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent cursor-pointer"
              />
              <span className="text-[11px] leading-relaxed text-ink-2">
                {tAuthCard.rich('disclosureAck', {
                  privacy: (chunks) => (
                    <a
                      href={PRIVACY_NOTICE.href(locale)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-accent underline underline-offset-2"
                    >
                      {chunks}
                    </a>
                  ),
                  terms: (chunks) => (
                    <a
                      href={TERMS_OF_SERVICE.href(locale)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-accent underline underline-offset-2"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </span>
            </label>
            {/*
              The version is on screen because it is what gets stored. A
              screenshot of this box is then evidence of a specific text, not of
              a tick against whatever the notice happens to say today.
            */}
            <p className="text-[10px] font-mono text-muted pl-6.5" data-testid="disclosure-version">
              {tAuthCard('disclosureVersion', { version: documentVersionLabel })}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || (isRegistering && !acknowledged)}
          className="w-full bg-accent hover:opacity-90 text-white font-bold text-xs sm:text-sm py-3 rounded-xl shadow-2xs transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>{isTr ? 'İşlem Yapılıyor...' : 'Processing...'}</span>
            </>
          ) : (
            <span>
              {mode === 'login'
                ? (isTr ? 'E-posta ile Giriş Yap →' : 'Sign In with Email →')
                : (isTr ? 'Çalışma Alanı Oluştur →' : 'Create Workspace →')}
            </span>
          )}
        </button>
      </form>

      {/*
        TASK-MTRNQHC3IV2BE — the demo buttons name a ROLE, not a person.

        Each of these used to be headlined with an invented individual and an
        academic title — "Dr. Mehmet Yılmaz", "Prof. Dr. Ayşe Kaya" — which is
        the first thing a visitor sees on the public login page, and the same
        names src/lib/auth.ts then stamped onto the session. What the button
        honestly knows is the seat it signs into and the address it signs in
        with, so that is what it shows. src/lib/user-display.ts states the same
        rule for the app frame.
      */}
      {/* ─── QUICK 1-CLICK DEMO ACCOUNTS ─── */}
      <div className="pt-3 border-t border-border space-y-2">
        <div className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center justify-between">
          <span>{isTr ? '⚡ Hızlı Demo Giriş Rolleri' : '⚡ One-Click Demo Profiles'}</span>
          <span className="text-[10px] font-mono text-accent">Şifresiz Oturum</span>
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          <button
            type="button"
            onClick={() => handleDemoLogin(DEMO_SEATS.platformAdmin)}
            className="p-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-xl text-left transition flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">👑</span>
              <div>
                <div className="font-bold text-xs text-accent-ink">{tDemo('rolePlatformAdmin')}</div>
                <div className="text-[10px] text-muted font-mono">{DEMO_SEATS.platformAdmin}</div>
              </div>
            </div>
            <span className="text-xs font-bold text-accent group-hover:translate-x-0.5 transition-transform">Giriş →</span>
          </button>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => handleDemoLogin(DEMO_SEATS.sme)}
              className="p-2 bg-ground hover:bg-surface border border-border rounded-xl text-left transition flex items-center justify-between group cursor-pointer"
            >
              <div>
                <div className="font-bold text-xs text-ink group-hover:text-accent transition-colors">{tDemo('roleSme')}</div>
                <div className="text-[10px] text-muted font-mono">{DEMO_SEATS.sme}</div>
              </div>
              <span className="text-xs text-muted group-hover:text-accent">→</span>
            </button>

            <button
              type="button"
              onClick={() => handleDemoLogin(DEMO_SEATS.tto)}
              className="p-2 bg-ground hover:bg-surface border border-border rounded-xl text-left transition flex items-center justify-between group cursor-pointer"
            >
              <div>
                <div className="font-bold text-xs text-ink group-hover:text-accent transition-colors">{tDemo('roleTto')}</div>
                <div className="text-[10px] text-muted font-mono">{DEMO_SEATS.tto}</div>
              </div>
              <span className="text-xs text-muted group-hover:text-accent">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
