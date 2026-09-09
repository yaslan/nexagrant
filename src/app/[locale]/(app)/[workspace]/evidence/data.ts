import type { PrismaClient } from '@prisma/client';

import { prisma, withTenantOn, assertTenantScope } from '@/lib/db';
import type { EvidenceItemData } from './evidence-client';

/**
 * Tenant-scoped read behind the M3 Evidence Pack screen.
 *
 * TASK-MTUGJTD5HZDW0: the page used to do
 *
 *     const tenantId = session?.tenantId;             // string | null | undefined
 *     prisma.evidence.findMany({ where: tenantId ? { tenantId } : {} })
 *
 * The ternary reads like a guard but is the opposite of one: with no tenant the
 * `where` clause becomes `{}` — not "no rows", but *every row in the table*, so
 * the Evidence Pack rendered every tenant's certificates, audit reports and
 * uploaded documents at once. It is the same shape TASK-MTRKV9JGY7OQY fixed on
 * the M4 relationship screen (see ../relationships/[id]/data.ts).
 *
 * The fix is structural rather than a null check at the call site: `tenantId` is
 * a required `string` here, re-validated at runtime before the client is
 * touched, and the query runs inside `withTenantOn` so Postgres RLS sees
 * `app.tenant_id` as well (CLAUDE.md §1). There is no code path from this module
 * to Prisma without a tenant.
 *
 * `client` exists for the same reason `withTenantOn` takes one: so a test can
 * observe whether a query was issued at all. Application code passes nothing.
 */
export async function loadEvidenceItems(
  tenantId: string,
  client: PrismaClient = prisma,
): Promise<EvidenceItemData[]> {
  assertTenantScope(tenantId, 'loadEvidenceItems');

  const items = await withTenantOn(client, tenantId, (tx) =>
    tx.evidence.findMany({
      where: { tenantId },
      // The detail drawer distinguishes "no claim is linked" from "claims were
      // not loaded", so the links have to come with the first render, not only
      // from getEvidenceItemsAction.
      include: { claimLinks: { include: { claim: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  );

  return items as unknown as EvidenceItemData[];
}
