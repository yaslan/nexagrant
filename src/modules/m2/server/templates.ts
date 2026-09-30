import type { ConceptTemplate, Prisma, PrismaClient } from '@prisma/client';

import { assertTenantScope, prisma } from '@/lib/db';
import type { ConceptTemplateSection } from '@/modules/m2/types';

/**
 * The one place that decides which `ConceptTemplate` rows a tenant may read.
 *
 * TASK-MTVTU103F11XJ: every read of this table took a client-supplied id with
 * no tenant arm in the `where` clause —
 * `prisma.conceptTemplate.findUnique({ where: { id: templateId } })`, where
 * `templateId` is a server-action argument. `ConceptTemplate.tenantId` is
 * `String?` and a NULL means "platform template, offered to every tenant", so
 * the correct rule is *platform OR mine*, never "any id that exists".
 *
 * Why the `tenant_or_shared` RLS policy is not the guard. The policy is on the
 * table (prisma/rls.sql:44) and was measured present, but the application
 * connects as the `DATABASE_URL` role, measured `rolsuper=true` /
 * `rolbypassrls=true` — so RLS is inert on every connection the app opens and
 * the policy protects nothing the app does. The `where` clause is the guard.
 *
 * Keep this rule here and call it. A second copy is how the one correct call
 * site (`loadConceptNotesIndex`) ended up surrounded by five wrong ones.
 */

/** `ConceptTemplate` delegate only, so a `withTenant` transaction client fits too. */
export type ConceptTemplateReader = Pick<PrismaClient, 'conceptTemplate'>;

/**
 * The tenant arm: a platform row, or a row this tenant owns. Nothing else.
 *
 * `assertTenantScope` first, because the failure this guards is a `tenantId`
 * that arrives `undefined` — Prisma drops an `undefined` field from a `where`
 * clause entirely, which would turn `{ tenantId }` back into "every tenant".
 */
export function accessibleTemplateWhere(
  tenantId: string,
  context = 'accessibleTemplateWhere'
): Prisma.ConceptTemplateWhereInput {
  assertTenantScope(tenantId, context);
  return { OR: [{ tenantId: null }, { tenantId }] };
}

/**
 * One template by id, or `null` when it is neither a platform row nor this
 * tenant's — the same answer for "no such id" and "somebody else's id", so the
 * id cannot be probed. Callers turn `null` into `Template not found`.
 *
 * `findFirst`, not `findUnique`: a unique lookup takes only the unique selector
 * and cannot carry the tenant arm.
 */
export async function findAccessibleTemplate(
  templateId: string,
  tenantId: string,
  client: ConceptTemplateReader = prisma
): Promise<ConceptTemplate | null> {
  return client.conceptTemplate.findFirst({
    where: { id: templateId, ...accessibleTemplateWhere(tenantId, 'findAccessibleTemplate') },
  });
}

/**
 * One template by `key`, preferring this tenant's own row over the platform one
 * of the same key. Two queries rather than an `orderBy` on a nullable column,
 * because NULL ordering would decide the precedence implicitly.
 *
 * The caller that needed this looked up `{ key: 'generic' }` with no tenant arm
 * at all, so tenant B's `generic` template could be handed to tenant A.
 */
export async function findAccessibleTemplateByKey(
  key: string,
  tenantId: string,
  client: ConceptTemplateReader = prisma
): Promise<ConceptTemplate | null> {
  assertTenantScope(tenantId, 'findAccessibleTemplateByKey');

  const own = await client.conceptTemplate.findFirst({ where: { key, tenantId } });
  if (own) return own;

  return client.conceptTemplate.findFirst({ where: { key, tenantId: null } });
}

/**
 * The sections of a template's `schema` Json column, from either stored shape.
 *
 * The column holds two different shapes today and the readers disagree the same
 * way: `prisma/seed.ts` writes a bare `ConceptTemplateSection[]` (all 7 rows in
 * the database are this shape, measured 2026-09-10) and `src/modules/m2/server/
 * actions.ts` reads it that way, while `prisma/seed-templates.ts` writes
 * `{ sections: [...] }` and `concept-notes/actions.ts` plus the export route
 * read `schema.sections` — which is `undefined` against every row that exists,
 * so `for (const section of schema.sections)` throws. Normalising in one place
 * keeps both readers working whichever seeder last ran; deciding which shape is
 * canonical and migrating the rows is a separate change.
 */
export function templateSections(schema: unknown): ConceptTemplateSection[] {
  let raw: unknown[] = [];
  if (Array.isArray(schema)) raw = schema;
  else if (schema && typeof schema === 'object' && Array.isArray((schema as { sections?: unknown }).sections)) {
    raw = (schema as { sections: unknown[] }).sections;
  }
  return raw.filter(isSection);
}

/**
 * Only elements with a section key (TASK-MUNWZGWA70P16, İNCELEME-71 B-3). The
 * column is untyped Json: a `[null]` schema made every reader's `section.key`
 * throw — the editor page became a 500. The key is all every reader needs; the
 * DOCX export (src/app/api/concept-notes/[id]/export/route.ts) reads only `key`
 * and `labelKey`, so a word limit is not required here — the editor checks
 * that itself (`editorSections`).
 */
function isSection(value: unknown): value is ConceptTemplateSection {
  if (!value || typeof value !== 'object') return false;
  const { key } = value as { key?: unknown };
  return typeof key === 'string' && key.length > 0;
}
