import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { assertEnvelopedOrNull } from '@/lib/calendar/token-envelope';

const connectionString = process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';

function guardCalendarTokenWrite(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const record = data as Record<string, unknown>;
  if ('accessToken' in record) {
    assertEnvelopedOrNull(record.accessToken as string | null | undefined, 'accessToken');
  }
  if ('refreshToken' in record) {
    assertEnvelopedOrNull(record.refreshToken as string | null | undefined, 'refreshToken');
  }
}

/**
 * Machine-enforced version of the contract in `src/lib/calendar/token-envelope.ts`:
 * every `calendarConnection` create/update/upsert on this client is checked
 * before it reaches Postgres, so a future write path that forgets to encrypt a
 * token fails loudly instead of landing a plaintext row. Applied in
 * `createDbClient` (not just the `prisma` singleton) so every client this
 * module hands out — including the RLS-role test client — carries it, and it
 * survives into `$transaction`'s `tx` because Prisma extensions apply there too.
 */
function withCalendarTokenGate(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: 'calendar-token-envelope-gate',
    query: {
      calendarConnection: {
        create({ args, query }) {
          guardCalendarTokenWrite(args.data);
          return query(args);
        },
        update({ args, query }) {
          guardCalendarTokenWrite(args.data);
          return query(args);
        },
        updateMany({ args, query }) {
          guardCalendarTokenWrite(args.data);
          return query(args);
        },
        upsert({ args, query }) {
          guardCalendarTokenWrite(args.create);
          guardCalendarTokenWrite(args.update);
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

/**
 * Builds a Prisma client over its own pg pool.
 *
 * Almost everything should use the `prisma` singleton below. This exists so a
 * second connection can be opened under a *different* database role — notably
 * `fabrika_app` (NOBYPASSRLS), which is the only way to observe the RLS
 * policies locally, since the default `fabrika` role is SUPERUSER and therefore
 * exempt from them. See prisma/rls-app-role.sql.
 */
export function createDbClient(url: string): PrismaClient {
  // 1s fast timeout for instant fallback in dev
  const pool = new pg.Pool({
    connectionString: url,
    connectionTimeoutMillis: 1000,
    idleTimeoutMillis: 5000,
  });
  return withCalendarTokenGate(new PrismaClient({ adapter: new PrismaPg(pool) }));
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createDbClient(connectionString);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * The client shape {@link withTenant} hands its callback: a Prisma client with
 * the connection- and transaction-level methods removed, because inside a
 * transaction they are not available.
 *
 * **This guarantee is structural, not nominal (TASK-MTV4ZJEECXNDE §2.3).** The
 * name says "I came from a tenant-scoped transaction", but the *type* only says
 * "I have the query methods" — so a bare `prisma`, which connects as a role RLS
 * does not constrain, satisfies it and compiles. `scripts/rescore-g0.ts` passes
 * exactly that today and typechecks green. Read a `TenantTx` parameter as a
 * request to the caller, not as a proof about the caller.
 *
 * Closing that gap needs a nominal brand minted in one place — `withTenantOn`,
 * beside the `set_config` line — and it is deliberately NOT done here:
 * TASK-MTV5E5PUAJYSS carries it. The measurement behind that split is in
 * `docs/agent-results/TASK-MTV4ZJEECXNDE-blok-zincir-dse.md`: a brand catches
 * 6 of 19 argument positions, because the other 13 reach these functions through
 * `as unknown as`, which walks past a brand as easily as past a structural type.
 *
 * Until then, the tenant guarantee is carried by {@link assertTenantScope} at the
 * query boundary and by RLS in the database — both of which check a *value*,
 * which is why they hold where the type does not.
 */
export type TenantTx = Prisma.TransactionClient;

/**
 * Thrown when a tenant-scoped read or write is attempted with no tenant.
 *
 * "No tenant" is never a wider query in this codebase — it is a refusal. The
 * recurring leak this guards is a `where` clause built as
 * `tenantId ? { tenantId } : {}`: a session without a tenant does not narrow
 * the query, it *removes the filter*, and the screen renders every tenant's
 * rows (TASK-MTRKV9JGY7OQY, TASK-MTUGJTD5HZDW0). The single-row twin,
 * `{ id, tenantId } : { id }`, is worse — a lookup by a known id across
 * tenants. Prisma produces the same result from `tenantId: undefined`, because
 * it treats an undefined field in a `where` clause as *not written*.
 *
 * `src/lib/tenant.ts` refuses at the request boundary (redirect / 401 / throw);
 * this one refuses at the query boundary, so a loader called directly — by a
 * job, a test, or a future caller that skipped the boundary — still cannot
 * reach the database without a tenant.
 */
export class MissingTenantScopeError extends Error {
  readonly code = 'TENANT_SCOPE_REQUIRED';

  constructor(context: string) {
    super(`${context} was called without a tenant; refusing to query.`);
    this.name = 'MissingTenantScopeError';
  }
}

/**
 * Narrows an untrusted `tenantId` to a non-empty string, or throws.
 *
 * Rejects `''` and whitespace as well as `null`/`undefined`: an empty string is
 * falsy in the ternary that caused the leak, and `set_config('app.tenant_id',
 * '')` would hand Postgres a tenant that matches no RLS policy while a
 * superuser connection (the local default role) ignores RLS entirely.
 */
export function assertTenantScope(
  tenantId: unknown,
  context: string
): asserts tenantId is string {
  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new MissingTenantScopeError(context);
  }
}

/**
 * Same as {@link withTenant}, but on an explicitly supplied client. Keeps the
 * tenant-scoping logic in exactly one place when a caller (a test, a job) needs
 * a connection other than the singleton.
 */
export async function withTenantOn<T>(
  client: PrismaClient,
  tenantId: string,
  callback: (tx: TenantTx) => Promise<T>
): Promise<T> {
  // Before the connection is touched: every caller of this function is asking
  // for a tenant-scoped transaction, so a missing tenant is a bug in the
  // caller, not a request for an unscoped one.
  assertTenantScope(tenantId, 'withTenantOn');

  return client.$transaction(async (tx) => {
    // Set the tenant context for this transaction.
    // `SET LOCAL app.tenant_id = $1` is a syntax error in Postgres — SET does not take
    // bind parameters. set_config(..., is_local => true) is the parameterisable
    // equivalent, so the tenant id stays a bound value and is never interpolated.
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    // Execute the callback with the transactional client
    return callback(tx);
  });
}

/**
 * Executes a transaction where the PostgreSQL session variable `app.tenant_id`
 * is set to the provided `tenantId` to enforce Row-Level Security (RLS).
 *
 * @param tenantId The Tenant ID to set in the database session
 * @param callback The transactional operations to perform
 */
export async function withTenant<T>(
  tenantId: string,
  callback: (tx: TenantTx) => Promise<T>
): Promise<T> {
  return withTenantOn(prisma, tenantId, callback);
}
