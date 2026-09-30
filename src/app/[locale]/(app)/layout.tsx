import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import SidebarNav from '@/components/SidebarNav';
import UserMenu from '@/components/UserMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { auth } from '@/lib/auth';
import { isPlatformAdminDemoEmail } from '@/lib/demo-login';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';
import { displayUserName } from '@/lib/user-display';
import { listSessionWorkspaces } from '@/lib/workspaces';
import { tenantScopeOf } from '@/lib/tenant';
import { getLinkedAgencyCoBrand, toShellCoBrand } from '@/lib/agency/cobrand-store';
import CoBrandBadge from '@/components/CoBrandBadge';
import PilotBanner from '@/components/PilotBanner';

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
  const session = await auth();

  if (!session?.user) {
    redirect(`/${locale}/${locale === 'tr' ? 'giris' : 'login'}`);
  }

  const user = session.user;
  const t = await getTranslations({ locale, namespace: 'UserIdentity' });
  const tCommon = await getTranslations({ locale, namespace: 'Common' });

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
  const cobrand = tenantId ? toShellCoBrand(await getLinkedAgencyCoBrand(tenantId)) : null;

  const isPlatformAdmin = Boolean(
    session?.isPlatformAdmin ||
    session?.user?.isPlatformAdmin ||
    isPlatformAdminDemoEmail(userEmail) ||
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
        workspaces={workspaces}
        cobrand={cobrand}
      />

      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex w-64 bg-surface border-r border-border flex-col shrink-0">
        <Link
          href={`/${locale}`}
          title={locale === 'tr' ? 'Ana Sayfa' : 'Home'}
          className="p-4 border-b border-border flex items-center justify-center hover:bg-surface-hover transition-colors group cursor-pointer"
        >
          <Image
            src="/logo.png"
            alt={tCommon('logoAlt', { brand: PRODUCT_NAME })}
            width={72}
            height={72}
            className="object-contain group-hover:scale-105 transition shrink-0"
          />
        </Link>

        <SidebarNav locale={locale} isPlatformAdmin={isPlatformAdmin} />
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
  );
}

