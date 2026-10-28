import React from 'react';
import Image from 'next/image';
import { auth } from '@/lib/auth';
import { isPlatformAdminSession } from '@/lib/tenant';
import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';
import { displayUserName } from '@/lib/user-display';
import { listSessionWorkspaces } from '@/lib/workspaces';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import AdminSidebarNav from '@/components/AdminSidebarNav';
import { getModuleCounts } from '@/lib/modules/registry';
import {
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

import MobileAdminHeader from '@/components/MobileAdminHeader';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale?: string }>;
}) {
  const resolvedParams = await params;
  const locale = resolvedParams?.locale || 'tr';
  const session = await auth();

  // auth.ts already resolves the flag for the superadmin email, so the check is
  // the shared claim reader rather than a second email allow-list here.
  const isPlatformAdmin = isPlatformAdminSession(session);

  if (!isPlatformAdmin) {
    notFound();
  }

  // The user menu's workspace switcher lists real Workspace rows of the admin's
  // own tenant, not the two names that used to be written into the component.
  const workspaces = await listSessionWorkspaces(session);
  const moduleCounts = getModuleCounts();

  // The admin navigation is rendered by <AdminSidebarNav />; this file used to carry a
  // second copy of the same list that nothing read.

  const user = session?.user;
  const t = await getTranslations({ locale, namespace: 'UserIdentity' });
  const tCommon = await getTranslations({ locale, namespace: 'Common' });

  // Same rule as the workspace frame: never invent who is signed in. The console used to
  // fall back onto a fixed title and onto a real person's e-mail address, so an admin
  // session without a name was labelled with somebody else's account.
  const userName = displayUserName(user?.name, user?.email, t('unnamedUser'));
  const userEmail = user?.email || undefined;
  const userImage = user?.image || undefined;
  // The route is already gated by `isPlatformAdminSession` above; the badge only reports
  // the role the session actually carries, and SUPER_ADMIN is never assumed.
  const roleName = session?.role || undefined;

  return (
    <div className="min-h-screen bg-ground text-ink flex flex-col font-sans">
      {/* Mobile Top Admin Header */}
      <MobileAdminHeader
        locale={locale}
        userName={userName}
        userEmail={userEmail}
        userImage={userImage}
        roleName={roleName}
        workspaces={workspaces}
        moduleCounts={moduleCounts}
      />

      {/* Desktop Header */}
      <header className="hidden md:flex bg-slate-900 text-white border-b border-slate-800 px-6 py-3.5 items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center space-x-4">
          <Link href={`/${locale}`} title={locale === 'tr' ? 'Ana Sayfa' : 'Home'} className="flex items-center space-x-2.5 hover:opacity-90 transition">
            <Image src="/logo.png" alt={tCommon('logoAlt', { brand: PRODUCT_NAME })} width={40} height={40} className="object-contain brightness-0 invert" />
            <div>
              <span className="font-bold text-base tracking-tight text-white block leading-none">
                Admin Console
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Platform Console v1.1
              </span>
            </div>
          </Link>

          <ChevronRight className="w-4 h-4 text-ink-2" />
        </div>

        {/* Header Right Actions & User Menu */}
        <div className="flex items-center space-x-3">
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

      {/* ───────────────────────── MAIN BODY (SIDEBAR + CONTENT) ───────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-72 bg-surface border-r border-border flex-col justify-between p-4 space-y-6 shadow-2xs">
          <div className="space-y-4">
            <div className="px-3 py-1">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                Yönetim Menüsü
              </span>
            </div>

            <AdminSidebarNav locale={locale} moduleCounts={moduleCounts} />
          </div>
        </aside>

        {/* ───────────────────────── CONTENT AREA ───────────────────────── */}
        <main className="flex-1 px-edge py-4 sm:p-8 overflow-y-auto bg-ground">
          {children}
        </main>
      </div>

      {/* ───────────────────────── ADMIN FOOTER ───────────────────────── */}
      <footer className="bg-surface border-t border-border px-6 py-4 flex flex-col md:flex-row items-center justify-between text-xs text-muted gap-3 z-10">
        <div className="flex items-center space-x-3">
          <Link href={`/${locale}`} className="font-semibold text-ink-2 hover:text-indigo-600 transition-colors" title="Site Ana Sayfasına Git">
            {PRODUCT_NAME}
          </Link>
          <span>•</span>
          <span>Platform Admin Console v1.1.0</span>
        </div>

        <div className="flex items-center space-x-4">
          <a
            href="https://fonbridge.com/yardim"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink transition-colors flex items-center gap-1"
          >
            <span>Dokümantasyon</span>
            <ExternalLink className="w-3 h-3 text-muted" />
          </a>
          <Link href={`/${locale}/privacy`} className="hover:text-ink transition-colors">
            Gizlilik & DPA
          </Link>
          <Link href={`/${locale}/admin/audit`} className="hover:text-ink transition-colors">
            Denetim İzleri
          </Link>
        </div>
      </footer>
    </div>
  );
}
