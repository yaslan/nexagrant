'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loginWithCredentialsAction, loginWithSocialAction } from '@/lib/actions/auth';
import { errorMessage as toErrorMessage, isNextRedirectError } from '@/lib/errors';

interface LoginFormProps {
  locale: string;
}

export default function LoginForm({ locale }: LoginFormProps) {
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get('callbackUrl') || `/${locale}/default/dashboard`;

  const isTr = locale === 'tr';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Social Sign-In (Google & Microsoft)
  const handleSocialLogin = async (provider: 'google' | 'microsoft-entra-id') => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await loginWithSocialAction(provider, rawCallbackUrl);
    } catch (err) {
      if (isNextRedirectError(err)) {
        return;
      }
      setErrorMessage(toErrorMessage(err, (isTr ? 'Giriş işlemi başlatılamadı.' : 'Login could not be initiated.')));
      setIsLoading(false);
    }
  };

  // Email / Credentials Sign-In
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await loginWithCredentialsAction(email.trim(), password || 'demo1234', rawCallbackUrl, locale);
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

  // Quick Demo User Shortcut
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
    <div className="space-y-6">
      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3 bg-bad/15 border border-bad/30 text-bad text-xs rounded-xl flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold text-bad ml-2">✕</button>
        </div>
      )}

      {/* ─── GOOGLE & SOCIAL LOGIN BUTTONS ─── */}
      <div className="space-y-3">
        {/* Google Button */}
        <button
          onClick={() => handleSocialLogin('google')}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-surface hover:bg-surface-hover text-ink border border-border font-semibold text-xs sm:text-sm py-3 px-4 rounded-xl shadow-2xs hover:border-border transition disabled:opacity-60 cursor-pointer"
        >
          {/* Official Google 'G' SVG Logo */}
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{isTr ? 'Google ile Giriş Yap' : 'Continue with Google'}</span>
        </button>

        {/* Microsoft Entra Button */}
        <button
          onClick={() => handleSocialLogin('microsoft-entra-id')}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-ground hover:bg-surface-hover text-ink font-semibold text-xs sm:text-sm py-3 px-4 rounded-xl border border-border shadow-2xs transition disabled:opacity-60 cursor-pointer"
        >
          {/* Microsoft Quad Logo */}
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

      {/* ─── EMAIL & PASSWORD FORM ─── */}
      <form onSubmit={handleEmailLogin} className="space-y-4">
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
            className="w-full text-xs bg-ground border border-border rounded-xl p-3 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
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
            className="w-full text-xs bg-ground border border-border rounded-xl p-3 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-accent hover:opacity-90 text-white font-bold text-xs sm:text-sm py-3 rounded-xl shadow-2xs transition disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>{isTr ? 'Giriş Yapılıyor...' : 'Signing in...'}</span>
            </>
          ) : (
            <span>{isTr ? 'E-posta ile Devam Et →' : 'Continue with Email →'}</span>
          )}
        </button>
      </form>

      {/* ─── QUICK 1-CLICK DEMO ACCOUNTS ─── */}
      <div className="pt-4 border-t border-border space-y-2.5">
        <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
          {isTr ? '⚡ Tek Tıkla Demo Giriş Rolleri' : '⚡ One-Click Demo Profiles'}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleDemoLogin('mehmet@fonbridge.app')}
            className="p-2.5 bg-ground hover:bg-surface border border-border rounded-xl text-left transition flex items-center justify-between group cursor-pointer"
          >
            <div>
              <div className="font-bold text-xs text-ink group-hover:text-accent transition-colors">Dr. Mehmet Yılmaz</div>
              <div className="text-[10px] text-muted">KOBİ Ar-Ge Koordinatörü</div>
            </div>
            <span className="text-xs text-muted group-hover:text-accent">→</span>
          </button>

          <button
            type="button"
            onClick={() => handleDemoLogin('ayse@tto.edu.tr')}
            className="p-2.5 bg-ground hover:bg-surface border border-border rounded-xl text-left transition flex items-center justify-between group cursor-pointer"
          >
            <div>
              <div className="font-bold text-xs text-ink group-hover:text-accent transition-colors">Prof. Dr. Ayşe Kaya</div>
              <div className="text-[10px] text-muted">Üniversite TTO Lideri</div>
            </div>
            <span className="text-xs text-muted group-hover:text-accent">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
