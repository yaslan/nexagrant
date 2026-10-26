import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { assertAppOwnerRole, skipOrFailInCi } from './helpers/live-db-role';

/**
 * Live tests for M4 `createRelationship` (TASK-MVNSRON87S8T0, FO-142).
 *
 * The partner screens add a relationship with a button. Before this card the
 * action had no module gate on the server, no input validation, and no
 * protection against a second row for the same PIC. Each of those is a claim
 * about the database as much as about the code: whether a row exists after the
 * call, and whether two concurrent calls leave one row, can only be measured
 * against one.
 *
 * Only `auth()`, `revalidatePath` and the module gate are replaced. The gate is
 * switched by a flag here because a real `M4` check needs plan and module rows
 * this suite does not seed; the gate itself is covered by its own tests.
 */

const { gate } = vi.hoisted(() => ({ gate: { m4Open: true } }));

const CONNECTION =
  process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';

async function dbReachable(): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: CONNECTION, connectionTimeoutMillis: 2000 });
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

const HAS_DB = await dbReachable();

type TestSession = { user?: { id: string }; tenantId?: string; role?: string } | null;
let currentSession: TestSession = null;

vi.mock('@/lib/auth', () => ({ auth: async () => currentSession }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/modules/access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/modules/access')>();
  return {
    ...actual,
    assertModuleAccess: vi.fn(async (moduleId: 'M4') => {
      if (!gate.m4Open) throw new actual.ModuleAccessError(moduleId, 'OFF', 'MODULE_OFF');
    }),
  };
});

const { createRelationship } = await import('@/modules/m4/server/actions');
const { ModuleAccessError } = await import('@/lib/modules/access');

const pool = new pg.Pool({ connectionString: CONNECTION });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

// Measured as the app's own role on purpose (see tests/helpers/live-db-role.ts).
if (HAS_DB) await assertAppOwnerRole(db, 'm4 createRelationship live test');
else skipOrFailInCi('m4 createRelationship live test', 'Postgres is unreachable (`pnpm db:setup`)');

const RUN = randomBytes(4).toString('hex');
const ids = {
  tenantA: `m4cr-t-a-${RUN}`,
  tenantB: `m4cr-t-b-${RUN}`,
  userA: `m4cr-u-a-${RUN}`,
  userB: `m4cr-u-b-${RUN}`,
};
const PIC = '999000111';
const OTHER_PIC = '999000222';

async function seed() {
  await db.tenant.createMany({
    data: [
      { id: ids.tenantA, name: `M4CR A ${RUN}`, slug: `m4cr-a-${RUN}`, country: 'TR' },
      { id: ids.tenantB, name: `M4CR B ${RUN}`, slug: `m4cr-b-${RUN}`, country: 'BE' },
    ],
  });
  await db.user.createMany({
    data: [
      { id: ids.userA, email: `m4cr-a-${RUN}@t.invalid`, name: 'User A' },
      { id: ids.userB, email: `m4cr-b-${RUN}@t.invalid`, name: 'User B' },
    ],
  });
  await db.membership.createMany({
    data: [
      { tenantId: ids.tenantA, userId: ids.userA, role: 'TENANT_OWNER', workspaceIds: [] },
      { tenantId: ids.tenantB, userId: ids.userB, role: 'TENANT_OWNER', workspaceIds: [] },
    ],
  });
}

async function cleanup() {
  await db.relationship.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.membership.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.tenant.deleteMany({ where: { id: { in: [ids.tenantA, ids.tenantB] } } });
  await db.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB] } } });
}

const rowsFor = (tenantId: string, organizationId: string) =>
  db.relationship.findMany({ where: { tenantId, organizationId }, select: { id: true, ownerUserId: true } });

const rowCount = (tenantId: string) => db.relationship.count({ where: { tenantId } });

/** The signed-in identity the action will read. */
function signIn(userId: string, tenantId: string) {
  currentSession = { user: { id: userId }, tenantId, role: 'TENANT_OWNER' };
}

describe.skipIf(!HAS_DB)('createRelationship — M4 gate, input, one row per PIC', () => {
  beforeAll(async () => {
    await cleanup();
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
    await pool.end().catch(() => {});
  });

  test('module M4 off: refused, and no row is written', async () => {
    signIn(ids.userA, ids.tenantA);
    const before = await rowCount(ids.tenantA);
    gate.m4Open = false;
    try {
      await expect(createRelationship({ organizationId: PIC, kind: 'partner' })).rejects.toBeInstanceOf(
        ModuleAccessError,
      );
    } finally {
      gate.m4Open = true;
    }
    expect(await rowCount(ids.tenantA)).toBe(before);
  });

  test.each([
    ['a kind outside the list', { organizationId: PIC, kind: 'xyz' }],
    ['a PIC that is not digits', { organizationId: 'org-1', kind: 'partner' }],
    ['a malformed email', { organizationId: PIC, kind: 'partner', counterpartEmail: 'not-an-email' }],
    ['notes over 5000 characters', { organizationId: PIC, kind: 'partner', notes: 'x'.repeat(5001) }],
    ['no PIC, no partner id and no name', { kind: 'partner' }],
  ])('%s is refused before any write', async (_label, input) => {
    signIn(ids.userA, ids.tenantA);
    const before = await rowCount(ids.tenantA);

    await expect(createRelationship(input as Parameters<typeof createRelationship>[0])).rejects.toThrow();

    expect(await rowCount(ids.tenantA)).toBe(before);
  });

  test('the same PIC twice returns the same row, and only one row exists', async () => {
    signIn(ids.userA, ids.tenantA);

    const first = await createRelationship({ organizationId: PIC, kind: 'partner', counterpartName: 'Partner One' });
    const second = await createRelationship({ organizationId: PIC, kind: 'partner', counterpartName: 'Partner One' });

    expect(second).toBe(first);
    expect(await rowsFor(ids.tenantA, PIC)).toHaveLength(1);
  });

  test('concurrent requests for one PIC leave one row (advisory lock, no unique index)', async () => {
    signIn(ids.userA, ids.tenantA);

    const ids5 = await Promise.all(
      Array.from({ length: 20 }, () =>
        createRelationship({ organizationId: OTHER_PIC, kind: 'partner', counterpartName: 'Race' }),
      ),
    );

    expect(new Set(ids5).size).toBe(1);
    expect(await rowsFor(ids.tenantA, OTHER_PIC)).toHaveLength(1);
  });

  test('a PIC already held by another tenant is not a duplicate here', async () => {
    signIn(ids.userB, ids.tenantB);

    const id = await createRelationship({ organizationId: PIC, kind: 'partner', counterpartName: 'Partner One' });

    expect(id).toBeTruthy();
    expect(await rowsFor(ids.tenantB, PIC)).toHaveLength(1);
    expect(await rowsFor(ids.tenantA, PIC)).toHaveLength(1);
  });

  test('a PIC-less request with a name is accepted (the announcement screen sends this)', async () => {
    signIn(ids.userA, ids.tenantA);
    const before = await rowCount(ids.tenantA);

    const id = await createRelationship({ kind: 'partner', counterpartName: 'No PIC Ltd', notes: 'from a call' });

    expect(id).toBeTruthy();
    expect(await rowCount(ids.tenantA)).toBe(before + 1);
    const row = await db.relationship.findUnique({ where: { id }, select: { ownerUserId: true, notes: true } });
    expect(row).toEqual({ ownerUserId: ids.userA, notes: 'from a call' });
  });
});
