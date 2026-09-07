'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { can } from '@/lib/rbac';
import { Role } from '@prisma/client';
import { ModuleId, PlanTier, ModuleStatus } from '@/lib/modules/types';
import { canEnable, getDisableCascade } from '@/lib/modules/state-machine';
import { revalidatePath } from 'next/cache';
import { errorMessage } from '@/lib/errors';
import type { ModuleStateRow } from '@/types/db-rows';

/**
 * Turns a module on or off for the caller's *own* tenant.
 *
 * The previous signature took an optional `tenantIdParam` from the browser and
 * preferred the session only when it had one, so a caller could name any
 * tenant. Worse, the RBAC check was guarded by `if (session?.user && ...)` —
 * an unauthenticated caller skipped it entirely — the role defaulted to
 * `TENANT_OWNER`, and a missing tenant fell back to `prisma.tenant.findFirst()`
 * (the first seeded row) before finally returning `{ success: true, demo: true }`.
 *
 * The tenant is the session's and nothing else, and the permission check runs
 * unconditionally.
 */
export async function toggleModuleState(
  moduleId: ModuleId,
  targetStatus: ModuleStatus
) {
  const { tenantId, userId, role } = await requireTenantAction();

  if (!can(role as Role, "manage_modules")) {
    throw new Error("Yetkisiz işlem: Modülleri yönetme izniniz bulunmuyor (Sadece Tenant Owner).");
  }

  try {
    // Find active modules for the tenant
    const activeStates = await withTenant<ModuleStateRow[]>(tenantId, (tx) =>
      tx.moduleState.findMany({
        where: {
          tenantId,
          status: { in: ['ON', 'PILOT', 'DEV'] }
        }
      })
    );
    
    const activeModules = activeStates.map((s) => s.moduleId as ModuleId);
    
    // Get tenant's current plan
    // Fallback when the tenant has no subscription row. Kept at the middle
    // tier the EUR ladder used ('team' → 'pro') so retiring the ladder does not
    // quietly change who can enable what; that this default is permissive at
    // all is a separate question — docs/BILLING.md §9, open card.
    let currentPlan: PlanTier = 'pro';
    const subscription = await withTenant<{ planId: string } | null>(tenantId, (tx) =>
      tx.subscription.findFirst({
        where: { tenantId },
        include: { addOns: true }
      })
    );
    if (subscription?.planId) {
      currentPlan = subscription.planId.toLowerCase() as PlanTier;
    }

    if (targetStatus === 'ON' || targetStatus === 'PILOT' || targetStatus === 'DEV') {
      // Attempting to enable
      const check = canEnable(moduleId, activeModules, currentPlan);
      if (!check.allowed) {
        throw new Error(`Modül etkinleştirilemez: ${check.reason || 'Gereksinimler karşılanmadı'}`);
      }
      
      try {
        await withTenant(tenantId, async (tx) => {
          await tx.moduleState.upsert({
            where: {
              tenantId_moduleId: {
                tenantId,
                moduleId
              }
            },
            update: {
              status: targetStatus,
              changedBy: userId,
              changedAt: new Date()
            },
            create: {
              tenantId,
              moduleId,
              status: targetStatus,
              changedBy: userId,
            }
          });
          
          try {
            await tx.auditEvent.create({
              data: {
                tenantId,
                actorId: userId,
                type: 'module.state.changed',
                target: moduleId,
                data: { status: targetStatus }
              }
            });
          } catch {
            // Audit log optional
          }
        });
      } catch (dbErr) {
        // Reporting success for a state the DB never took means the settings
        // page shows the module enabled until the next reload.
        console.error(`[toggleModuleState] Database save error: ${errorMessage(dbErr)}`);
        throw new Error('Modül durumu kaydedilemedi. Lütfen tekrar deneyin.');
      }
      
    } else if (targetStatus === 'OFF') {
      // Attempting to disable
      const cascade = getDisableCascade(moduleId, activeModules);
      const toDisable = [moduleId, ...cascade];
      
      try {
        await withTenant(tenantId, async (tx) => {
          for (const modId of toDisable) {
            await tx.moduleState.upsert({
              where: {
                tenantId_moduleId: { tenantId, moduleId: modId }
              },
              update: {
                status: 'OFF',
                changedBy: userId,
                changedAt: new Date()
              },
              create: {
                tenantId,
                moduleId: modId,
                status: 'OFF',
                changedBy: userId,
              }
            });
          }
          
          try {
            await tx.auditEvent.create({
              data: {
                tenantId,
                actorId: userId,
                type: 'module.state.changed',
                target: moduleId,
                data: { status: 'OFF', cascadedTo: cascade }
              }
            });
          } catch {
            // Audit log optional
          }
        });
      } catch (dbErr) {
        console.error(`[toggleModuleState] Database cascade save error: ${errorMessage(dbErr)}`);
        throw new Error('Modül durumu kaydedilemedi. Lütfen tekrar deneyin.');
      }
    }

    revalidatePath('/[locale]/(app)/[workspace]/settings/modules', 'page');
    return { success: true };
  } catch (err) {
    console.error('[toggleModuleState] Error:', err);
    throw new Error(errorMessage(err) || 'Modül durumu güncellenirken bir hata oluştu.');
  }
}
