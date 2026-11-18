/**
 * NexaGrant feature authorisation — the one way to ask "may this member use this plan
 * feature" (NG-57). It reads the tenant's plan and hands it to `can()`
 * (`src/lib/rbac.ts`); there is no second decision path.
 */
import type { TenantTx } from '@/lib/db';
import type { Role } from '@prisma/client';
import type { Action } from '@/lib/rbac';
import type { NgFeatureKey } from './features';

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
  void tx;
  void actor;
  void action;
  void feature;
  void now;
  throw new Error('NG-57: canUseNgFeature not implemented');
}
