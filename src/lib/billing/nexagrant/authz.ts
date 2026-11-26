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
import { readNgBillingState, type NgBillingState } from './repository';

/**
 * The module that stands behind a plan feature, when one does: its `ModuleState` switch must
 * be open too (CLAUDE.md rule 4). Filled in NG-250 from the route bindings (bindings.ts): a
 * feature whose route sits behind a module must be listed here — bindings.test.ts fails when
 * one is missing (review U5). A feature not listed is gated by plan and role only, which is
 * right for call search (its module M0 is not openable) and for features without a route.
 */
export const NG_FEATURE_MODULE: Partial<Record<NgFeatureKey, ModuleId>> = {
  partner_search: 'M1',
  similar_projects: 'M1',
};

export interface NgActor {
  tenantId: string;
  role: Role | null | undefined;
}

/**
 * Plan + module + role for a known billing state: `allowed`, `module_closed` (the module behind
 * the feature is not open) or `refused` (role or plan). The one place `can()` is asked with a
 * plan; `canUseNgFeature` and the route gate (gate.ts) both come through here.
 */
export async function ngPlanDecision(
  tx: TenantTx,
  actor: NgActor,
  action: Action,
  feature: NgFeatureKey,
  state: NgBillingState
): Promise<'allowed' | 'module_closed' | 'refused'> {
  if (!actor.role) return 'refused';
  const moduleId = NG_FEATURE_MODULE[feature];
  let moduleOpen: boolean | undefined;
  if (moduleId) {
    const row = await tx.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId: actor.tenantId, moduleId } },
      select: { status: true },
    });
    moduleOpen = row ? isOpenToTenantMembers(moduleId, row.status) : false;
  }
  if (can(actor.role, action, { feature, grantedFeatures: grantedFeatures(state.entitlement), moduleOpen })) return 'allowed';
  return moduleOpen === false && can(actor.role, action) ? 'module_closed' : 'refused';
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
  return (await ngPlanDecision(tx, actor, action, feature, state)) === 'allowed';
}
