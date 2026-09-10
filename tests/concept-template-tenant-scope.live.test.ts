import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient } from '@/lib/db';
import { envValue } from './helpers/dotenv';

/**
 * TASK-MTVTU103F11XJ — `ConceptTemplate` reads took a client-supplied id with no
 * tenant arm in the `where` clause.
 *
 * Why this file measures over the *app* role and not `fabrika_app`.
 * ----------------------------------------------------------------
 * `ConceptTemplate` does carry the `tenant_or_shared` policy
 * (prisma/rls.sql:44) — measured present in this database — so over the
 * NOBYPASSRLS role a bare, unscoped `prisma.conceptTemplate.findUnique` reads
 * nothing at all and the leak is invisible. But the application does not run as
 * that role: `DATABASE_URL` is `fabrika`, measured `rolsuper=true`,
 * `rolbypassrls=true`, so the policy is inert on every connection the app
 * actually opens. The leak is therefore real in production shape and only in
 * production shape, which is exactly the shape this file runs in: the real
 * `@/lib/db` singleton, unmocked.
 *
 * The three arms are a set: the cross-tenant arm is the defect, and the
 * platform-row and own-row arms are the counterfactual — without them a fix
 * that simply refused every template would satisfy the first assertion while
 * breaking the feature (a NULL `tenantId` means "platform template, offered to
 * every tenant", per the column comment in prisma/schema.prisma).
 *
 * `.live` because it needs the Postgres in docker-compose; the file skips itself
 * when the database is unreachable rather than reddening the gate on a machine
 * that has none.
 */

const ADMIN_URL = envValue('DATABASE_URL');

/** Fixtures are written over their own handle, never through the code under test. */
const admin: PrismaClient | undefined = ADMIN_URL ? createDbClient(ADMIN_URL) : undefined;

const dbReachable =
  admin !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

if (!dbReachable) {
  console.warn(
    'concept-template tenant-scope test skipped: needs Postgres (`docker compose up -d`).'
  );
}

/** Mutable so each arm can act as a different tenant. */
const scope = vi.hoisted(() => ({ tenantId: '', userId: 'user-cs-fb' }));

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: async () => ({ tenantId: scope.tenantId, userId: scope.userId }),
}));

vi.mock('@/lib/modules/access', () => ({
  assertModuleAccess: async () => undefined,
}));

vi.mock('@/lib/llm', () => ({
  generateText: async () => 'drafted text',
  generateCompletion: async () => ({ text: 'drafted text', inputTokens: 1, outputTokens: 1, credits: 1 }),
}));

vi.mock('@/lib/rag', () => ({
  retrieveChunks: async () => [],
  buildRagPrompt: async () => '',
}));

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const { createConceptNote } = await import(
  '@/app/[locale]/(app)/[workspace]/concept-notes/actions'
);
const { generateConceptNoteDraft } = await import('@/modules/m2/server/actions');

/** Every row this file creates carries it, so cleanup can never over-reach. */
const RUN = `mtvtu1-${Date.now()}`;

const db = (): PrismaClient => admin!;

interface Fixture {
  tenantId: string;
  opportunityId: string;
  /** A template this tenant owns. */
  ownTemplateId: string;
}

async function makeTenant(label: string): Promise<Fixture> {
  const tenant = await db().tenant.create({
    data: { name: `Tenant ${label} ${RUN}`, slug: `${RUN}-${label}`, country: 'TR', orgType: 'SME' },
  });
  const workspace = await db().workspace.create({
    data: { tenantId: tenant.id, name: `WS ${label}`, slug: `${RUN}-${label}-ws` },
  });
  const opportunity = await db().opportunity.create({
    data: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      title: `Opp ${label} ${RUN}`,
      stage: 'G2',
      status: 'ACTIVE',
    },
  });
  const template = await db().conceptTemplate.create({
    data: {
      tenantId: tenant.id,
      key: `${RUN}-${label}-own`,
      name: `Own template ${label}`,
      version: '1',
      // The bare-array shape `prisma/seed.ts` writes — all 7 rows in the
      // database are this shape, so the arms below run on production data shape.
      schema: [{ key: 'summary', labelKey: 'Summary', maxWords: 50, promptKey: 'p' }],
    },
  });
  return { tenantId: tenant.id, opportunityId: opportunity.id, ownTemplateId: template.id };
}

