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
  Network,
  Route
} from 'lucide-react';
import type { ModuleCounts } from '@/lib/modules/registry';

interface AdminSidebarNavProps {
  locale: string;
  /** From `getModuleCounts()` on the server, so the registry stays out of the client bundle. */
  moduleCounts: ModuleCounts;
}

export default function AdminSidebarNav({ locale, moduleCounts }: AdminSidebarNavProps) {
  const pathname = usePathname();
  const t = useTranslations('adminNav');
  const tLeads = useTranslations('adminLeads');
  const tExperts = useTranslations('AdminExpertPrereg');
  const tLeadRoutes = useTranslations('adminLeadRoutes');
  const tInterreg = useTranslations('adminInterreg');
  const tPartnerSearch = useTranslations('adminPartnerSearch');
  const tModuleCount = useTranslations('moduleCount');

  const adminNavItems = [
    {
      key: 'modules',
      href: `/${locale}/admin/modules`,
      label: t('modulesLabel'),
      desc: t('modulesDesc'),
      icon: Puzzle,
      badge: tModuleCount('badge', moduleCounts),
    },
    {
      key: 'tenants',
      href: `/${locale}/admin/tenants`,
      label: t('tenantsLabel'),
      desc: t('tenantsDesc'),
      icon: Building2,
      badge: 'Tenant',
    },
    {
      key: 'billing',
      href: `/${locale}/admin/billing`,
      label: t('billingLabel'),
      desc: t('billingDesc'),
      icon: CreditCard,
      badge: 'Stripe',
    },
    {
      key: 'feedback',
      href: `/${locale}/admin/feedback`,
      label: t('feedbackLabel'),
      desc: t('feedbackDesc'),
      icon: MessageSquareWarning,
      badge: 'Beta',
    },
    {
      key: 'alerts',
      href: `/${locale}/admin/alerts`,
      label: t('alertsLabel'),
      desc: t('alertsDesc'),
      icon: ShieldAlert,
      badge: 'Alerts',
    },
    {
      key: 'topic-stats',
      href: `/${locale}/admin/topic-stats`,
      label: t('topicStatsLabel'),
      desc: t('topicStatsDesc'),
      icon: Percent,
      badge: 'K3',
    },
    {
      key: 'documents',
      href: `/${locale}/admin/documents`,
      label: t('documentsLabel'),
      desc: t('documentsDesc'),
      icon: FileText,
      badge: 'K6',
    },
    {
      key: 'interreg',
      href: `/${locale}/admin/interreg`,
      label: t('interregLabel'),
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
      key: 'lead-routes',
      href: `/${locale}/admin/lead-routes`,
      label: tLeadRoutes('nav_label'),
      desc: tLeadRoutes('nav_desc'),
      icon: Route,
      badge: tLeadRoutes('nav_badge'),
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
      label: t('auditLabel'),
      desc: t('auditDesc'),
      icon: ScrollText,
      badge: 'Audit',
    },
    {
      key: 'blog',
      href: `/${locale}/admin/blog`,
      label: t('blogLabel'),
      desc: t('blogDesc'),
      icon: Newspaper,
      badge: 'Blog CRUD',
    },
    {
      key: 'settings',
      href: `/${locale}/admin/settings`,
      label: t('settingsLabel'),
      desc: t('settingsDesc'),
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
