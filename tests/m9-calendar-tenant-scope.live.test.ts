import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';

import { prisma } from '@/lib/db';
import { assertAppOwnerRole, skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MTVR7W9ZXO7M — the M9 calendar slice of the tenant-bypass inventory
 * (TASK-MTSZ0AL4QP2CT §3.8, §3.9).
 *
 * `disconnectCalendar` checked ownership in JavaScript and then deleted by id
 * alone. This file asks the only question that matters about that shape, and it
 * asks the *database*, not the return value: after the action is called with a
 * connection id belonging to somebody else, is the row still there?
 *
 * Bound to row existence on purpose. A test that asserted on `deleteMany`'s
 * `count` would also pass against the unguarded `delete({ where: { id } })`,
 * which returns the deleted row and never reports a zero — the assertion would
 * be green while the row was gone.
 *
 * `.live` because it needs the Postgres in docker-compose; the whole file skips
 * itself when that database is unreachable rather than failing the suite for
 * the wrong reason.
 */

const TENANT_A = 'tenant-m9-scope-a';
const USER_A = 'user-m9-scope-a';
const TENANT_B = 'tenant-m9-scope-b';
const USER_B = 'user-m9-scope-b';

const { requireTenantActionMock } = vi.hoisted(() => ({ requireTenantActionMock: vi.fn() }));

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: requireTenantActionMock,
  TenantScopeError: class TenantScopeError extends Error {},
}));

const { disconnectCalendar } = await import('@/modules/m9/server/calendar-actions');

const dbReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

// The ownership check under test is the action's own; over an RLS-subject role
// the policy would keep the foreign row alive and the test would pass regardless.
if (dbReachable) await assertAppOwnerRole(prisma, 'm9 calendar tenant-scope live test');
else skipOrFailInCi('m9 calendar tenant-scope live test', 'Postgres is unreachable (`docker compose up -d`)');

/** Reads the row straight out of Postgres, past Prisma's model layer. */
async function rowExists(id: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "CalendarConnection" WHERE id = ${id}`;
  return rows.length === 1;
}

async function seedConnection(tenantId: string, userId: string) {
  return prisma.calendarConnection.create({
    data: { tenantId, userId, provider: 'ics', isConnected: true },
  });
}

function actingAs(tenantId: string, userId: string) {
  requireTenantActionMock.mockResolvedValue({
    tenantId,
    userId,
    role: 'PIPELINE_MANAGER',
    workspaceIds: [],
    isPlatformAdmin: false,
  });
}

describe.skipIf(!dbReachable)('disconnectCalendar against a live database', () => {
  beforeEach(async () => {
    requireTenantActionMock.mockReset();
    await prisma.calendarConnection.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
  });

  afterAll(async () => {
    await prisma.calendarConnection.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
  });

  test("leaves another tenant's connection row in the database", async () => {
    const victim = await seedConnection(TENANT_A, USER_A);
    expect(await rowExists(victim.id)).toBe(true);

    actingAs(TENANT_B, USER_B);
    // A refusal is returned, not thrown (TASK-MUSFNYHSA49AB).
    await expect(disconnectCalendar(victim.id)).resolves.toMatchObject({ ok: false });

    // The claim of this card, measured where it is true or false: in the table.
    expect(await rowExists(victim.id)).toBe(true);
  });

  test("leaves a sibling user's connection row in the same tenant", async () => {
    // The owner predicate carries `userId` as well as `tenantId`, so a
    // colleague inside the same tenant is refused for the same reason.
    const victim = await seedConnection(TENANT_A, USER_A);

    actingAs(TENANT_A, USER_B);
    // A refusal is returned, not thrown (TASK-MUSFNYHSA49AB).
    await expect(disconnectCalendar(victim.id)).resolves.toMatchObject({ ok: false });

    expect(await rowExists(victim.id)).toBe(true);
  });

  test('still deletes the row when the caller does own it', async () => {
    // The counterfactual arm. Without it, an action that had simply stopped
    // deleting anything would satisfy both assertions above.
    const own = await seedConnection(TENANT_A, USER_A);

    actingAs(TENANT_A, USER_A);
    await expect(disconnectCalendar(own.id)).resolves.toEqual({ ok: true, success: true });

    expect(await rowExists(own.id)).toBe(false);
  });
});
