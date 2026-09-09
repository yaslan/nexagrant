import type { PrismaClient } from '@prisma/client';

import { prisma, withTenantOn } from '@/lib/db';
import type { InteractionRow, RelationshipRow } from '@/types/db-rows';

/**
 * Tenant-scoped read behind the relationship detail screen.
 *
 * TASK-MTRKV9JGY7OQY: the page used to do
 *
 *     const tenantId = session?.tenantId;            // string | null | undefined
 *     prisma.relationship.findFirst({ where: { id, tenantId } })
 *
 * Prisma treats an `undefined` field in a `where` clause as *absent*, so a
 * session without a tenant turned that query into `where: { id }` — a lookup by
 * a guessable cuid with no tenant filter at all, which returns another tenant's
 * row. `src/types/prisma-override.d.ts` shadows the generated client, so `tsc`
 * never saw the `string | null | undefined` → `string` mismatch; the bug was
 * invisible to the gate. (The module gate happened to reject a tenantless
 * session a few lines earlier, so the leak was latent rather than live — but
 * that gate is about *modules*, not tenants, and is not a tenant guard.)
 *
 * The fix is structural rather than a null check at the call site: `tenantId`
 * is a required `string` here, the value is re-validated at runtime, and the
 * queries run inside `withTenantOn` so Postgres RLS sees `app.tenant_id` too
 * (CLAUDE.md §1). There is no code path that reaches Prisma without a tenant.
 */
export class MissingTenantScopeError extends Error {
  readonly code = 'TENANT_SCOPE_REQUIRED';

  constructor() {
    super('loadRelationshipDetail called without a tenant; refusing to query.');
    this.name = 'MissingTenantScopeError';
  }
}

export interface RelationshipDetailData {
  relationship: RelationshipRow;
  interactions: InteractionRow[];
}

/**
 * Loads one relationship and its interactions for `tenantId`, or `null` when
 * this tenant has no such relationship — the same answer for "no such id" and
 * "somebody else's id", so the screen cannot be used to probe for ids.
 *
 * `client` exists for the same reason `withTenantOn` takes one: so a test can
 * observe whether a query was issued at all. Application code passes nothing.
 */
export async function loadRelationshipDetail(
  tenantId: string,
  id: string,
  client: PrismaClient = prisma,
): Promise<RelationshipDetailData | null> {
  // Checked before the client is touched: an empty string is falsy in a `where`
  // clause too, and `undefined` is the value that used to drop the filter.
  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new MissingTenantScopeError();
  }

  return withTenantOn(client, tenantId, async (tx) => {
    const relationship: RelationshipRow | null = await tx.relationship.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        organizationId: true,
        partnerOrgId: true,
        kind: true,
        ownerUserId: true,
        counterpartName: true,
        counterpartEmail: true,
        warmth: true,
        lastContactAt: true,
        nextStep: true,
        nextStepDue: true,
        notes: true,
        updatedAt: true,
      },
    });
    if (!relationship) return null;

    const interactions: InteractionRow[] = await tx.interaction.findMany({
      where: { tenantId, relationshipId: id },
      orderBy: { at: 'desc' },
      select: {
        id: true,
        tenantId: true,
        relationshipId: true,
        kind: true,
        at: true,
        summary: true,
        briefId: true,
      },
    });

    return { relationship, interactions };
  });
}
