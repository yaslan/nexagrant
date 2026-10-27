'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { 
  Puzzle, 
  Building2, 
  CreditCard, 
  ScrollText, 
  Sliders, 
  Newspaper,
  MessageSquareWarning,
  ShieldAlert,
  Percent,
  FileText,
  Inbox,
  UserCheck,
  Globe,
  Network
} from 'lucide-react';
import type { ModuleCounts } from '@/lib/modules/registry';

interface AdminSidebarNavProps {
  locale: string;
  /** From `getModuleCounts()` on the server, so the registry stays out of the client bundle. */
  moduleCounts: ModuleCounts;
}

export default function AdminSidebarNav({ locale, moduleCounts }: AdminSidebarNavProps) {
  const pathname = usePathname();
  const tLeads = useTranslations('adminLeads');
  const tExperts = useTranslations('AdminExpertPrereg');
  const tInterreg = useTranslations('adminInterreg');
  const tPartnerSearch = useTranslations('adminPartnerSearch');
  const tModuleCount = useTranslations('moduleCount');

  const adminNavItems = [
    {
      key: 'modules',
      href: `/${locale}/admin/modules`,
      label: locale === 'tr' ? 'Modül Yönetimi' : 'Module State Manager',
      desc: 'OFF, DEV, PILOT, ON geçişleri',
      icon: Puzzle,
      badge: tModuleCount('badge', moduleCounts),
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
      key: 'feedback',
      href: `/${locale}/admin/feedback`,
      label: locale === 'tr' ? 'Geri Bildirim Triyajı' : 'Feedback Triage',
      desc: 'Beta kayıtları, P0–P3 önceliklendirme',
      icon: MessageSquareWarning,
      badge: 'Beta',
    },
    {
      key: 'alerts',
      href: `/${locale}/admin/alerts`,
      label: locale === 'tr' ? 'Sistem Uyarıları' : 'System Alerts',
      desc: 'Hata ve geri bildirim uyarıları, çözüldü takibi',
      icon: ShieldAlert,
      badge: 'Alerts',
    },
    {
      key: 'topic-stats',
      href: `/${locale}/admin/topic-stats`,
      label: locale === 'tr' ? 'Taban Oranlar (K3)' : 'Base Rates (K3)',
      desc: 'Horizon Dashboard xlsx → TopicStat',
      icon: Percent,
      badge: 'K3',
    },
    {
      key: 'documents',
      href: `/${locale}/admin/documents`,
      label: locale === 'tr' ? 'Belgeler (K6 RAG)' : 'Documents (K6 RAG)',
      desc: locale === 'tr' ? 'Çalışma programı PDF → paylaşılan RAG' : 'Work programme PDF → shared RAG',
      icon: FileText,
      badge: 'K6',
    },
    {
      key: 'interreg',
      href: `/${locale}/admin/interreg`,
      label: 'Interreg & keep.eu',
      desc: tInterreg('navDesc'),
      icon: Globe,
      badge: 'Interreg',
    },
    {
      key: 'partner-search',
      href: `/${locale}/admin/partner-search`,
      label: tPartnerSearch('navLabel'),
      desc: tPartnerSearch('navDesc'),
      icon: Network,
      badge: 'PS',
    },
    {
      key: 'leads',
      href: `/${locale}/admin/leads`,
      label: tLeads('nav_label'),
      desc: tLeads('nav_desc'),
      icon: Inbox,
      badge: 'Lead',
    },
    {
      key: 'uzman-kayitlari',
      href: `/${locale}/admin/uzman-kayitlari`,
      label: tExperts('nav_label'),
      desc: tExperts('nav_desc'),
      icon: UserCheck,
      badge: 'FO-20',
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

  return (
    <nav className="space-y-1">
      {adminNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname?.includes(item.href) || pathname?.includes(`/admin/${item.key}`);

        return (
          <Link
            key={item.key}
            href={item.href}
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all border ${
              isActive
                ? 'bg-blue-600/10 text-blue-700 dark:text-blue-400 font-bold border-blue-500/30 shadow-2xs'
                : 'text-ink-2 hover:bg-surface-hover/80 hover:text-ink border-transparent'
            }`}
          >
            <div className="flex items-start space-x-3">
              <Icon className={`w-4 h-4 mt-0.5 transition-colors ${isActive ? 'text-blue-600' : 'text-muted'}`} />
              <div>
                <div className={`text-xs ${isActive ? 'font-bold text-blue-700 dark:text-blue-400' : 'font-semibold text-ink'}`}>
                  {item.label}
                </div>
                <div className="text-[11px] text-muted font-normal">
                  {item.desc}
                </div>
              </div>
            </div>
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-surface-hover text-ink-2'
            }`}>
              {item.badge}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
