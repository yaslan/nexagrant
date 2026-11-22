import type { PrismaClient } from '@prisma/client';

import { prisma, withTenantOn, assertTenantScope } from '@/lib/db';
import { evidenceReadWhere } from '@/lib/evidence-access';
import { EVIDENCE_SCAN_AUDIT_OBJECT_REMOVED } from '@/lib/evidence-scan';
import type { EvidenceItemData } from './evidence-client';

/**
 * NG-264 (a): the evidence ids whose infected object was really removed. The verdict lives on the
 * row (scanStatus INFECTED); the removal is its own append-only event, `data.objectDeleted` (NG-263).
 * No event, or `objectDeleted` false, means the object is still there: the screen must not say
 * "kaldırıldı" for it.
 */
export async function scanRemovedIds(
  client: Pick<PrismaClient, 'auditEvent'>,
  tenantId: string,
  evidenceIds: string[],
): Promise<Set<string>> {
  const removed = new Set<string>();
  if (evidenceIds.length === 0) return removed;
  const events = await client.auditEvent.findMany({
    where: { tenantId, type: EVIDENCE_SCAN_AUDIT_OBJECT_REMOVED, target: { in: evidenceIds } },
    select: { target: true, data: true },
  });
  for (const event of events) {
    const data = event.data as { objectDeleted?: unknown } | null;
    if (event.target && data?.objectDeleted === true) removed.add(event.target);
  }
  return removed;
}

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
  role: string | null | undefined,
  client: PrismaClient = prisma,
): Promise<EvidenceItemData[]> {
  assertTenantScope(tenantId, 'loadEvidenceItems');

  // Y-1 (TASK-MUNTTZ94LJWBC): what the role may read — nothing for the external
  // partner, the open levels only below `edit_proposal` (src/lib/evidence-access.ts).
  const readable = evidenceReadWhere(role);
  if (!readable) return [];

  const items = await withTenantOn(client, tenantId, async (tx) => {
    const rows = await tx.evidence.findMany({
      where: { tenantId, ...readable },
      // The detail drawer distinguishes "no claim is linked" from "claims were
      // not loaded", so the links have to come with the first render, not only
      // from getEvidenceItemsAction.
      include: { claimLinks: { include: { claim: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const removed = await scanRemovedIds(tx, tenantId, rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, scanObjectRemoved: removed.has(row.id) }));
  });

  return items as unknown as EvidenceItemData[];
}
