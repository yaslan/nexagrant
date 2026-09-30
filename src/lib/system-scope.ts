import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * The one sanctioned way out of a tenant scope (TASK-MTVTPVTEBCF5Z, slice 6).
 *
 * ---------------------------------------------------------------------------
 * The problem this exists to solve, measured
 * ---------------------------------------------------------------------------
 *
 * `withTenant` (src/lib/db.ts) answers "which tenant is asking". Thirty-five
 * call sites in src/** have no answer to give and are nevertheless correct:
 *
 *   - the API-key hash lookup that DISCOVERS the tenant (src/lib/api-auth.ts);
 *   - the GDPR Art. 15/20 export, scoped by userId across every tenant a data
 *     subject belongs to (src/actions/user/export-data.ts);
 *   - the platform-admin consoles, behind requirePlatformAdmin();
 *   - the cron fan-outs whose tenant set is the query's OUTPUT, not its input.
 *
 * Each one is recorded, with a reason read out of its own file, in
 * scripts/tenant-bypass-baseline.json.
 *
 * Locally the app connects as `fabrika` (SUPERUSER, BYPASSRLS), so all thirty-
 * five work by accident. Under `fabrika_app` (NOBYPASSRLS) they return ZERO
 * ROWS. That is measured, not feared — 15 Membership rows across 7 tenants read
 * back as 0, and every table behaves the same way. So on the day the app stops
 * being BYPASSRLS, API-key auth, the magic-token partner portal, the GDPR
 * export and the daily alert fan-out all fail SILENTLY: no error, an empty
 * result, and a correct-looking screen.
 *
 * ---------------------------------------------------------------------------
 * The shape, and why it is this shape
 * ---------------------------------------------------------------------------
 *
 *   await withSystemScope('platform-aggregate', 'plan-repository.countLive',
 *     (tx) => tx.subscription.count({ where: { status: 'ACTIVE' } }))
 *
 * `purpose` is one of five values, matching the classes the baseline already
 * uses. `context` names the call site and travels into the log line, so a
 * cross-tenant read is attributable after the fact rather than anonymous.
 *
 * Inside, it opens a transaction and calls `enter_system_scope(purpose)`
 * (prisma/rls.sql), a SECURITY DEFINER function that validates the purpose
 * again in the database and flips `app.system_scope` with is_local => true.
 * Transaction-local is the whole safety story: there is no exit_system_scope,
 * because COMMIT and ROLLBACK are the exit and a caller cannot forget them.
 *
 * The RLS side is a separate PERMISSIVE policy named `system_scope`, ORed with
 * `tenant_isolation` rather than merged into it. `tenant_isolation` keeps its
 * exact wording, which matters beyond tidiness: scripts/rls-migrations.ts
 * compares every migration's copy of that policy to prisma/rls.sql byte for
 * byte, so rewording it would have turned nine migrations red.
 *
 * ---------------------------------------------------------------------------
 * What this is NOT
 * ---------------------------------------------------------------------------
 *
 * It is not a boundary against a compromised application process. Setting the
 * flag by hand no longer works: `app.system_scope` is USERSET, so `fabrika_app`
 * can still write it (`SET`, `set_config`, PGOPTIONS), but since
 * TASK-MUOGMQK3JAH4Y the policy also wants this transaction's seal in
 * `app.system_scope_token`, which only `enter_system_scope` can compute
 * (prisma/rls.sql, system_scope_open). What remains is that the app role may
 * CALL `enter_system_scope` — any listed purpose — so code that already runs
 * as us still gets in. The wrapper buys purpose validation, one greppable
 * entry point, a flag that cannot be forged, and a grant that ops can
 * `REVOKE EXECUTE` without a deploy. Same standing as `withTenant`, which can
 * equally set `app.tenant_id` to any tenant it likes.
 *
 * A hard boundary needs a SECOND connection under a role the tenant path does
 * not hold. That is a decision for a human and is written up as a 1-3-1 in
 * docs/agent-results/TASK-MTVTPVTEBCF5Z-de-fb.md §6. This signature is chosen so
 * that swapping the implementation later touches this file only: under the
 * second-role design `withSystemScope` hands back a client from a different
 * pool, and not one of its callers changes.
 *
 * ---------------------------------------------------------------------------
 * It cannot become a mute button
 * ---------------------------------------------------------------------------
 *
 * `pnpm rls:bypass-check` CHECK D counts every `withSystemScope(` in src/**, and
 * each one must be recorded in the baseline as kind "system-scope" with a
 * written reason. Moving a call from `prisma.x.find()` to `withSystemScope` does
 * not make it disappear from the gate; it moves it from one ratcheted list to
 * another. A new escape is red until a human writes down why it exists.
 */

