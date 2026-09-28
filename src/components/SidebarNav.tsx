'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getWorkspaceRoute } from '@/lib/routes';

interface SidebarNavProps {
  locale: string;
  isPlatformAdmin?: boolean;
}

export default function SidebarNav({ locale, isPlatformAdmin = false }: SidebarNavProps) {
  const t = useTranslations('Navigation');
  const pathname = usePathname();

  // Extract current workspace from URL if present (e.g. /tr/demo-sme/calls -> demo-sme)
  const segments = pathname ? pathname.split('/').filter(Boolean) : [];
  // Read once into a local: `segments.length > 1` does not narrow a later index
  // read, and the slug was being computed from the same expression twice.
  const secondSegment = segments[1];
  const workspaceSlug = (secondSegment !== undefined && !['admin', 'pricing', 'fiyatlandirma', 'register', 'kayit', 'login', 'giris', 'privacy', 'terms', 'dpa', 'acik-cagrilar', 'open-calls'].includes(secondSegment))
    ? secondSegment
    : 'default';

  const navItems = [
    { key: 'dashboard', href: getWorkspaceRoute('dashboard', locale, workspaceSlug), label: t('dashboard') },
    { key: 'calls', href: getWorkspaceRoute('calls', locale, workspaceSlug), label: t('calls') },
    { key: 'pipeline', href: getWorkspaceRoute('pipeline', locale, workspaceSlug), label: t('pipeline') },
    { key: 'partners', href: getWorkspaceRoute('partners', locale, workspaceSlug), label: t('partners') },
    { key: 'relationships', href: getWorkspaceRoute('relationships', locale, workspaceSlug), label: t('relationships') },
    { key: 'evidence', href: getWorkspaceRoute('evidence', locale, workspaceSlug), label: t('evidence') },
    { key: 'tto', href: getWorkspaceRoute('tto', locale, workspaceSlug), label: t('tto') },
    { key: 'approvals', href: getWorkspaceRoute('approvals', locale, workspaceSlug), label: t('approvals') },
    { key: 'apiKeys', href: getWorkspaceRoute('settingsApiKeys', locale, workspaceSlug), label: t('apiKeys') },
    { key: 'settings', href: getWorkspaceRoute('settingsModules', locale, workspaceSlug), label: t('settings') },
  ];

  const adminItem = {
    key: 'adminModules',
    href: `/${locale}/admin/modules`,
    label: t('adminModules'),
  };

  return (
    <nav className="p-4 flex flex-col gap-1.5 flex-grow font-sans text-sm">
      <div className="text-[11px] font-semibold tracking-wider text-muted uppercase px-3 py-1 mb-1">
        {t('workspaceLabel')}
      </div>
      
      {navItems.map((item) => {
        const isActive = pathname?.startsWith(item.href) || pathname?.includes(`/${item.key}`);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between ${
              isActive
                ? 'bg-accent/10 text-accent-ink font-semibold'
                : 'text-ink-2 hover:bg-surface-hover hover:text-ink'
            }`}
          >
            <span>{item.label}</span>
          </Link>
        );
      })}

      {isPlatformAdmin && (
        <>
          <div className="my-3 border-t border-border" />

          <div className="text-[11px] font-semibold tracking-wider text-muted uppercase px-3 py-1 mb-1">
            {t('administrationLabel')}
          </div>

          <Link
            href={adminItem.href}
            className={`px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between ${
              pathname?.includes('/admin')
                ? 'bg-accent/15 text-accent-ink font-semibold shadow-2xs border border-accent/20'
                : 'text-ink-2 hover:bg-surface-hover hover:text-ink'
            }`}
          >
            <span>{adminItem.label}</span>
            <span className="text-[10px] bg-amber/15 text-amber border border-amber/20 px-1.5 py-0.5 rounded font-mono font-bold">
              ADMIN
            </span>
          </Link>
        </>
      )}
    </nav>
  );
}
