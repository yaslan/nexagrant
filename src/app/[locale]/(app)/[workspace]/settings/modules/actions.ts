'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { ModuleId, PlanTier, ModuleStatus } from '@/lib/modules/types';
import { canEnable, getDisableCascade } from '@/lib/modules/state-machine';
import { revalidatePath } from 'next/cache';

export async function toggleModuleState(
  moduleId: ModuleId,
  targetStatus: ModuleStatus,
  tenantIdParam?: string
) {
  const session = await auth();
  
  let tenantId = (session as any)?.tenantId || tenantIdParam;
  const role = (session as any)?.role || 'TENANT_OWNER';
  
  // Enforce RBAC if user is authenticated with a non-owner role
  if (session?.user && role && !can(role, "manage_modules")) {
    throw new Error("Yetkisiz işlem: Modülleri yönetme izniniz bulunmuyor (Sadece Tenant Owner).");
  }

  // If still no tenantId, try getting the first tenant
  if (!tenantId) {
    try {
      const firstTenant = await prisma.tenant.findFirst();
      tenantId = firstTenant?.id;
    } catch {
      // In-memory or demo mode fallback
    }
  }

  if (!tenantId) {
    return { success: true, demo: true };
  }

  try {
    // Find active modules for the tenant
    let activeStates: any[] = [];
    try {
      activeStates = await prisma.moduleState.findMany({
        where: { 
          tenantId,
          status: { in: ['ON', 'PILOT', 'DEV'] } 
        }
      });
    } catch (e: any) {
      console.warn(`[toggleModuleState] moduleState query warning: ${e.message}`);
    }
    
    const activeModules = activeStates.map((s: any) => s.moduleId as ModuleId);
    
    // Get tenant's current plan
    let currentPlan: PlanTier = 'team';
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
        include: { addOns: true }
      });
      if (subscription?.planId) {
        currentPlan = subscription.planId.toLowerCase() as PlanTier;
      }
    } catch (e: any) {
      console.warn(`[toggleModuleState] subscription query warning: ${e.message}`);
    }

    if (targetStatus === 'ON' || targetStatus === 'PILOT' || targetStatus === 'DEV') {
      // Attempting to enable
      const check = canEnable(moduleId, activeModules, currentPlan);
      if (!check.allowed) {
        throw new Error(`Modül etkinleştirilemez: ${check.reason || 'Gereksinimler karşılanmadı'}`);
      }
      
      try {
        await prisma.$transaction(async (tx) => {
          await tx.moduleState.upsert({
            where: {
              tenantId_moduleId: {
                tenantId: tenantId!,
                moduleId
              }
            },
            update: {
              status: targetStatus,
              changedBy: session?.user?.id || 'system',
              changedAt: new Date()
            },
            create: {
              tenantId: tenantId!,
              moduleId,
              status: targetStatus,
              changedBy: session?.user?.id || 'system',
            }
          });
          
          try {
            await tx.auditEvent.create({
              data: {
                tenantId: tenantId!,
                actorId: session?.user?.id || 'system',
                type: 'module.state.changed',
                target: moduleId,
                data: { status: targetStatus }
              }
            });
          } catch {
            // Audit log optional
          }
        });
      } catch (dbErr: any) {
        console.warn(`[toggleModuleState] Database save error: ${dbErr.message}`);
      }
      
    } else if (targetStatus === 'OFF') {
      // Attempting to disable
      const cascade = getDisableCascade(moduleId, activeModules);
      const toDisable = [moduleId, ...cascade];
      
      try {
        await prisma.$transaction(async (tx) => {
          for (const modId of toDisable) {
            await tx.moduleState.upsert({
              where: {
                tenantId_moduleId: { tenantId: tenantId!, moduleId: modId }
              },
              update: {
                status: 'OFF',
                changedBy: session?.user?.id || 'system',
                changedAt: new Date()
              },
              create: {
                tenantId: tenantId!,
                moduleId: modId,
                status: 'OFF',
                changedBy: session?.user?.id || 'system',
              }
            });
          }
          
          try {
            await tx.auditEvent.create({
              data: {
                tenantId: tenantId!,
                actorId: session?.user?.id || 'system',
                type: 'module.state.changed',
                target: moduleId,
                data: { status: 'OFF', cascadedTo: cascade }
              }
            });
          } catch {
            // Audit log optional
          }
        });
      } catch (dbErr: any) {
        console.warn(`[toggleModuleState] Database cascade save error: ${dbErr.message}`);
      }
    }

    revalidatePath('/[locale]/(app)/[workspace]/settings/modules', 'page');
    return { success: true };
  } catch (err: any) {
    console.error('[toggleModuleState] Error:', err);
    throw new Error(err.message || 'Modül durumu güncellenirken bir hata oluştu.');
  }
}