describe.skipIf(!dbReachable)('ConceptTemplate reads are tenant-or-platform', () => {
  let a: Fixture;
  let b: Fixture;
  let platformTemplateId: string;

  beforeAll(async () => {
    a = await makeTenant('a');
    b = await makeTenant('b');
    const platform = await db().conceptTemplate.create({
      data: {
        tenantId: null,
        key: `${RUN}-platform`,
        name: 'Platform template',
        version: '1',
        // The `{ sections: [...] }` shape `prisma/seed-templates.ts` writes. The
        // two fixtures differ on purpose: the column holds both shapes and the
        // readers used to disagree the same way, so `templateSections` is what
        // keeps either one working. See its doc comment.
        schema: { sections: [{ key: 'summary', labelKey: 'Summary', maxWords: 50, promptKey: 'p' }] },
      },
    });
    platformTemplateId = platform.id;
  });

  afterAll(async () => {
    if (!dbReachable) return;
    await db().conceptNote.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } });
    await db().conceptTemplate.deleteMany({ where: { key: { startsWith: RUN } } });
    await db().opportunity.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } });
    await db().workspace.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } });
    await db().tenant.deleteMany({ where: { slug: { startsWith: RUN } } });
    await admin?.$disconnect();
  });

  describe('createConceptNote', () => {
    it("refuses a template owned by another tenant", async () => {
      scope.tenantId = a.tenantId;

      await expect(createConceptNote(a.opportunityId, b.ownTemplateId)).rejects.toThrow(
        'Template not found'
      );

      const notes = await db().conceptNote.findMany({
        where: { tenantId: a.tenantId, templateId: b.ownTemplateId },
      });
      expect(notes).toHaveLength(0);
    });

    it('accepts a platform template (tenantId NULL)', async () => {
      scope.tenantId = a.tenantId;

      const note = await createConceptNote(a.opportunityId, platformTemplateId);

      expect(note.templateId).toBe(platformTemplateId);
      expect(note.tenantId).toBe(a.tenantId);
    });

    it("accepts the caller's own template", async () => {
      scope.tenantId = a.tenantId;

      const note = await createConceptNote(a.opportunityId, a.ownTemplateId);

      expect(note.templateId).toBe(a.ownTemplateId);
    });

    it('initialises content from either stored schema shape', async () => {
      scope.tenantId = a.tenantId;

      // `a.ownTemplateId` is the bare-array shape, `platformTemplateId` the
      // `{ sections: [...] }` one. Before `templateSections` the bare-array rows
      // — which is every row in the database — threw
      // `schema.sections is not iterable` here.
      const fromArray = await createConceptNote(a.opportunityId, a.ownTemplateId);
      const fromObject = await createConceptNote(a.opportunityId, platformTemplateId);

      expect(fromArray.content).toEqual({ summary: '' });
      expect(fromObject.content).toEqual({ summary: '' });
    });
  });

  describe('generateConceptNoteDraft', () => {
    it("refuses a template owned by another tenant before any LLM call", async () => {
      scope.tenantId = a.tenantId;

      await expect(
        generateConceptNoteDraft(a.opportunityId, b.ownTemplateId, {})
      ).rejects.toThrow('Template not found');

      const notes = await db().conceptNote.findMany({
        where: { tenantId: a.tenantId, templateId: b.ownTemplateId },
      });
      expect(notes).toHaveLength(0);
    });

    it('still drafts against a platform template', async () => {
      scope.tenantId = a.tenantId;

      const noteId = await generateConceptNoteDraft(a.opportunityId, platformTemplateId, {});

      const note = await db().conceptNote.findFirst({ where: { id: noteId } });
      expect(note?.tenantId).toBe(a.tenantId);
      expect(note?.templateId).toBe(platformTemplateId);
    });
  });
});
