'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import SidebarNav from './SidebarNav';
import UserMenu, { type UserMenuWorkspace } from './UserMenu';
import ThemeToggle from './ThemeToggle';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PRODUCT_NAME } from '@/lib/brand';

interface MobileAppHeaderProps {
  locale: string;
  userName?: string;
  userEmail?: string;
  userImage?: string;
  roleName?: string;
  isPlatformAdmin?: boolean;
  /** Real workspaces of the session, resolved server-side. See UserMenu. */
  workspaces?: UserMenuWorkspace[];
}

export default function MobileAppHeader({
  locale,
  userName,
  userEmail,
  userImage,
  roleName,
  isPlatformAdmin = false,
  workspaces = [],
}: MobileAppHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const tCommon = useTranslations('Common');

  return (
    <>
      {/* Mobile Top Header */}
      <header className="h-14 border-b border-border bg-surface flex md:hidden items-center px-4 justify-between shadow-2xs shrink-0 sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-1 text-ink-2 hover:text-ink hover:bg-surface-hover rounded-lg transition"
            aria-label="Open Mobile Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link href={`/${locale}`} className="flex items-center">
            <Image
              src="/logo.png"
              alt={tCommon('logoAlt', { brand: PRODUCT_NAME })}
              width={32}
              height={32}
              className="object-contain"
            />
          </Link>
        </div>

        <div className="flex items-center space-x-2">
          <ThemeToggle variant="button" locale={locale} />
          <UserMenu
            locale={locale}
            userName={userName}
            userEmail={userEmail}
            userImage={userImage}
            roleName={roleName}
            workspaces={workspaces}
          />
        </div>
      </header>

      {/* Mobile Slide-Over Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-4/5 max-w-xs bg-surface h-full flex flex-col z-10 shadow-2xl border-r border-border animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <Link href={`/${locale}`} onClick={() => setMobileOpen(false)}>
                <Image
                  src="/logo.png"
                  alt={tCommon('logoAlt', { brand: PRODUCT_NAME })}
                  width={40}
                  height={40}
                  className="object-contain"
                />
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 text-ink-2 hover:text-ink hover:bg-surface-hover rounded-lg transition"
                aria-label="Close Mobile Menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav Body */}
            <div className="flex-1 overflow-y-auto" onClick={() => setMobileOpen(false)}>
              <SidebarNav locale={locale} isPlatformAdmin={isPlatformAdmin} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
