import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { prisma } from '../src/lib/db';
import {
  loadRelationshipDetail,
  MissingTenantScopeError,
} from '../src/app/[locale]/(app)/[workspace]/relationships/[id]/data';
import { REL_E2E, seed, rollback } from '../scripts/seed-relationship-e2e';

/**
 * TASK-MTRKV9JGY7OQY — regression for the M4 relationship tenant leak.
 *
 * The bug was not "a missing null check" in the abstract; it was a specific
 * Prisma behaviour meeting a specific session type. `session?.tenantId` is
 * `string | null | undefined`, and Prisma treats an `undefined` field in a
 * `where` clause as *not written* rather than as "no match". So
 * `where: { id, tenantId: undefined }` is `where: { id }` — a cross-tenant read
 * through a guessable cuid. `src/types/prisma-override.d.ts` shadows the
 * generated client, so `pnpm typecheck` was green over it the whole time.
 *
 * The first test below asserts that Prisma behaviour directly against Postgres,
 * because a regression test for a fix is only meaningful if the thing it guards
 * against is real. The rest assert that the fixed loader cannot be driven into
 * it: a tenant may not read another tenant's row, and a call with no tenant
 * never reaches the database at all.
 */

/** A client that fails the test if anything tries to query through it. */
function forbiddenClient(): PrismaClient & { touched: number } {
  const stub = {
    touched: 0,
    $transaction() {
      stub.touched += 1;
      throw new Error('the database must not be touched without a tenant');
    },
  };
  return stub as unknown as PrismaClient & { touched: number };
}

describe('M4 relationship detail — tenant scope', () => {
  let ready = false;
  let skipReason = '';

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await seed();
      ready = true;
    } catch (e) {
      skipReason = e instanceof Error ? e.message : String(e);
      console.warn(`relationship tenant-scope tests skipped, no database: ${skipReason}`);
    }
  }, 60_000);

  afterAll(async () => {
    if (ready && process.env.REL_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect().catch(() => undefined);
  });

  test('the leak is real: Prisma drops an undefined tenantId from the where clause', async () => {
    if (!ready) return expect(skipReason).toBe('__no_database__');

    // Exactly the shape the old page produced when the session had no tenant.
    const undefinedTenant = undefined as unknown as string;
    const leaked = await prisma.relationship.findFirst({
      where: { id: REL_E2E.otherRelationshipId, tenantId: undefinedTenant },
      select: { id: true, tenantId: true },
    });

    // Not an assertion about what *should* happen — a recording of what does.
    expect(leaked).not.toBeNull();
    expect(leaked!.tenantId).toBe(REL_E2E.otherTenantId);

    // With a real tenant on the clause the same query is correctly empty, which
    // is why the bug hid: every session that had a tenant behaved perfectly.
    const scoped = await prisma.relationship.findFirst({
      where: { id: REL_E2E.otherRelationshipId, tenantId: REL_E2E.tenantId },
      select: { id: true },
    });
    expect(scoped).toBeNull();
  });

  test('tenant A cannot load tenant B’s relationship', async () => {
    if (!ready) return expect(skipReason).toBe('__no_database__');

    const stolen = await loadRelationshipDetail(REL_E2E.tenantId, REL_E2E.otherRelationshipId);
    expect(stolen).toBeNull();

    // Symmetric, so the result is isolation rather than one tenant being empty.
    const alsoStolen = await loadRelationshipDetail(
      REL_E2E.otherTenantId,
      REL_E2E.relationshipId,
    );
    expect(alsoStolen).toBeNull();
  });

  test('tenant A still loads its own relationship and interactions', async () => {
    if (!ready) return expect(skipReason).toBe('__no_database__');

    const own = await loadRelationshipDetail(REL_E2E.tenantId, REL_E2E.relationshipId);
    expect(own).not.toBeNull();
    expect(own!.relationship.id).toBe(REL_E2E.relationshipId);
    expect(own!.relationship.counterpartName).toBe(REL_E2E.counterpartName);
    expect(own!.interactions).toHaveLength(1);
    expect(own!.interactions[0]!.tenantId).toBe(REL_E2E.tenantId);
  });

  test('interactions never cross tenants even when the relationship id is known', async () => {
    if (!ready) return expect(skipReason).toBe('__no_database__');

    const b = await loadRelationshipDetail(REL_E2E.otherTenantId, REL_E2E.otherRelationshipId);
    expect(b).not.toBeNull();
    expect(b!.interactions.every((ix) => ix.tenantId === REL_E2E.otherTenantId)).toBe(true);
  });

  // These need no database: the point is that no query is issued at all.
  for (const [label, value] of [
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace', '   '],
  ] as const) {
    test(`a ${label} tenant never reaches the database`, async () => {
      const client = forbiddenClient();

      await expect(
        loadRelationshipDetail(value as unknown as string, REL_E2E.otherRelationshipId, client),
      ).rejects.toBeInstanceOf(MissingTenantScopeError);

      expect(client.touched, 'queries issued without a tenant').toBe(0);
    });
  }
});
