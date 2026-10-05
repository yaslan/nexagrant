'use server';

import { withTenant } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/tenant';
import { getManifest } from '@/lib/modules/registry';
import { ModuleId, ModuleStatus } from '@/lib/modules/types';
import { revalidatePath } from 'next/cache';
import { getDisableCascade } from '@/lib/modules/state-machine';
import { errorMessage } from '@/lib/errors';
import type { ModuleStateRow } from '@/types/db-rows';

/**
 * Switches a module on or off for *another* tenant, so it is platform-admin
 * only. It previously accepted any signed-in user — and in development, no user
 * at all (`admin-dev-user`) — which let any tenant member flip any other
 * tenant's modules and write an AuditEvent into their workspace.
 */
export async function updateTenantModuleStatus(
  tenantId: string,
  moduleId: ModuleId,
  targetStatus: ModuleStatus
) {
  const { userId } = await requirePlatformAdmin();

  if (!tenantId) {
    throw new Error('A tenant must be selected.');
  }

  const manifest = getManifest(moduleId);
  if (!manifest) {
    throw new Error(`Module ${moduleId} not found in catalog.`);
  }

  // Fetch current active module states for this tenant. The tenant is named in
  // the argument list, so this is a plain scoped read — no cross-tenant path
  // needed. It was recorded as `allowed` with the note "wrappable in principle,
  // kept with its sibling read"; the sibling turned out to be a different
  // question (the whole tenant x module grid) so the two are separated here.
  const currentStates: ModuleStateRow[] = await withTenant(tenantId, (tx) =>
    tx.moduleState.findMany({ where: { tenantId } })
  );

  const activeModuleIds = currentStates
    .filter((s: { status: string }) => s.status === 'ON' || s.status === 'PILOT')
    .map((s: { moduleId: string }) => s.moduleId as ModuleId);

  // If attempting to enable (ON or PILOT), verify required dependencies
  if (targetStatus === 'ON' || targetStatus === 'PILOT') {
    const missingDependencies = manifest.requires.filter(
      req => !activeModuleIds.includes(req)
    );

    if (missingDependencies.length > 0) {
      const missingNames = missingDependencies
        .map(id => getManifest(id)?.name || id)
        .join(', ');
      throw new Error(`Cannot set ${manifest.name} to ${targetStatus}: Missing required dependency (${missingNames}).`);
    }
  }

  // If setting to OFF, calculate cascading disables
  const modulesToTurnOff: ModuleId[] = [moduleId];
  if (targetStatus === 'OFF') {
    const cascade = getDisableCascade(moduleId, activeModuleIds);
    modulesToTurnOff.push(...cascade);
  }

  // Perform database updates
  try {
    // `prisma.$transaction` hands back a transaction with no `app.tenant_id` set
    // — the tenant scope is what withTenant adds beside it. Under `fabrika_app`
    // every upsert and every AuditEvent insert below is REFUSED by the policies'
    // WITH CHECK, so the console would fail on every flip. Invisible to
    // `rls:bypass-check`, whose CHECK A reads the accessor and sees only `tx.`.
    await withTenant(tenantId, async (tx) => {
      if (targetStatus === 'OFF') {
        for (const modId of modulesToTurnOff) {
          await tx.moduleState.upsert({
            where: { tenantId_moduleId: { tenantId, moduleId: modId } },
            update: { status: 'OFF', changedBy: userId, changedAt: new Date() },
            create: { tenantId, moduleId: modId, status: 'OFF', changedBy: userId }
          });

          await tx.auditEvent.create({
            data: {
              tenantId,
              actorId: userId,
              type: 'module.state.changed',
              target: modId,
              data: { newStatus: 'OFF', isCascaded: modId !== moduleId, initiatedFor: moduleId }
            }
          });
        }
      } else {
        await tx.moduleState.upsert({
          where: { tenantId_moduleId: { tenantId, moduleId } },
          update: { status: targetStatus, changedBy: userId, changedAt: new Date() },
          create: { tenantId, moduleId, status: targetStatus, changedBy: userId }
        });

        await tx.auditEvent.create({
          data: {
            tenantId,
            actorId: userId,
            type: 'module.state.changed',
            target: moduleId,
            data: { newStatus: targetStatus }
          }
        });
      }
    });
  } catch (e) {
    // A silent no-op here would report success for a change that never
    // happened, and the admin UI would show the new state until reload.
    console.error(`[Admin Module Action] DB update failed: ${errorMessage(e)}`);
    throw new Error('Modül durumu kaydedilemedi. Lütfen tekrar deneyin.');
  }

  try {
    revalidatePath('/[locale]/admin/modules', 'page');
  } catch {
    // Ignore in non-Next runtime/test environment
  }
  return { success: true, updatedModules: modulesToTurnOff };
}
