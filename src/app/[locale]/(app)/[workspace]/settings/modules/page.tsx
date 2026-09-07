import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { ModuleId, PlanTier } from '@/lib/modules/types';
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

  const state = {
    // Same permissive fallback as the server action — see actions.ts.
    currentPlan: 'pro' as PlanTier,
    activeModules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M8'] as ModuleId[],
    tenantName: 'Varsayılan Çalışma Alanı'
  };

  try {
    // Tenant comes from the session only. The old chain (session → workspace
    // slug → `findFirst()`) meant a session without a tenant was shown, and
    // could edit, whichever tenant happened to be first in the table.
    await withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId } });
      if (!tenant) return;
      state.tenantName = tenant.name;

      const subscription = await tx.subscription.findFirst({ where: { tenantId } });
      if (subscription?.planId) {
        state.currentPlan = subscription.planId.toLowerCase() as PlanTier;
      }

      const activeStates = await tx.moduleState.findMany({
        where: {
          tenantId,
          status: { in: ['ON', 'PILOT', 'DEV'] }
        }
      });
      if (activeStates.length > 0) {
        state.activeModules = activeStates.map((s: { moduleId: string }) => s.moduleId as ModuleId);
      }
    });
  } catch (err) {
    console.warn(`[ModulesSettings] DB query bypassed/error: ${errorMessage(err)}`);
  }

  return (
    <ModulesClient 
      initialActiveModules={state.activeModules} 
      currentPlan={state.currentPlan}
      tenantName={state.tenantName}
      workspace={workspace}
      locale={locale}
    />
  );
}
