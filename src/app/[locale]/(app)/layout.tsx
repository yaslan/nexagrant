import React from 'react';
import Link from 'next/link';
import SidebarNav from '@/components/SidebarNav';
import UserMenu from '@/components/UserMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { displayUserName } from '@/lib/user-display';

import MobileAppHeader from '@/components/MobileAppHeader';
import FeedbackWidget from '@/components/FeedbackWidget';

export default async function AppLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; workspace?: string }>;
}) {
  const { locale, workspace = 'default' } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/${locale}/${locale === 'tr' ? 'giris' : 'login'}`);
  }

  const user = session.user;
  const t = await getTranslations({ locale, namespace: 'UserIdentity' });

  // Never invent an identity. The name falls back to the e-mail local part and then to a
  // translated "unnamed user" label; the e-mail is shown only if the session carries one.
  const userName = displayUserName(user.name, user.email, t('unnamedUser'));
  const userEmail = user.email || undefined;
  const userImage = user.image || undefined;

  // Display only: every authorization decision reads `session.role` server-side
  // (src/lib/tenant.ts, src/lib/rbac.ts). Assuming the HIGHEST role here would put a
  // "TENANT_OWNER" badge on a session that holds no role at all, so an absent role stays
  // absent and the menu labels it as unassigned.
  const roleName = session?.role || undefined;
  const isPlatformAdmin = Boolean(
    session?.isPlatformAdmin ||
    session?.user?.isPlatformAdmin ||
    userEmail === 'admin@yasinaslan.com.tr' ||
    roleName === 'SUPER_ADMIN' ||
    roleName === 'PLATFORM_ADMIN'
  );

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      {/* Mobile Top Header */}
      <MobileAppHeader
        locale={locale}
        userName={userName}
        userEmail={userEmail}
        userImage={userImage}
        roleName={roleName}
        isPlatformAdmin={isPlatformAdmin}
      />

      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex w-64 bg-surface border-r border-border flex-col shrink-0">
        <Link
          href={`/${locale}`}
          title={locale === 'tr' ? 'Ana Sayfa' : 'Home'}
          className="p-4 border-b border-border flex items-center justify-center hover:bg-surface-hover transition-colors group cursor-pointer"
        >
          <img 
            src="/logo.png" 
            alt="FonBridge Logo" 
            className="h-18 w-auto object-contain group-hover:scale-105 transition shrink-0" 
          />
        </Link>

        <SidebarNav locale={locale} isPlatformAdmin={isPlatformAdmin} />
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Desktop Header */}
        <header className="hidden md:flex h-14 border-b border-border bg-surface items-center px-6 justify-between shadow-2xs shrink-0">
          <div className="flex items-center space-x-3">
          </div>
          <div className="flex items-center space-x-3">
            <ThemeToggle variant="button" locale={locale} />
            <UserMenu
              locale={locale}
              userName={userName}
              userEmail={userEmail}
              userImage={userImage}
              roleName={roleName}
            />
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-background p-4 sm:p-6">
          {children}
        </main>
      </div>

      {/* E11.2 — beta feedback entry point, present on every workspace page */}
      <FeedbackWidget locale={locale} workspace={workspace} />
    </div>
  );
}

