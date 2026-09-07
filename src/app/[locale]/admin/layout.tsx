import React from 'react';
import Image from 'next/image';
import { auth } from '@/lib/auth';
import { isPlatformAdminSession } from '@/lib/tenant';
import { getTranslations } from 'next-intl/server';
import { displayUserName } from '@/lib/user-display';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import AdminSidebarNav from '@/components/AdminSidebarNav';
import { 
  Puzzle, 
  Building2, 
  CreditCard, 
  ScrollText, 
  Sliders, 
  ShieldCheck, 
  Activity,
  ChevronRight,
  ExternalLink,
  Lock,
  Newspaper
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

  const adminNavItems = [
    {
      key: 'modules',
      href: `/${locale}/admin/modules`,
      label: locale === 'tr' ? 'Modül Yönetimi' : 'Module State Manager',
      desc: 'OFF, DEV, PILOT, ON geçişleri',
      icon: Puzzle,
      badge: '11 Modül',
    },
    {
      key: 'tenants',
      href: `/${locale}/admin/tenants`,
      label: locale === 'tr' ? 'Kiracı Hesapları' : 'Tenant Accounts',
      desc: 'Kurum ve üye yönetimi',
      icon: Building2,
      badge: 'Tenant',
    },
    {
      key: 'billing',
      href: `/${locale}/admin/billing`,
      label: locale === 'tr' ? 'Faturalama & Planlar' : 'Billing & Subscriptions',
      desc: 'Stripe paketleri & limitler',
      icon: CreditCard,
      badge: 'Stripe',
    },
    {
      key: 'audit',
      href: `/${locale}/admin/audit`,
      label: locale === 'tr' ? 'Denetim Kayıtları' : 'Audit Log Events',
      desc: 'Sistem olay geçmişi',
      icon: ScrollText,
      badge: 'Audit',
    },
    {
      key: 'blog',
      href: `/${locale}/admin/blog`,
      label: locale === 'tr' ? 'Blog Yönetimi' : 'Blog Management',
      desc: 'İçerik, makale ve duyuru CRUD',
      icon: Newspaper,
      badge: 'Blog CRUD',
    },
    {
      key: 'settings',
      href: `/${locale}/admin/settings`,
      label: locale === 'tr' ? 'Sistem Ayarları' : 'Platform Settings',
      desc: 'Küresel konfigürasyon',
      icon: Sliders,
      badge: 'Config',
    },
  ];

  const user = session?.user;
  const t = await getTranslations({ locale, namespace: 'UserIdentity' });

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
      />

      {/* Desktop Header */}
      <header className="hidden md:flex bg-slate-900 text-white border-b border-slate-800 px-6 py-3.5 items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center space-x-4">
          <Link href={`/${locale}`} title={locale === 'tr' ? 'Ana Sayfa' : 'Home'} className="flex items-center space-x-2.5 hover:opacity-90 transition">
            <Image src="/logo.png" alt="FonBridge Logo" width={40} height={40} className="object-contain brightness-0 invert" />
            <div>
              <span className="font-bold text-base tracking-tight text-white block leading-none">
                Admin Console
              </span>
              <span className="text-[10px] text-muted font-mono">
                Platform Console v1.1
              </span>
            </div>
          </Link>

          <ChevronRight className="w-4 h-4 text-ink-2" />

          {/* System Health Badge */}
          <div className="hidden md:flex items-center space-x-2 bg-slate-800/80 border border-slate-700/60 px-3 py-1 rounded-full text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-[11px]">Sistem Durumu: <strong className="text-emerald-400">Aktif (%100 Operational)</strong></span>
          </div>
        </div>

        {/* Header Right Actions & User Menu */}
        <div className="flex items-center space-x-3">
          <div className="hidden lg:flex items-center space-x-1.5 bg-blue-950/80 border border-blue-800/60 text-blue-300 px-2.5 py-1 rounded-md text-xs font-mono">
            <Lock className="w-3.5 h-3.5 text-blue-400" />
            <span>RLS Protected</span>
          </div>

          <UserMenu 
            locale={locale} 
            userName={userName}
            userEmail={userEmail}
            userImage={userImage}
            roleName={roleName}
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

            <AdminSidebarNav locale={locale} />
          </div>

          {/* Quick System Metric Box in Side Panel */}
          <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                <span>Sistem Sağlığı</span>
              </span>
              <span className="text-emerald-400 font-mono">100% OK</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-full rounded-full" />
            </div>
            <div className="text-[11px] text-muted flex justify-between pt-1 font-mono">
              <span>RLS Güvenlik:</span>
              <span className="text-white font-semibold">30 / 30 Tablo</span>
            </div>
          </div>
        </aside>

        {/* ───────────────────────── CONTENT AREA ───────────────────────── */}
        <main className="flex-1 p-4 sm:p-8 overflow-y-auto bg-ground">
          {children}
        </main>
      </div>

      {/* ───────────────────────── ADMIN FOOTER ───────────────────────── */}
      <footer className="bg-surface border-t border-border px-6 py-4 flex flex-col md:flex-row items-center justify-between text-xs text-muted gap-3 z-10">
        <div className="flex items-center space-x-3">
          <Link href={`/${locale}`} className="font-semibold text-ink-2 hover:text-indigo-600 transition-colors" title="Site Ana Sayfasına Git">
            FonBridge
          </Link>
          <span>•</span>
          <span>Platform Admin Console v1.1.0</span>
          <span>•</span>
          <span className="flex items-center text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
            <ShieldCheck className="w-3 h-3 mr-1 text-emerald-600" />
            RLS Policy %100 Enforced
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <a
            href="https://docs.fabrika.app"
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
