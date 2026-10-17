'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getWorkspaceRoute } from '@/lib/routes';
import { getAllManifests, getManifest } from '@/lib/modules/registry';
import { useActiveModules } from '@/lib/modules/hooks';
import { navFeatureModule } from '@/lib/modules/catalog';

interface SidebarNavProps {
  locale: string;
  isPlatformAdmin?: boolean;
  canManageModules?: boolean;
  canManageUsers?: boolean;
}

export default function SidebarNav({ locale, isPlatformAdmin = false, canManageModules = false, canManageUsers = false }: SidebarNavProps) {
  const t = useTranslations('Navigation');
  const tModules = useTranslations('modules');
  const pathname = usePathname();
  // The nav renders twice at once (desktop aside + mobile drawer), so a key-only id
  // would repeat in the document.
  const idBase = React.useId();

  // Extract current workspace from URL if present (e.g. /tr/demo-sme/calls -> demo-sme)
  const segments = pathname ? pathname.split('/').filter(Boolean) : [];
  // Read once into a local: `segments.length > 1` does not narrow a later index
  // read, and the slug was being computed from the same expression twice.
  const secondSegment = segments[1];
  const workspaceSlug = (secondSegment !== undefined && !['admin', 'pricing', 'fiyatlandirma', 'register', 'kayit', 'login', 'giris', 'privacy', 'terms', 'dpa', 'acik-cagrilar', 'open-calls', 'ajans', 'agency'].includes(secondSegment))
    ? secondSegment
    : 'default';

  // Module entries come from each manifest's `nav[]`, shown only for modules the server
  // said this session may open (plan + ModuleState + role, `listAccessibleModules`).
  // The visibility decision is not re-made here; this only reads its answer.
  const activeModules = useActiveModules();
  const moduleItems = getAllManifests()
    .filter((m) => activeModules.includes(m.id))
    .flatMap((m) => m.nav)
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      key: item.labelKey,
      href: getWorkspaceRoute(item.routeKey, locale, workspaceSlug),
      label: t(item.labelKey),
    }));

  const navItems = [
    { key: 'dashboard', href: getWorkspaceRoute('dashboard', locale, workspaceSlug), label: t('dashboard') },
    { key: 'calls', href: getWorkspaceRoute('calls', locale, workspaceSlug), label: t('calls') },
    ...moduleItems,
    { key: 'approvals', href: getWorkspaceRoute('approvals', locale, workspaceSlug), label: t('approvals') },
    { key: 'apiKeys', href: getWorkspaceRoute('settingsApiKeys', locale, workspaceSlug), label: t('apiKeys') },
    ...(canManageUsers
      ? [{ key: 'members', href: getWorkspaceRoute('settingsMembers', locale, workspaceSlug), label: t('members') }]
      : []),
    {
      key: 'settings',
      href: canManageModules
        ? getWorkspaceRoute('settingsModules', locale, workspaceSlug)
        : getWorkspaceRoute('settingsProfile', locale, workspaceSlug),
      label: t('settings')
    },
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
        // A feature of a module that is off (approvals → M5, API keys → M1) stays in
        // the menu but locked. `activeModules` is the same answer `useModuleEnabled`
        // reads; the hook itself cannot be called inside this loop.
        const featureModule = navFeatureModule(item.key);
        const featureManifest = featureModule && !activeModules.includes(featureModule) ? getManifest(featureModule) : null;
        if (featureManifest) {
          const tooltip = t('featureLocked', { module: `${featureManifest.id} ${tModules(`${featureManifest.key}.name`)}` });
          const reasonId = `${idBase}-${item.key}-locked`;
          // A disabled link: the name comes from the label, the lock reason is its
          // description. The reason node is `hidden` so browse mode does not read it
          // a second time; `aria-describedby` still resolves hidden nodes.
          return (
            <React.Fragment key={item.key}>
              <span
                role="link"
                data-testid={`sidebar-nav-${item.key}`}
                data-locked="true"
                aria-disabled="true"
                aria-describedby={reasonId}
                tabIndex={0}
                title={tooltip}
                className="px-3 py-2 rounded-lg font-medium flex items-center justify-between text-muted cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span>{item.label}</span>
                <span aria-hidden="true">🔒</span>
              </span>
              <span id={reasonId} hidden>{tooltip}</span>
            </React.Fragment>
          );
        }
        return (
          <Link
            key={item.key}
            href={item.href}
            data-testid={`sidebar-nav-${item.key}`}
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
