import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient } from '@/lib/db';
import { createProjectIdea, getProjectIdea, listProjectIdeas } from '@/lib/project-ideas/records';
import { envValue } from './helpers/dotenv';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * NG-14 review T1 — project ideas are tenant-scoped (NG-38 `records.ts`).
 *
 * Two tenants each save an idea. Tenant A's reads must never return tenant B's idea,
 * by list or by id, and a write under A must not land under B. The arms that prove
 * the tenant filter is doing the work are the counterfactual: each tenant still sees
 * its own idea, so a fix that refuses everything cannot pass.
 *
 * `.live`: needs the Postgres in docker-compose; skips itself when unreachable.
 */

const ADMIN_URL = envValue('DATABASE_URL');
const admin: PrismaClient | undefined = ADMIN_URL ? createDbClient(ADMIN_URL) : undefined;

const dbReachable =
  admin !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

const SUITE = 'project-idea tenant-scope test';
if (!dbReachable) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const RUN = `ng14t1-${Date.now().toString(36)}`;
const tenants: string[] = [];

async function newTenant(suffix: string): Promise<string> {
  const t = await admin!.tenant.create({
    data: { name: `${RUN} ${suffix}`, slug: `${RUN}-${suffix}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenants.push(t.id);
  return t.id;
}

const idea = (title: string) => ({
  title,
  summary: null,
  keywords: ['sulama'],
  trl: 4,
  targetPrograms: ['horizonEurope'],
});

describe.skipIf(!dbReachable)('NG-14 T1 — project ideas stay inside their tenant', () => {
  let tenantA = '';
  let tenantB = '';
  let ideaA = '';
  let ideaB = '';

  beforeAll(async () => {
    tenantA = await newTenant('a');
    tenantB = await newTenant('b');
    const a = await createProjectIdea({ tenantId: tenantA, userId: 'user-a' }, idea(`${RUN} A fikri`));
    const b = await createProjectIdea({ tenantId: tenantB, userId: 'user-b' }, idea(`${RUN} B fikri`));
    ideaA = a.id;
    ideaB = b.id;
  });

  afterAll(async () => {
    if (admin && tenants.length) {
      // Cascades to ProjectIdea rows of both tenants.
      await admin.tenant.deleteMany({ where: { id: { in: tenants } } }).catch(() => {});
    }
    await admin?.$disconnect().catch(() => {});
  });

  it('list shows only the caller tenant\'s ideas', async () => {
    const aList = await listProjectIdeas({ tenantId: tenantA });
    expect(aList.map((i) => i.id)).toEqual([ideaA]);
    const bList = await listProjectIdeas({ tenantId: tenantB });
    expect(bList.map((i) => i.id)).toEqual([ideaB]);
  });

  it('a read by id from the other tenant answers null, as an unknown id does', async () => {
    expect(await getProjectIdea({ tenantId: tenantA }, ideaB)).toBeNull();
    expect(await getProjectIdea({ tenantId: tenantB }, ideaA)).toBeNull();
  });

  it('the owner still reads its own idea by id (counterfactual)', async () => {
    const own = await getProjectIdea({ tenantId: tenantA }, ideaA);
    expect(own?.title).toBe(`${RUN} A fikri`);
  });

  it('a write under tenant A is stored under tenant A only', async () => {
    const created = await createProjectIdea({ tenantId: tenantA, userId: 'user-a' }, idea(`${RUN} A ikinci`));
    expect(await getProjectIdea({ tenantId: tenantB }, created.id)).toBeNull();
    const row = await admin!.projectIdea.findUnique({ where: { id: created.id }, select: { tenantId: true } });
    expect(row?.tenantId).toBe(tenantA);
  });
});
