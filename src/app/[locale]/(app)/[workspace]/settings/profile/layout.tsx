import type { ReactNode } from 'react';
import { prisma } from '@/lib/db';
import { provinceAppliesTo } from '@/lib/province';
import { asRole, can } from '@/lib/rbac';
import { requireTenantPage } from '@/lib/tenant';
import ProvinceSetting from './province-setting';

/**
 * TASK-MULV3JXS1AW5X — the profile page is a client page; the province card
 * needs the tenant's stored value from the server, so it is rendered here,
 * below the page, instead of being fetched after hydration.
 */
export default async function ProfileSettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const scope = await requireTenantPage(locale);
  // Tenant is a system-wide table (no RLS); the id is the session's own.
  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { country: true, province: true },
  });

  return (
    <>
      {children}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        <ProvinceSetting
          applies={provinceAppliesTo(tenant?.country)}
          initialProvince={tenant?.province ?? null}
          canEdit={can(asRole(scope.role), 'manage_users')}
        />
      </div>
    </>
  );
}
