import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { assertAppOwnerRole, skipOrFailInCi } from './helpers/live-db-role';

/**
 * Live tests for the focal-point assignment (TASK-MTTOUDNQ97X83, F-2).
 *
 * The erasure job detaches `Relationship.ownerUserId` when the person it names
 * is erased, and nothing could then assign a new one: the relationship stayed
 * unassigned for good. `updateRelationship` can now write the column, and the
 * rule that matters is the one a mocked Prisma cannot check — a relationship
 * may only be handed to a member of the tenant that owns it. "The `where`
 * clause has a `tenantId` in it" is a claim about source text; whether the
 * database refuses the write is a claim about the database, so it is measured
 * against one.
 *
 * Only `auth()` and `revalidatePath` are replaced. Everything below is the
 * production code path.
 */

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

const { updateRelationship } = await import(
  '@/app/[locale]/(app)/[workspace]/relationships/actions'
);

const pool = new pg.Pool({ connectionString: CONNECTION });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

// Measured as the app's own role on purpose (see tests/helpers/live-db-role.ts):
// over an RLS-subject role the policies, not the code, would do the refusing.
if (HAS_DB) await assertAppOwnerRole(db, 'relationship owner-assignment live test');
else skipOrFailInCi('relationship owner-assignment live test', 'Postgres is unreachable (`docker compose up -d`)');

const RUN = randomBytes(4).toString('hex');
const ids = {
  tenantA: `rel-t-a-${RUN}`,
  tenantB: `rel-t-b-${RUN}`,
  ownerA: `rel-u-a1-${RUN}`,
  memberA: `rel-u-a2-${RUN}`,
  goneA: `rel-u-a3-${RUN}`,
  outsiderB: `rel-u-b1-${RUN}`,
  rel: `rel-r-${RUN}`,
};

async function seed() {
  await db.tenant.createMany({
    data: [
      { id: ids.tenantA, name: `Rel A ${RUN}`, slug: `rel-a-${RUN}`, country: 'TR' },
      { id: ids.tenantB, name: `Rel B ${RUN}`, slug: `rel-b-${RUN}`, country: 'BE' },
    ],
  });
  await db.user.createMany({
    data: [
      { id: ids.ownerA, email: `a1-${RUN}@t.invalid`, name: 'Owner A' },
      { id: ids.memberA, email: `a2-${RUN}@t.invalid`, name: 'Member A' },
      { id: ids.goneA, email: `a3-${RUN}@t.invalid`, name: 'Gone A', deletedAt: new Date() },
      { id: ids.outsiderB, email: `b1-${RUN}@t.invalid`, name: 'Outsider B' },
    ],
  });
  await db.membership.createMany({
    data: [
      { tenantId: ids.tenantA, userId: ids.ownerA, role: 'TENANT_OWNER', workspaceIds: [] },
      { tenantId: ids.tenantA, userId: ids.memberA, role: 'MEMBER', workspaceIds: [] },
      { tenantId: ids.tenantA, userId: ids.goneA, role: 'MEMBER', workspaceIds: [] },
      { tenantId: ids.tenantB, userId: ids.outsiderB, role: 'TENANT_OWNER', workspaceIds: [] },
    ],
  });
  // The state the erasure job leaves behind: a relationship with no focal point.
  await db.relationship.create({
    data: {
      id: ids.rel,
      tenantId: ids.tenantA,
      kind: 'partner',
      ownerUserId: null,
      counterpartName: `Partner ${RUN}`,
      warmth: 'warm',
    },
  });
}

async function cleanup() {
  await db.relationship.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.membership.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.tenant.deleteMany({ where: { id: { in: [ids.tenantA, ids.tenantB] } } });
  await db.user.deleteMany({
    where: { id: { in: [ids.ownerA, ids.memberA, ids.goneA, ids.outsiderB] } },
  });
}

const ownerOf = async (id: string) =>
  (await db.relationship.findUnique({ where: { id }, select: { ownerUserId: true } }))?.ownerUserId ?? null;

