'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { can } from '@/lib/rbac';
import { Role } from '@prisma/client';
import { ModuleId, ModuleStatus } from '@/lib/modules/types';
import { canEnableEntitled, getDisableCascade, isOpenToTenantMembers } from '@/lib/modules/state-machine';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { errorMessage } from '@/lib/errors';
import { withOwnRouteCloseOnM18Exit } from '@/lib/leads/province-route';
import { readModulesPlanView, type ModulesPlanView } from './plan-view';

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
 *
 * NG-228 (NG-222 SEC B4): the tenant switches a module ON or OFF, nothing else. `PILOT` and `DEV`
 * are staff statuses, set from the admin console (`admin/modules/actions.ts`); accepted here, a
 * plan that ever lists M18 would let the tenant make itself a province target (PILOT) or close M18
 * to its own people (PILOT → ON/DEV) past the route close. Every write that leaves a module closed
 * to the tenant's own people (`isOpenToTenantMembers`) — OFF, and ON for an unsold beta like M18 —
 * goes through `withOwnRouteCloseOnM18Exit`, so M18 leaving the open set closes the routes too.
 */
const TenantModuleTarget = z.enum(['ON', 'OFF']);

/** The modules among `moduleIds` that `status` leaves closed to the tenant's own people. */
function closedToMembersAt(moduleIds: readonly ModuleId[], status: ModuleStatus): ModuleId[] {
  return moduleIds.filter((id) => !isOpenToTenantMembers(id, status));
}

export async function toggleModuleState(
  moduleId: ModuleId,
  targetStatus: ModuleStatus
) {
  const { tenantId, userId, role } = await requireTenantAction();

  if (!can(role as Role, "manage_modules")) {
    throw new Error("Yetkisiz işlem: Modülleri yönetme izniniz bulunmuyor (Sadece Tenant Owner).");
  }

  const parsedTarget = TenantModuleTarget.safeParse(targetStatus);
  if (!parsedTarget.success) {
    throw new Error('Geçersiz modül durumu: ayarlardan modül yalnız açılıp kapatılabilir.');
  }
  const target = parsedTarget.data;

  try {
    // Plan and active modules come from the same read the settings page shows
    // (./plan-view.ts). There used to be a `'pro'` fallback here for a tenant
    // with no subscription, so the action wrote `ON` rows for modules the
    // module gate then refused (TASK-MUMH6W5I1W9WC). "Active" is switched on
    // *and* entitled, so a row left behind by a downgrade does not satisfy a
    // dependency either.
    const view = await withTenant<ModulesPlanView>(tenantId, (tx) =>
      readModulesPlanView(tenantId, tx, 'tr')
    );
    const activeModules = view.activeModules;

    if (target === 'ON') {
      // Attempting to enable
      const check = canEnableEntitled(moduleId, activeModules, view.entitledModules);
      if (!check.allowed) {
        throw new Error(`Modül etkinleştirilemez: ${check.reason || 'Gereksinimler karşılanmadı'}`);
      }
      
      try {
        // NG-228: ON closes an unsold beta (M18) to the tenant's own people, so PILOT → ON is an
        // exit from the open set: the routes close in this same transaction.
        await withTenant(tenantId, (tx) => withOwnRouteCloseOnM18Exit(tx, closedToMembersAt([moduleId], target), { kind: 'tenant_user', userId }, async () => {
          await tx.moduleState.upsert({
            where: {
              tenantId_moduleId: {
                tenantId,
                moduleId
              }
            },
            update: {
              status: target,
              changedBy: userId,
              changedAt: new Date()
            },
            create: {
              tenantId,
              moduleId,
              status: target,
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
                data: { status: target }
              }
            });
          } catch {
            // Audit log optional
          }
        }));
      } catch (dbErr) {
        // Reporting success for a state the DB never took means the settings
        // page shows the module enabled until the next reload.
        console.error(`[toggleModuleState] Database save error: ${errorMessage(dbErr)}`);
        throw new Error('Modül durumu kaydedilemedi. Lütfen tekrar deneyin.');
      }
      
    } else {
      // Attempting to disable
      const cascade = getDisableCascade(moduleId, activeModules);
      const toDisable = [moduleId, ...cascade];
      
      try {
        // NG-222: M18 among them (directly or by cascade) closes the tenant's province routes in
        // this same transaction (withOwnRouteCloseOnM18Exit, no scope escalation).
        await withTenant(tenantId, (tx) => withOwnRouteCloseOnM18Exit(tx, closedToMembersAt(toDisable, 'OFF'), { kind: 'tenant_user', userId }, async () => {
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
        }));
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
