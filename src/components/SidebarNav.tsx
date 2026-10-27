'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getWorkspaceRoute } from '@/lib/routes';
import { getManifest, getSidebarEntries } from '@/lib/modules/registry';
import { useActiveModules, useModulePreviewStatus, useUpgradeModules, type ModulePreviewStatus } from '@/lib/modules/hooks';
import type { ModuleId } from '@/lib/modules/types';
import { navFeatureLock } from '@/lib/modules/catalog';

interface NavItem {
  key: string;
  href: string;
  label: string;
  moduleId?: ModuleId;
  /** The module is open as a PILOT/DEV preview: badge it so it does not pass as finished. */
  preview?: ModulePreviewStatus;
  /** The plan does not include the module: the entry leads to its page's upgrade notice. */
  upgrade?: boolean;
  /** Rendered indented under this entry, which stays inactive while the sub-entry is open. */
  parentKey?: string;
}

/** Module nav entries shown as a sub-entry of another one: child key → parent key. */
const SUB_ITEMS: Record<string, string> = { partnerResources: 'partners' };

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

  // Module entries come from each manifest's `nav[]`, shown for modules the server
  // said this session may open (plan + ModuleState + role, `listModuleNav`) and, locked,
  // for modules only the plan keeps closed. No visibility decision is re-made here;
  // this only reads the answer the app shell handed to `ModuleProvider`.
  const activeModules = useActiveModules();
  const previewStatus = useModulePreviewStatus();
  const upgradeModules = useUpgradeModules();
  const moduleItems: NavItem[] = getSidebarEntries([...activeModules, ...upgradeModules]).map((item) => ({
    key: item.labelKey,
    href: getWorkspaceRoute(item.routeKey, locale, workspaceSlug),
    label: t(item.labelKey),
    moduleId: item.moduleId,
    preview: previewStatus[item.moduleId],
    upgrade: upgradeModules.includes(item.moduleId),
    parentKey: SUB_ITEMS[item.labelKey],
  }));

  const navItems: NavItem[] = [
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
        const matches = (i: NavItem) => Boolean(pathname?.startsWith(i.href) || pathname?.includes(`/${i.key}`));
        // `/partners/resources` also starts with the Partners href: the open sub-entry wins.
        const isActive = matches(item) && !navItems.some((child) => child.parentKey === item.key && matches(child));
        const indent = item.parentKey ? 'ml-4 text-xs' : '';
        // A feature of a module that is off (approvals → M5, API keys → M1) stays in
        // the menu but locked. `activeModules` is the same answer `useModuleEnabled`
        // reads; the hook itself cannot be called inside this loop.
        const featureManifest = navFeatureLock(item.key, activeModules);
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
                className={`px-3 py-2 rounded-lg font-medium flex items-center justify-between text-muted cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${indent}`}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">🔒</span>
              </span>
              <span id={reasonId} hidden>{tooltip}</span>
            </React.Fragment>
          );
        }
        // Outside the plan: still a link — the module's page names the plans that
        // include it (`moduleGate`, PLAN_UPGRADE_REQUIRED) — marked locked, with the
        // reason as its description, like the feature lock above.
        if (item.upgrade && item.moduleId) {
          const tooltip = t('planLocked', { module: `${item.moduleId} ${tModules(`${getManifest(item.moduleId).key}.name`)}` });
          const reasonId = `${idBase}-${item.key}-upgrade`;
          return (
            <React.Fragment key={item.key}>
              <Link
                href={item.href}
                data-testid={`sidebar-nav-${item.key}`}
                data-locked="upgrade"
                aria-describedby={reasonId}
                title={tooltip}
                className={`px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between text-ink-2 hover:bg-surface-hover hover:text-ink ${indent}`}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">🔒</span>
              </Link>
              <span id={reasonId} hidden>{tooltip}</span>
            </React.Fragment>
          );
        }
        return (
          <Link
            key={item.key}
            href={item.href}
            data-testid={`sidebar-nav-${item.key}`}
            className={`px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between ${indent} ${
              isActive
                ? 'bg-accent/10 text-accent-ink font-semibold'
                : 'text-ink-2 hover:bg-surface-hover hover:text-ink'
            }`}
          >
            <span>{item.label}</span>
            {item.preview ? (
              <span
                data-testid={`sidebar-nav-${item.key}-preview`}
                className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-amber/30 bg-amber/10 text-ink-2"
              >
                {t(`preview.${item.preview}`)}
              </span>
            ) : null}
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
