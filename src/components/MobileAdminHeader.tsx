'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import AdminSidebarNav from './AdminSidebarNav';
import UserMenu from './UserMenu';
import { Menu, X, ShieldCheck } from 'lucide-react';

interface MobileAdminHeaderProps {
  locale: string;
  userName?: string;
  userEmail?: string;
  userImage?: string;
  roleName?: string;
}

export default function MobileAdminHeader({
  locale,
  userName,
  userEmail,
  userImage,
  roleName,
}: MobileAdminHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile Admin Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 px-4 py-3 flex md:hidden items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
            aria-label="Open Admin Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link href={`/${locale}`} title={locale === 'tr' ? 'Ana Sayfa' : 'Home'} className="flex items-center space-x-2 hover:opacity-90 transition">
            <Image src="/logo.png" alt="FonBridge Logo" width={32} height={32} className="object-contain brightness-0 invert" />
            <span className="font-bold text-sm tracking-tight text-white">Admin</span>
          </Link>
        </div>

        <div className="flex items-center space-x-2">
          <UserMenu
            locale={locale}
            userName={userName}
            userEmail={userEmail}
            userImage={userImage}
            roleName={roleName}
          />
        </div>
      </header>

      {/* Mobile Admin Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />

          <div className="relative w-4/5 max-w-xs bg-surface h-full flex flex-col z-10 shadow-2xl border-r border-border animate-in slide-in-from-left duration-200">
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Platform Admin</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4" onClick={() => setMobileOpen(false)}>
              <div className="px-2 py-1">
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  Yönetim Menüsü
                </span>
              </div>
              <AdminSidebarNav locale={locale} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
