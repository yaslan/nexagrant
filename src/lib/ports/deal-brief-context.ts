import { z } from 'zod';
import { assertModuleAccess } from '@/lib/modules/access';
import { assertTenantActionRole, type TenantScope } from '@/lib/tenant';
import { formatDealBriefContext } from '@/core/contracts/deal-brief-context';

/**
 * Composition root of the deal brief context contract (NG-136): the one place that knows M18
 * implements it, so M9 never imports M18 (src/lib composes modules, as src/lib/leads/province-route.ts
 * does). The M18 code is loaded on first use only.
 *
 * The caller passed its own action's checks (M9: `edit_proposal`); the deal belongs to the client
 * pipeline, so M18 must be open for the tenant and the role must also carry `client_pipeline_read`.
 * Throws when either is refused, before any model call is paid for.
 *
 * `dealId` comes from the client: it is validated (Zod) before anything else, so `null`, a number or
 * an over-long string is a ZodError, not a Prisma error (NG-136 review).
 *
 * Returns the formatted context for a prompt data field, or null when the deal is not this tenant's.
 */
export const dealIdSchema = z.string().trim().min(1).max(64);

export async function dealBriefContextText(scope: Pick<TenantScope, 'tenantId' | 'role'>, rawDealId: unknown): Promise<string | null> {
  const dealId = dealIdSchema.parse(rawDealId);
  await assertModuleAccess('M18');
  assertTenantActionRole(scope, 'client_pipeline_read');
  const { createDealBriefContextPort } = await import('@/modules/m18/server/deal-brief-context');
  const ctx = await createDealBriefContextPort().forDeal(scope.tenantId, dealId);
  return ctx ? formatDealBriefContext(ctx) : null;
}
