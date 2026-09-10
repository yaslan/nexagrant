import { describe, test, expect, vi } from 'vitest';
import { compareM6ToESR } from '../../../src/modules/m6/server/comparison';
import type { TenantScopedDb } from '../../../src/modules/m6/server/scoring';
import { MissingTenantScopeError } from '../../../src/lib/db';

/**
 * TASK-MTV5GFB75N43S — `compareM6ToESR` and the tenant it may not be called
 * without. Twin of tests/modules/m6/scoring-tenant-scope.test.ts
 * (TASK-MTUIPYSSNLVWG); same defect class, one file over.
 *
 * The defect was not a wrong `where` clause. `compareM6ToESR` had a
 * two-argument overload whose `tenantId` was optional, and omitting it did two
 * things at once: it ran `compareM6ToESRInternal` on the global `prisma` client
 * — a role RLS does not constrain — and it short-circuited the ownership guard,
 * which read `tenantId && evaluation.tenantId !== tenantId`. What is left is
 * `findUnique({ where: { id } })`: a lookup by a known id across every tenant,
 * returning that evaluation's panel scores, ESR comparison and reviewer roster.
 *
 * Nothing in the repo took that branch, so nothing leaked. The signature was the
 * bug: `pnpm typecheck` was green either way, so the next person to write
 * `compareM6ToESR('eval-1')` would have been warned by nothing.
 *
 * Hence three claims, none of them about a return value:
 *   1. the tenant-less call no longer compiles — `@ts-expect-error` becomes a
 *      TS2578 failure the day the optional parameter comes back;
 *   2. a call that evades the type system anyway (untyped code, an `any`, a
 *      cast) is refused *before a query is issued*;
 *   3. tenant A's evaluation, asked for in tenant B's context, is refused at
 *      runtime — and the tenant-scoped happy path still works, so the fix is
 *      not "everything now throws".
 */

/** An evaluation owned by tenant-a, complete enough to compare successfully. */
function tenantAEvaluation() {
  return {
    id: 'eval-a',
    tenantId: 'tenant-a',
    avgScore: 4.0,
    proposal: { esrScores: { total: 13.5 } },
    reviewers: [
      { id: 'rev-1', userId: 'user-1', status: 'completed', scores: [{ score: 4, criterionId: 'c1' }] },
    ],
  };
}

/**
 * A db double standing in for the unscoped client the old branch used: it
 * answers every id with tenant-a's row, exactly as a BYPASSRLS connection would.
 */
function crossTenantDb() {
  return {
    evaluation: { findUnique: vi.fn().mockResolvedValue(tenantAEvaluation()) },
  } as unknown as TenantScopedDb;
}

describe('compareM6ToESR cannot be called without a tenant', () => {
  /**
   * Compile-time half. Never invoked — `tsc` checks the body regardless, and
   * each `@ts-expect-error` is itself an error once the call it marks starts
   * type-checking again.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _tenantlessCallsMustNotCompile = () => {
    const db = crossTenantDb();

    // @ts-expect-error tenantId is required: the one-argument form used to run unscoped.
    void compareM6ToESR('eval-1');
    // @ts-expect-error tenantId is required on the db form too.
    void compareM6ToESR(db, 'eval-1');
  };

  /**
   * Runtime half. `as unknown as` is how such a call actually arrives in
   * practice — from untyped code, a JSON-shaped argument, or a cast someone
   * added to silence the compiler.
   */
  const evasions: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace', '   '],
  ];

  for (const [label, tenantId] of evasions) {
    test(`refuses ${label} without querying`, async () => {
      const db = crossTenantDb();
      const call = compareM6ToESR as unknown as (
        db: TenantScopedDb,
        evaluationId: string,
        tenantId: unknown
      ) => Promise<unknown>;

      await expect(call(db, 'eval-a', tenantId)).rejects.toBeInstanceOf(MissingTenantScopeError);
      expect(db.evaluation.findUnique).not.toHaveBeenCalled();
    });
  }

  test('the refusal names the caller and carries the repo-wide code', async () => {
    const db = crossTenantDb();
    const call = compareM6ToESR as unknown as (
      db: TenantScopedDb,
      evaluationId: string,
      tenantId: unknown
    ) => Promise<unknown>;

    await expect(call(db, 'eval-a', undefined)).rejects.toMatchObject({
      code: 'TENANT_SCOPE_REQUIRED',
      message: expect.stringContaining('compareM6ToESR'),
    });
  });

  /**
   * The ownership guard itself, now that it is unconditional. Even holding a
   * client that answers with tenant-a's row, a tenant-b caller is refused —
   * this is the assertion that fails if the guard goes back to
   * `tenantId && evaluation.tenantId !== tenantId`.
   */
  test("tenant B is refused tenant A's evaluation even when the client returns it", async () => {
    const db = crossTenantDb();

    await expect(compareM6ToESR(db, 'eval-a', 'tenant-b')).rejects.toThrow(
      /not found or access denied/i
    );
    expect(db.evaluation.findUnique).toHaveBeenCalled();
  });

  /** Without this, everything above would pass on a module that refuses all callers. */
  test('the owning tenant still gets its comparison', async () => {
    const db = crossTenantDb();

    const result = await compareM6ToESR(db, 'eval-a', 'tenant-a');
    expect(result.m6Score).toBe(4.0);
    expect(result.esrScore).toBe(4.6);
    expect(result.delta).toBe(0.6);
  });
});
