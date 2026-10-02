'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import UserMenu from './UserMenu';
import { useTranslations } from 'next-intl';
import { getPublicRoute } from '@/lib/routes';
import { PRODUCT_NAME } from '@/lib/brand';

interface PublicNavbarProps {
  locale: string;
  userName?: string;
  userEmail?: string;
  userImage?: string;
  roleName?: string;
}

export default function PublicNavbar({ 
  locale,
  userName,
  userEmail,
  userImage,
  roleName,
}: PublicNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const tCommon = useTranslations('Common');
  const isTr = locale === 'tr';

  return (
    <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur-md border-b border-border transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Brand */}
        <Link
          href={getPublicRoute('home', locale)}
          scroll={true}
          onClick={() => {
            if (typeof window !== 'undefined' && window.location.pathname === `/${locale}`) {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          className="flex items-center gap-3 group cursor-pointer"
          title={isTr ? "Ana Sayfa" : "Home"}
        >
          <Image
            src="/logo.png"
            alt={tCommon('logoAlt', { brand: PRODUCT_NAME })}
            width={56}
            height={56}
            className="object-contain group-hover:scale-105 transition dark:brightness-0 dark:invert"
          />
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-ink-2">
          <a href="#stage-gate" className="hover:text-accent transition">
            {isTr ? 'Kapı Modeli' : 'Stage-Gate Model'}
          </a>
          <a href="#moduller" className="hover:text-accent transition">
            {isTr ? 'Modüller' : 'Modules'}
          </a>
          <Link href={getPublicRoute('openCalls', locale)} className="hover:text-accent transition flex items-center gap-1">
            <span>{isTr ? 'Açık Çağrılar' : 'Open Calls'}</span>
            <span className="w-2 h-2 rounded-full bg-ok animate-pulse"></span>
          </Link>
          <a href="#cordis" className="hover:text-accent transition">
            {isTr ? 'CORDIS İstihbaratı' : 'Partner Intelligence'}
          </a>
          <Link href={getPublicRoute('pricing', locale)} className="hover:text-accent transition">
            {isTr ? 'Fiyatlandırma' : 'Pricing'}
          </Link>
          <Link href={getPublicRoute('blog', locale)} className="hover:text-accent transition">
            {isTr ? 'Blog' : 'Blog'}
          </Link>
        </nav>

        {/* Right Action: User Avatar & Dropdown Menu & Theme Switcher & Language Switcher */}
        <div className="hidden md:flex items-center gap-3">
          {/* Theme Toggle Button */}
          <ThemeToggle variant="button" locale={locale} />

          {/* Language Switch */}
          <div className="flex items-center bg-ground border border-border rounded-lg p-1 text-xs font-bold">
            <Link
              href="/tr"
              className={`px-2 py-1 rounded-md transition ${
                locale === 'tr' ? 'bg-surface text-ink shadow-2xs' : 'text-muted hover:text-ink'
              }`}
            >
              TR
            </Link>
            <Link
              href="/en"
              className={`px-2 py-1 rounded-md transition ${
                locale === 'en' ? 'bg-surface text-ink shadow-2xs' : 'text-muted hover:text-ink'
              }`}
            >
              EN
            </Link>
          </div>

          {/* User Avatar & Dropdown Menu */}
          <UserMenu
            locale={locale}
            userName={userName}
            userEmail={userEmail}
            userImage={userImage}
            roleName={roleName}
          />
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle variant="button" locale={locale} />
          <UserMenu
            locale={locale}
            userName={userName}
            userEmail={userEmail}
            userImage={userImage}
            roleName={roleName}
          />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-ink-2 hover:text-ink focus:outline-hidden"
            aria-label={mobileMenuOpen ? (isTr ? "Menüyü Kapat" : "Close Menu") : (isTr ? "Menüyü Aç" : "Open Menu")}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-surface px-4 pt-3 pb-6 space-y-3 animate-in slide-in-from-top-2 duration-150">
          {/* Mobile Language Switcher */}
          <div className="flex items-center justify-between pt-1 pb-2 border-b border-border">
            <span className="text-xs font-semibold text-muted">
              {isTr ? 'Dil Seçimi / Language' : 'Language Selection'}
            </span>
            <div className="flex items-center bg-ground border border-border rounded-lg p-1 text-xs font-bold">
              <Link
                href="/tr"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-1 rounded-md transition ${
                  locale === 'tr' ? 'bg-surface text-ink shadow-2xs' : 'text-muted hover:text-ink'
                }`}
              >
                TR
              </Link>
              <Link
                href="/en"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-1 rounded-md transition ${
                  locale === 'en' ? 'bg-surface text-ink shadow-2xs' : 'text-muted hover:text-ink'
                }`}
              >
                EN
              </Link>
            </div>
          </div>

          <a
            href="#stage-gate"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-semibold text-ink-2 hover:text-accent"
          >
            {isTr ? 'Kapı Modeli' : 'Stage-Gate Model'}
          </a>
          <a
            href="#moduller"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-semibold text-ink-2 hover:text-accent"
          >
            {isTr ? 'Modüller' : 'Modules'}
          </a>
          <Link
            href={getPublicRoute('openCalls', locale)}
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-semibold text-ink-2 hover:text-accent"
          >
            {isTr ? 'Açık Çağrılar' : 'Open Calls'}
          </Link>
          <a
            href="#cordis"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-semibold text-ink-2 hover:text-accent"
          >
            {isTr ? 'CORDIS İstihbaratı' : 'Partner Intelligence'}
          </a>
          <Link
            href={getPublicRoute('pricing', locale)}
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-semibold text-ink-2 hover:text-accent"
          >
            {isTr ? 'Fiyatlandırma' : 'Pricing'}
          </Link>
          <Link
            href={getPublicRoute('blog', locale)}
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-semibold text-ink-2 hover:text-accent"
          >
            {isTr ? 'Blog' : 'Blog'}
          </Link>
        </div>
      )}
    </header>
  );
}
