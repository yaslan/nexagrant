import React from 'react';
import BrandLogo from '@/components/BrandLogo';
import Link from 'next/link';
import SidebarNav from '@/components/SidebarNav';
import UserMenu from '@/components/UserMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { LocaleUpdater } from '@/components/LocaleUpdater';
import { isPlatformAdminDemoEmail } from '@/lib/demo-login';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { displayUserName } from '@/lib/user-display';
import { listSessionWorkspaces } from '@/lib/workspaces';
import { tenantScopeOf } from '@/lib/tenant';
import { getLinkedAgencyCoBrand, toShellCoBrand } from '@/lib/agency/cobrand-store';
import CoBrandBadge from '@/components/CoBrandBadge';
import PilotBanner from '@/components/PilotBanner';
import { can, asRole } from '@/lib/rbac';
import { hiddenNavKeysFor } from '@/lib/roles/nav-permissions';
import { listModuleNav, requestSession, type ModuleNavState } from '@/lib/modules/access';
import { logger } from '@/lib/logger';
import { ModuleProvider } from '@/lib/modules/hooks';

import MobileAppHeader from '@/components/MobileAppHeader';
import FeedbackWidget from '@/components/FeedbackWidget';

/**
 * No `loading.tsx` may sit anywhere under `(app)`.
 *
 * A route-level `loading.tsx` is a Suspense boundary, and a Suspense boundary
 * makes Next flush the shell before the page has finished deciding what it is.
 * That has now cost two defects, both measured:
 *
 *   • TASK-MTRNO3LBZB2Q7 — the status line goes out with the shell, so a
 *     `notFound()` reached afterwards can only swap the body: 404 became 200.
 *     Fixed by moving the skeleton down to the sections with no `[param]` child.
 *   • TASK-MTU4AYW5R9DGL — moving it down did not help the second defect. The
 *     page then streams out of order: the server parks the whole page in a
 *     `<div hidden id="S:0">` at the end of <body> while the client renders the
 *     same subtree in place, so the document holds TWO copies of every id and
 *     every heading. Measured on `next dev` AND on a production build, and the
 *     duplicate outlives `load` (readyState=complete at 568 ms, second copy
 *     dropped ~156 ms later) — no amount of waiting in a test avoids it.
 *
 * So the boundary is gone rather than relocated, and
 * tests/app-shell-no-loading-boundary.test.ts fails if one is re-added.
 * A section that wants a loading affordance renders it inside its own page,
 * client-side, where it costs no server flush.
 */
export default async function AppLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; workspace?: string }>;
}) {
  const { locale, workspace = 'default' } = await params;
  // The same per-request session `moduleGate` and `listModuleNav` read.
  const session = await requestSession();

  if (!session?.user) {
    redirect(`/${locale}/${locale === 'tr' ? 'giris' : 'login'}`);
  }

  const user = session.user;
  const t = await getTranslations({ locale, namespace: 'UserIdentity' });
  const tNav = await getTranslations({ locale, namespace: 'Navigation' });

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
  // The workspace switcher in the user menu lists these and nothing else. It used
  // to carry two names written into the component ("Demo SME Consultancy",
  // "Horizon Research Lab") that no session was ever a member of.
  const workspaces = await listSessionWorkspaces(session);
  // FB KAMU B4 (TASK-MULRRNIHVZM1Z): the agency co-brand, only for a tenant an
  // agency brought in. Unlinked tenants — and the agency itself — get null.
  const tenantId = tenantScopeOf(session)?.tenantId;
  // NG-248 (K-584216): the door is the `view_tenant_branding` permission, read in rbac.ts.
  // A guest partner gets no co-brand: the name and logo never reach its shell or its RSC payload.
  const cobrand = tenantId && can(asRole(roleName), 'view_tenant_branding')
    ? toShellCoBrand(await getLinkedAgencyCoBrand(tenantId))
    : null;

  const isPlatformAdmin = Boolean(
    session?.isPlatformAdmin ||
    session?.user?.isPlatformAdmin ||
    isPlatformAdminDemoEmail(userEmail) ||
    roleName === 'SUPER_ADMIN' ||
    roleName === 'PLATFORM_ADMIN'
  );

  const canManageModules = can(asRole(roleName), 'manage_modules');
  const canManageUsers = can(asRole(roleName), 'manage_users');
  const hiddenNavKeys = hiddenNavKeysFor(asRole(roleName));
  // What the sidebar, the opportunity tabs and the cross-links may offer. Same decision
  // as each page's `moduleGate`, read once here; the pages still gate themselves.
  //
  // TASK-MVBEM10PJYU0E (FO-12, Ö-1): a failed read empties the menu instead of
  // failing the shell. Otherwise the pages that are no module's — the dashboard,
  // Settings → Modules, Members — went down with it, and the admin could not reach
  // the screen that fixes the cause. Module pages stay closed: each runs its own
  // `moduleGate`. The error goes to the server log only, never to the page.
  let moduleNav: ModuleNavState = { activeModules: [], previewStatus: {}, upgradeModules: [] };
  try {
    moduleNav = await listModuleNav();
  } catch (error) {
    logger.error('App shell could not read the accessible modules; menu shows none', error, { tenantId });
  }

  return (
    <ModuleProvider
      activeModules={moduleNav.activeModules}
      previewStatus={moduleNav.previewStatus}
      upgradeModules={moduleNav.upgradeModules}
    >
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <LocaleUpdater />
      {/* Mobile Top Header */}
      <MobileAppHeader
        locale={locale}
        userName={userName}
        userEmail={userEmail}
        userImage={userImage}
        roleName={roleName}
        isPlatformAdmin={isPlatformAdmin}
        canManageModules={canManageModules}
        canManageUsers={canManageUsers}
        hiddenNavKeys={hiddenNavKeys}
        workspaces={workspaces}
        cobrand={cobrand}
      />

      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex w-64 bg-surface border-r border-border flex-col shrink-0">
        <Link
          href={`/${locale}`}
          title={tNav('homeLink')}
          className="p-4 border-b border-border flex items-center justify-center hover:bg-surface-hover transition-colors group cursor-pointer"
        >
          <BrandLogo height={48} className="group-hover:scale-105 transition shrink-0" />
        </Link>

        <SidebarNav locale={locale} isPlatformAdmin={isPlatformAdmin} canManageModules={canManageModules} canManageUsers={canManageUsers} hiddenNavKeys={hiddenNavKeys} />
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Desktop Header */}
        <header className="hidden md:flex h-14 border-b border-border bg-surface items-center px-6 justify-between shadow-2xs shrink-0">
          <div className="flex min-w-0 items-center space-x-3">
            {cobrand ? <CoBrandBadge cobrand={cobrand} /> : null}
          </div>
          <div className="flex items-center space-x-3">
            <ThemeToggle variant="button" locale={locale} />
            <UserMenu
              locale={locale}
              userName={userName}
              userEmail={userEmail}
              userImage={userImage}
              roleName={roleName}
              workspaces={workspaces}
              canManageModules={canManageModules}
              canManageUsers={canManageUsers}
            hideApiKeys={hiddenNavKeys.includes('apiKeys')}
            />
          </div>
        </header>

        {tenantId ? <PilotBanner tenantId={tenantId} locale={locale} /> : null}

        <main className="flex-1 overflow-auto bg-background px-edge py-4 sm:p-6">
          {children}
        </main>
      </div>

      {/* E11.2 — beta feedback entry point, present on every workspace page */}
      <FeedbackWidget locale={locale} workspace={workspace} />
    </div>
    </ModuleProvider>
  );
}

