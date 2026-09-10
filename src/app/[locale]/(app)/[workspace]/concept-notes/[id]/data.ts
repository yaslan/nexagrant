import type { PrismaClient } from '@prisma/client';

import { prisma, withTenantOn, assertTenantScope } from '@/lib/db';
import { findAccessibleTemplate } from '@/modules/m2/server/templates';
import type { ConceptNoteRow, ConceptTemplateRow } from '@/modules/m2/types';

/**
 * Tenant-scoped read behind one concept note.
 *
 * TASK-MTUGJTD5HZDW0: the page used to do
 *
 *     const tenantId = session?.tenantId;   // string | null | undefined
 *     prisma.conceptNote.findFirst({ where: tenantId ? { id, tenantId } : { id } })
 *
 * This is the targeted form of the leak the list page had. Dropping the filter
 * on a `findMany` shows everything; dropping it on a lookup by id means a
 * caller holding one id — from a shared link, a log line, an exported document
 * URL — reads that exact note out of whichever tenant owns it, and the editor
 * renders its full drafted content. Identical to the M4 relationship IDOR fixed
 * in TASK-MTRKV9JGY7OQY.
 *
 * `client` is here so a test can observe whether a query was issued at all;
 * application code passes nothing.
 */
export interface ConceptNoteDetailData {
  note: Omit<ConceptNoteRow, 'updatedAt'>;
  template: ConceptTemplateRow | null;
  opportunity: { title: string } | null;
}

/**
 * Loads one concept note for `tenantId`, or `null` when this tenant has no such
 * note — the same answer for "no such id" and "somebody else's id", so the
 * screen cannot be used to probe for ids.
 */
export async function loadConceptNoteDetail(
  tenantId: string,
  id: string,
  client: PrismaClient = prisma,
): Promise<ConceptNoteDetailData | null> {
  assertTenantScope(tenantId, 'loadConceptNoteDetail');

  return withTenantOn(client, tenantId, async (tx) => {
    const rawNote = await tx.conceptNote.findFirst({
      where: { id, tenantId },
    });
    const note = (rawNote as unknown as Omit<ConceptNoteRow, 'updatedAt'>) || null;
    if (!note) return null;

    // Reached only through a note this tenant owns, but the rule is still
    // "platform row or mine" rather than "no filter": `tenantId` is nullable,
    // so an unfiltered lookup also matches a row another tenant owns
    // (TASK-MTVTU103F11XJ). Runs on `tx`, so the query stays inside the scope
    // this loader opened.
    const rawTemplate = await findAccessibleTemplate(note.templateId, tenantId, tx);
    const template = (rawTemplate as unknown as ConceptTemplateRow) || null;

    let opportunity: { title: string } | null = null;
    if (note.opportunityId) {
      // `Opportunity` is tenant-isolated in prisma/rls.sql and the id comes off
      // this tenant's own note, so the lookup stays inside the tenant; running
      // it inside `withTenantOn` means RLS enforces that rather than trusting
      // the note's foreign key.
      opportunity = await tx.opportunity.findUnique({
        where: { id: note.opportunityId },
        select: { title: true },
      });
    }

    return { note, template, opportunity };
  });
}
