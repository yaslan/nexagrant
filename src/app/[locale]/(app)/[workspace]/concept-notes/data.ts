import type { PrismaClient } from '@prisma/client';

import { prisma, withTenantOn, assertTenantScope } from '@/lib/db';
import type { ConceptNoteRow, ConceptTemplateRow } from '@/modules/m2/types';

/**
 * Tenant-scoped read behind the M2 concept-note list.
 *
 * TASK-MTUGJTD5HZDW0: the page used to do
 *
 *     const tenantId = session?.tenantId;                 // string | null | undefined
 *     prisma.conceptNote.findMany({ where: tenantId ? { tenantId } : {} })
 *
 * With no tenant the `where` clause collapsed to `{}`, which is not an empty
 * result but an unfiltered one — every tenant's draft concept notes, including
 * their opportunity ids, on one screen. Same bug class as
 * ../relationships/[id]/data.ts (TASK-MTRKV9JGY7OQY).
 *
 * `client` is here so a test can observe whether a query was issued at all;
 * application code passes nothing.
 */
export interface ConceptNotesIndexData {
  notes: ConceptNoteRow[];
  templates: ConceptTemplateRow[];
}

export async function loadConceptNotesIndex(
  tenantId: string,
  client: PrismaClient = prisma,
): Promise<ConceptNotesIndexData> {
  assertTenantScope(tenantId, 'loadConceptNotesIndex');

  return withTenantOn(client, tenantId, async (tx) => {
    const notes = await tx.conceptNote.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });

    // Deliberately *not* tenant-only. `ConceptTemplate.tenantId` is nullable and
    // a NULL means "platform template, offered to every tenant" — the schema
    // says so on the column, and prisma/rls.sql gives the table the
    // `tenant_or_shared` policy (`tenantId IS NULL OR tenantId = app.tenant_id`)
    // rather than `tenant_isolation`. Reading the shared rows is the feature,
    // not a leak: no tenant's data is in them. What changed is that the tenant
    // half of the OR can no longer disappear, because `tenantId` is now a
    // required non-empty string.
    const templates = await tx.conceptTemplate.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }] },
    });

    return {
      notes: notes as unknown as ConceptNoteRow[],
      templates: templates as unknown as ConceptTemplateRow[],
    };
  });
}
