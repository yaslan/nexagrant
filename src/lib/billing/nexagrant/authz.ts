/**
 * NexaGrant feature authorisation — the one way to ask "may this member use this plan
 * feature" (NG-57). It reads the tenant's plan and hands it to `can()`
 * (`src/lib/rbac.ts`); there is no second decision path.
 */
import type { TenantTx } from '@/lib/db';
import type { Role } from '@prisma/client';
import { can, type Action } from '@/lib/rbac';
import { isOpenToTenantMembers } from '@/lib/modules/state-machine';
import type { ModuleId } from '@/lib/modules/types';
import { grantedFeatures } from './entitlement';
import type { NgFeatureKey } from './features';
import { readNgBillingState } from './repository';

/**
 * The module that stands behind a plan feature, when one does: its `ModuleState` switch must
 * be open too (CLAUDE.md rule 4). Empty in NG-57 — which NexaGrant feature maps to which
 * module is an open point of the report; a feature not listed here is gated by plan and role.
 */
export const NG_FEATURE_MODULE: Partial<Record<NgFeatureKey, ModuleId>> = {};

export interface NgActor {
  tenantId: string;
  role: Role | null | undefined;
}

export async function canUseNgFeature(
  tx: TenantTx,
  actor: NgActor,
  action: Action,
  feature: NgFeatureKey,
  now?: Date
): Promise<boolean> {
  if (!actor.role) return false;
  const state = await readNgBillingState(tx, actor.tenantId, now);
  const moduleId = NG_FEATURE_MODULE[feature];
  let moduleOpen: boolean | undefined;
  if (moduleId) {
    const row = await tx.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId: actor.tenantId, moduleId } },
      select: { status: true },
    });
    moduleOpen = row ? isOpenToTenantMembers(moduleId, row.status) : false;
  }
  return can(actor.role, action, { feature, grantedFeatures: grantedFeatures(state.entitlement), moduleOpen });
}
