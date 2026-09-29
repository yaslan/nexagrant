import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { readModulesPlanView, type ModulesPlanView } from './plan-view';
import { ModulesClient } from './client';
import { can } from '@/lib/rbac';
import type { Role } from '@prisma/client';
import { errorMessage } from '@/lib/errors';

export default async function ModulesSettingsPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const { tenantId, role } = await requireTenantPage(locale);

  // If user is logged in with a restricted role, show forbidden banner
  if (!can(role as Role, 'manage_modules')) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center bg-surface rounded-xl border shadow-sm my-12">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
          !
        </div>
        <h1 className="text-2xl font-bold text-ink mb-2 font-heading">Erişim Reddedildi</h1>
        <p className="text-ink-2">
          Modülleri yönetme yetkiniz bulunmamaktadır. Bu alana yalnızca <strong>Tenant Owner</strong> yetkisine sahip kullanıcılar erişebilir.
        </p>
      </div>
    );
  }

  // No fallback plan and no fallback module list (TASK-MUMH6W5I1W9WC): both
  // come from the same read the settings action decides on. A read that fails
  // leaves `plan` null and the client says so instead of inventing a Pro plan.
  let tenantName: string | null = null;
  let plan: ModulesPlanView | null = null;

  try {
    // Tenant comes from the session only. The old chain (session → workspace
    // slug → `findFirst()`) meant a session without a tenant was shown, and
    // could edit, whichever tenant happened to be first in the table.
    const read = await withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId } });
      if (!tenant) return null;
      return { name: tenant.name as string, plan: await readModulesPlanView(tenantId, tx, locale) };
    });
    if (read) {
      tenantName = read.name;
      plan = read.plan;
    }
  } catch (err) {
    console.warn(`[ModulesSettings] plan/module read failed: ${errorMessage(err)}`);
  }

  return (
    <ModulesClient
      plan={plan}
      tenantName={tenantName ?? workspace}
      workspace={workspace}
      locale={locale}
    />
  );
}
