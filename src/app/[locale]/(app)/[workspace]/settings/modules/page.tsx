import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ModuleId, PlanTier } from '@/lib/modules/types';
import { ModulesClient } from './client';
import { can } from '@/lib/rbac';

export default async function ModulesSettingsPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const session = await auth();

  let tenantId = (session as any)?.tenantId;
  const role = (session as any)?.role || 'TENANT_OWNER';

  // If user is logged in with a restricted role, show forbidden banner
  if (session?.user && role && !can(role, 'manage_modules')) {
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

  let currentPlan: PlanTier = 'team';
  let activeModules: ModuleId[] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M8'];
  let tenantName = 'Varsayılan Çalışma Alanı';

  try {
    // 1. Resolve tenant
    let tenant = null;
    if (tenantId) {
      tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    } else if (workspace && workspace !== 'default') {
      tenant = await prisma.tenant.findUnique({ where: { slug: workspace } });
    }

    if (!tenant) {
      tenant = await prisma.tenant.findFirst();
    }

    if (tenant) {
      tenantId = tenant.id;
      tenantName = tenant.name;

      // 2. Resolve subscription / plan
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId }
      });
      if (subscription?.planId) {
        currentPlan = subscription.planId.toLowerCase() as PlanTier;
      }

      // 3. Resolve active module states
      const activeStates = await prisma.moduleState.findMany({
        where: { 
          tenantId,
          status: { in: ['ON', 'PILOT', 'DEV'] } 
        }
      });
      if (activeStates.length > 0) {
        activeModules = activeStates.map((s: any) => s.moduleId as ModuleId);
      }
    }
  } catch (err: any) {
    console.warn(`[ModulesSettings] DB query bypassed/error: ${err.message}`);
  }

  return (
    <ModulesClient 
      initialActiveModules={activeModules} 
      currentPlan={currentPlan}
      tenantId={tenantId || 'demo-tenant'}
      tenantName={tenantName}
      workspace={workspace}
      locale={locale}
    />
  );
}
