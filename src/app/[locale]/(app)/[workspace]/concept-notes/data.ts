import type { PrismaClient } from '@prisma/client';

import { prisma, withTenantOn, assertTenantScope } from '@/lib/db';
import { accessibleTemplateWhere } from '@/modules/m2/server/templates';
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
    // says so on the column. Reading the shared rows is the feature, not a leak:
    // no tenant's data is in them. The clause is built by
    // `accessibleTemplateWhere` rather than written here, because this was the
    // only call site that had it right and five others did not
    // (TASK-MTVTU103F11XJ).
    const templates = await tx.conceptTemplate.findMany({
      where: accessibleTemplateWhere(tenantId, 'loadConceptNotesIndex'),
    });

    return {
      notes: notes as unknown as ConceptNoteRow[],
      templates: templates as unknown as ConceptTemplateRow[],
    };
  });
}