/**
 * The closed set of reasons a query may leave its tenant scope.
 *
 * Duplicated in prisma/rls.sql's `enter_system_scope`, deliberately: the app
 * refuses an unknown purpose before the round trip and the database refuses it
 * again for anything that reaches it another way. tests/system-scope.live.test.ts
 * asserts the two lists are identical, so the duplication cannot drift.
 */
export const SYSTEM_SCOPE_PURPOSES = [
  /** The tenant is what the query LOOKS UP; nothing exists to scope to yet. */
  'tenant-discovery',
  /** Scoped by userId across every tenant a data subject belongs to (GDPR). */
  'subject-scoped',
  /** A platform-admin console, behind requirePlatformAdmin(). */
  'platform-admin',
  /** A question about the whole estate, whose answer is a number, not a tenant's rows. */
  'platform-aggregate',
  /** A cron fan-out whose tenant set is the query's output. */
  'cross-tenant-job',
] as const;

export type SystemScopePurpose = (typeof SYSTEM_SCOPE_PURPOSES)[number];

declare const systemScopeBrand: unique symbol;
export type SystemScopeBrand = { readonly [systemScopeBrand]: true };

/**
 * The client {@link withSystemScope} hands its callback.
 *
 * Branded for the same reason {@link import('@/lib/db').TenantTx} is: a bare
 * `prisma` must not satisfy it, so a helper that takes a `SystemTx` cannot be
 * handed the unscoped singleton by accident. The brand is minted in exactly one
 * place — below, beside the `enter_system_scope` call that earns it.
 */
export type SystemTx = Prisma.TransactionClient & SystemScopeBrand;

/** Thrown when the purpose is not one of {@link SYSTEM_SCOPE_PURPOSES}. */
export class UnknownSystemScopePurposeError extends Error {
  readonly code = 'SYSTEM_SCOPE_PURPOSE_UNKNOWN';

  constructor(purpose: string) {
    super(
      `withSystemScope was called with purpose "${purpose}", which is not one of ` +
        `${SYSTEM_SCOPE_PURPOSES.join(', ')}. Leaving a tenant scope needs a reason from the list.`
    );
    this.name = 'UnknownSystemScopePurposeError';
  }
}

/**
 * Same as {@link withSystemScope}, but on an explicitly supplied client — so a
 * test can run the real thing through the `fabrika_app` connection, which is the
 * only place the policy is observable at all.
 */
export async function withSystemScopeOn<T>(
  client: PrismaClient,
  purpose: SystemScopePurpose,
  context: string,
  callback: (tx: SystemTx) => Promise<T>
): Promise<T> {
  if (!(SYSTEM_SCOPE_PURPOSES as readonly string[]).includes(purpose)) {
    throw new UnknownSystemScopePurposeError(String(purpose));
  }

  return client.$transaction(async (tx) => {
    // Parameterised, exactly like withTenantOn's set_config: the purpose is a
    // bound value and is never interpolated, even though it has just been
    // checked against a closed list.
    await tx.$executeRaw`SELECT enter_system_scope(${purpose})`;

    logger.debug('cross-tenant read', { purpose, context });

    // The brand is minted here and nowhere else — beside the statement that
    // makes the claim true.
    return callback(tx as SystemTx);
  });
}

/**
 * Runs `callback` in a transaction where the `system_scope` RLS policy is open,
 * so a query may see rows belonging to every tenant.
 *
 * @param purpose Why this call is allowed to leave its tenant scope.
 * @param context Which call site this is, for the log line. Free text, stable.
 * @param callback The cross-tenant work. Keep it SMALL: everything inside runs
 *   with isolation off, so a scoped read that merely sits nearby belongs
 *   outside, in `withTenant`.
 */
export async function withSystemScope<T>(
  purpose: SystemScopePurpose,
  context: string,
  callback: (tx: SystemTx) => Promise<T>
): Promise<T> {
  return withSystemScopeOn(prisma, purpose, context, callback);
}