/** The signed-in identity the action will read. */
function signIn(userId: string, tenantId: string, role: string) {
  currentSession = { user: { id: userId }, tenantId, role };
}

describe.skipIf(!HAS_DB)('updateRelationship — focal-point assignment', () => {
  beforeAll(async () => {
    await cleanup();
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
    await pool.end().catch(() => {});
  });

  test('an unassigned relationship can be given a new focal point', async () => {
    signIn(ids.ownerA, ids.tenantA, 'TENANT_OWNER');
    expect(await ownerOf(ids.rel)).toBeNull();

    const result = await updateRelationship(ids.rel, { ownerUserId: ids.memberA });

    expect(result).toEqual({ success: true });
    expect(await ownerOf(ids.rel)).toBe(ids.memberA);
  });

  test('a member of ANOTHER tenant is refused — and the column does not move', async () => {
    signIn(ids.ownerA, ids.tenantA, 'TENANT_OWNER');
    const before = await ownerOf(ids.rel);

    const result = await updateRelationship(ids.rel, { ownerUserId: ids.outsiderB });

    expect(result).toEqual({ success: false, error: 'OWNER_NOT_IN_TENANT' });
    expect(await ownerOf(ids.rel)).toBe(before);
  });

  test('a user id that does not exist is refused the same way — no id probe', async () => {
    signIn(ids.ownerA, ids.tenantA, 'TENANT_OWNER');

    const result = await updateRelationship(ids.rel, { ownerUserId: `ghost-${RUN}` });

    // Identical to the cross-tenant answer on purpose: a different message
    // would let this field tell a caller which user ids are real.
    expect(result).toEqual({ success: false, error: 'OWNER_NOT_IN_TENANT' });
  });

  test('a soft-deleted member of this tenant is refused', async () => {
    signIn(ids.ownerA, ids.tenantA, 'TENANT_OWNER');

    const result = await updateRelationship(ids.rel, { ownerUserId: ids.goneA });

    expect(result).toEqual({ success: false, error: 'OWNER_NOT_IN_TENANT' });
  });

  test('a role without manage_workspaces cannot reassign', async () => {
    signIn(ids.memberA, ids.tenantA, 'MEMBER');
    const before = await ownerOf(ids.rel);

    const result = await updateRelationship(ids.rel, { ownerUserId: ids.ownerA });

    expect(result).toEqual({ success: false, error: 'FORBIDDEN' });
    expect(await ownerOf(ids.rel)).toBe(before);
  });

  test('that same role can still edit warmth and notes', async () => {
    signIn(ids.memberA, ids.tenantA, 'MEMBER');
    const before = await ownerOf(ids.rel);

    const result = await updateRelationship(ids.rel, { warmth: 'hot', notes: 'still editable' });

    expect(result).toEqual({ success: true });
    const row = await db.relationship.findUnique({ where: { id: ids.rel } });
    expect(row?.warmth).toBe('hot');
    expect(row?.notes).toBe('still editable');
    // An edit that never mentioned the owner must not unassign the relationship.
    expect(row?.ownerUserId).toBe(before);
  });

  test('the focal point can be cleared on purpose', async () => {
    signIn(ids.ownerA, ids.tenantA, 'TENANT_OWNER');

    const result = await updateRelationship(ids.rel, { ownerUserId: null });

    expect(result).toEqual({ success: true });
    expect(await ownerOf(ids.rel)).toBeNull();
  });

  test('an empty string is not an owner id', async () => {
    signIn(ids.ownerA, ids.tenantA, 'TENANT_OWNER');

    const result = await updateRelationship(ids.rel, { ownerUserId: '' });

    expect(result).toEqual({ success: false, error: 'INVALID_INPUT' });
  });

  test("another tenant's session cannot touch this relationship at all", async () => {
    signIn(ids.outsiderB, ids.tenantB, 'TENANT_OWNER');

    const result = await updateRelationship(ids.rel, { ownerUserId: ids.outsiderB });

    // It is not this tenant's row, so there is nothing to update — the same
    // answer a non-existent relationship gets.
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
    expect(await ownerOf(ids.rel)).toBeNull();
  });
});
