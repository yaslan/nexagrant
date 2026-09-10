import { describe, test, expect, vi } from 'vitest';
import {
  calculateCriterionAverage,
  calculateEvaluationScore,
  getScoreDistribution,
} from '../../../src/modules/m6/server/scoring';
import { MissingTenantScopeError, type TenantTx } from '../../../src/lib/db';

/**
 * TASK-MTUIPYSSNLVWG — the three M6 scoring loaders and the tenant they may not
 * be called without.
 *
 * The defect was not a wrong `where` clause; it was a *signature*. Each function
 * had a two-argument overload whose `tenantId` was optional, and omitting it did
 * not narrow the query — it removed `reviewer: { tenantId }` altogether and ran
 * on the global `prisma` client, which connects as a role RLS does not
 * constrain. Nothing in the repo took that branch, so nothing was leaking; what
 * made it worth closing is that `pnpm typecheck` was green either way, so the
 * next person to write `calculateCriterionAverage('crit-1')` would have been
 * warned by nothing and would have averaged every tenant's scores together.
 *
 * TASK-MTV5H4HCGGGQ5 then deleted the string-first overload itself — it had no
 * callers — so the two shapes below now fail for two different reasons: a bare id
 * is not a `TenantTx` at all, and the db form is short a required `tenantId`.
 * Both are still errors, which is what these directives pin.
 *
 * So the test has to be about reachability, not about a return value:
 *   1. the tenant-less call no longer compiles — `@ts-expect-error` fails
 *      `pnpm typecheck` (TS2578) the day the optional parameter comes back;
 *   2. a call that evades the type system anyway (untyped code, an `any`, a
 *      cast) is refused by `assertTenantScope` **before a query is issued**;
 *   3. the tenant-scoped call still behaves exactly as before, so the fix is
 *      not "everything now throws".
 */

/** A db double that fails loudly if the code under test ever reaches it. */
function guardedDb() {
  return {
    score: { findMany: vi.fn().mockResolvedValue([{ score: 4 }, { score: 5 }]) },
    evaluation: { findUnique: vi.fn().mockResolvedValue({ avgScore: null }) },
  } as unknown as TenantTx;
}

describe('M6 scoring loaders cannot be called without a tenant', () => {
  /**
   * Compile-time half. This function is never invoked — `tsc` checks its body
   * regardless, and each `@ts-expect-error` is itself an error if the call it
   * marks starts type-checking again.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _tenantlessCallsMustNotCompile = () => {
    const db = guardedDb();

    // @ts-expect-error there is no form that takes an id without a db: a string is not a TenantTx.
    void calculateCriterionAverage('crit-1');
    // @ts-expect-error tenantId is required on the db form too.
    void calculateCriterionAverage(db, 'crit-1');

    // @ts-expect-error there is no form that takes an id without a db: a string is not a TenantTx.
    void calculateEvaluationScore('eval-1');
    // @ts-expect-error tenantId is required on the db form too.
    void calculateEvaluationScore(db, 'eval-1');

    // @ts-expect-error there is no form that takes an id without a db: a string is not a TenantTx.
    void getScoreDistribution('crit-1');
    // @ts-expect-error tenantId is required on the db form too.
    void getScoreDistribution(db, 'crit-1');
  };

  /**
   * Runtime half. `as unknown as` is how such a call would actually arrive in
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
    test(`calculateCriterionAverage refuses ${label} without querying`, async () => {
      const db = guardedDb();
      const call = calculateCriterionAverage as unknown as (
        db: TenantTx,
        criterionId: string,
        tenantId: unknown
      ) => Promise<number>;

      await expect(call(db, 'crit-1', tenantId)).rejects.toBeInstanceOf(MissingTenantScopeError);
      expect(db.score.findMany).not.toHaveBeenCalled();
    });

    test(`calculateEvaluationScore refuses ${label} without querying`, async () => {
      const db = guardedDb();
      const call = calculateEvaluationScore as unknown as (
        db: TenantTx,
        evaluationId: string,
        tenantId: unknown
      ) => Promise<number>;

      await expect(call(db, 'eval-1', tenantId)).rejects.toBeInstanceOf(MissingTenantScopeError);
      expect(db.score.findMany).not.toHaveBeenCalled();
      expect(db.evaluation.findUnique).not.toHaveBeenCalled();
    });

    test(`getScoreDistribution refuses ${label} without querying`, async () => {
      const db = guardedDb();
      const call = getScoreDistribution as unknown as (
        db: TenantTx,
        criterionId: string,
        tenantId: unknown
      ) => Promise<Record<number, number>>;

      await expect(call(db, 'crit-1', tenantId)).rejects.toBeInstanceOf(MissingTenantScopeError);
      expect(db.score.findMany).not.toHaveBeenCalled();
    });
  }

  test('the refusal names the caller and carries the repo-wide code', async () => {
    const db = guardedDb();
    const call = getScoreDistribution as unknown as (
      db: TenantTx,
      criterionId: string,
      tenantId: unknown
    ) => Promise<Record<number, number>>;

    await expect(call(db, 'crit-1', undefined)).rejects.toMatchObject({
      code: 'TENANT_SCOPE_REQUIRED',
      message: expect.stringContaining('getScoreDistribution'),
    });
  });

  /**
   * The single-tenant path, unchanged — without this the suite above could pass
   * on a version of the module that refuses everything.
   */
  test('a tenant-scoped call still runs, and still filters by that tenant', async () => {
    const db = guardedDb();

    await expect(calculateCriterionAverage(db, 'crit-1', 'tenant-a')).resolves.toBe(4.5);
    expect(db.score.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { criterionId: 'crit-1', reviewer: { tenantId: 'tenant-a' }, submittedAt: { not: null } },
      })
    );

    const distDb = guardedDb();
    await expect(getScoreDistribution(distDb, 'crit-1', 'tenant-a')).resolves.toEqual({
      1: 0,
      2: 0,
      3: 0,
      4: 1,
      5: 1,
    });
    expect(distDb.score.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { criterionId: 'crit-1', reviewer: { tenantId: 'tenant-a' }, submittedAt: { not: null } },
      })
    );
  });

  test('the evaluation loader keeps the tenant on the reviewer relation', async () => {
    const db = {
      score: {
        findMany: vi.fn().mockResolvedValue([
          { score: 4, reviewer: { id: 'r1' }, criterion: { id: 'c1', name: 'Excellence', weight: 1 } },
        ]),
      },
    } as unknown as TenantTx;

    await expect(calculateEvaluationScore(db, 'eval-1', 'tenant-a')).resolves.toBe(4);
    expect(db.score.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reviewer: { evaluationId: 'eval-1', tenantId: 'tenant-a' }, submittedAt: { not: null } },
      })
    );
  });
});
