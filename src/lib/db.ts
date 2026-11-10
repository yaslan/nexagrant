import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { assertEnvelopedOrNull } from '@/lib/calendar/token-envelope';
import { dbConnectTimeoutMs, env } from '@/lib/env';
import { decryptResult, encryptWriteData, findNestedTaxIdAccess } from '@/lib/billing/tax-id-crypto';

/**
 * FO-141: no built-in fallback URL. A process without DATABASE_URL used to
 * connect to whatever Postgres answered on localhost:5432 with a well-known
 * password. Now the first use fails with a message that names the variable;
 * importing this module (a build step, a test that mocks the client) does not.
 */
export class MissingDatabaseUrlError extends Error {
  constructor() {
    super('DATABASE_URL is not set; refusing to connect to a default database.');
    this.name = 'MissingDatabaseUrlError';
  }
}

function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) throw new MissingDatabaseUrlError();
  return env.DATABASE_URL;
}

function missingUrlClient(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      // `await prisma` and string conversion probe these; they are not a query.
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      throw new MissingDatabaseUrlError();
    },
  });
}

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
 * NG-40: `buyerVknTckn` (tax number / TCKN) is stored as an AES-256-GCM envelope
 * on `TenantBillingIdentity` and `Invoice`. Encrypts every write and decrypts
 * every row read through this client, so no call site handles ciphertext.
 * Same placement and reach as {@link withCalendarTokenGate}. See
 * `src/lib/billing/tax-id-crypto.ts` for the key and the read/write rules.
 */
function withTaxIdEncryption(client: PrismaClient): PrismaClient {
  const handlers = {
    async $allOperations({ operation, args, query }: { operation: string; args: unknown; query: (args: never) => Promise<unknown> }) {
      const a = args as { data?: unknown; create?: unknown; update?: unknown } | undefined;
      switch (operation) {
        case 'create':
        case 'createMany':
        case 'createManyAndReturn':
        case 'update':
        case 'updateMany':
        case 'updateManyAndReturn':
          encryptWriteData(a?.data);
          break;
        case 'upsert':
          encryptWriteData(a?.create);
          encryptWriteData(a?.update);
          break;
        default:
      }
      const result = await query(args as never);
      decryptResult(result);
      return result;
    },
  };
  return client.$extends({
    name: 'tax-id-field-encryption',
    query: {
      tenantBillingIdentity: handlers,
      invoice: handlers,
      // F1: any other model must not reach the field through a nested write / include.
      $allModels: {
        async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: unknown; query: (args: never) => Promise<unknown> }) {
          // The two covered models are handled above (the model-specific handler also runs).
          const via = model === 'TenantBillingIdentity' || model === 'Invoice' ? null : findNestedTaxIdAccess(args);
          if (via) {
            throw new Error(
              `${model}.${operation} reaches the encrypted tax number through "${via}"; query TenantBillingIdentity / Invoice directly (NG-40)`
            );
          }
          return query(args as never);
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
export function createDbClient(url: string, poolOptions: DbPoolOptions = {}): PrismaClient {
  // 1s by default (fast fallback); DB_CONNECT_TIMEOUT_MS raises it in the test/gate env.
  // poolOptions still wins, so a caller that sets its own value keeps it.
  const pool = new pg.Pool({
    connectionString: url,
    connectionTimeoutMillis: dbConnectTimeoutMs,
    idleTimeoutMillis: 5000,
    ...poolOptions,
  });
  return withTaxIdEncryption(withCalendarTokenGate(new PrismaClient({ adapter: new PrismaPg(pool) })));
}

/** The pg pool settings a caller of {@link createDbClient} may change. */
export type DbPoolOptions = { max?: number; connectionTimeoutMillis?: number; application_name?: string };

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  lockPool: PrismaClient | undefined;
  picBudgetPool: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? (env.DATABASE_URL ? createDbClient(env.DATABASE_URL) : missingUrlClient());

if (process.env.NODE_ENV !== 'production' && env.DATABASE_URL) globalForPrisma.prisma = prisma;

/**
 * B-1 (TASK-MUO9IFMMVRUDJ, İNCELEME-92): the pool of {@link withTenantLockPool}.
 * Its transactions hold a lock while they wait on something outside the
 * database (evidence confirm: an object-store copy of up to 15 s). On the
 * application pool — 10 connections a process — ten such waits took every
 * connection, and every other query of every tenant failed after 1 s. Here
 * they take at most `LOCK_POOL_MAX` connections of their own; one more waits
 * `LOCK_POOL_QUEUE_MS` for a free one and then fails, the rest of the app
 * never notices. Its connections show up in `pg_stat_activity` under
 * `application_name = LOCK_POOL_NAME`.
 */
export const LOCK_POOL_MAX = 3;
export const LOCK_POOL_QUEUE_MS = 5_000;
export const LOCK_POOL_NAME = 'fonbridge-lock-pool';
export const LOCK_POOL_OPTIONS: DbPoolOptions = {
  max: LOCK_POOL_MAX,
  connectionTimeoutMillis: LOCK_POOL_QUEUE_MS,
  application_name: LOCK_POOL_NAME,
};

function lockPoolClient(): PrismaClient {
  globalForPrisma.lockPool ??= createDbClient(requireDatabaseUrl(), LOCK_POOL_OPTIONS);
  return globalForPrisma.lockPool;
}

/**
 * FO-389 (review B-1): the pool of the shared PIC budget (`src/lib/pic-budget.ts`).
 * The budget is spent while the profile transaction holds a connection of the application
 * pool, and it has to commit on its own (a rolled-back save must not hand the question back), so
 * it cannot ride that transaction. On the application pool it asked for a second connection while
 * holding the first: ten unsolicited questions at once took all ten and every other query of
 * every tenant failed after 1 s. Here the spend waits on a pool nothing else uses. The spend is one
 * statement of a millisecond or two, so two connections carry far more than the app can send.
 * Its connections show up in `pg_stat_activity` under `application_name = PIC_BUDGET_POOL_NAME`.
 */
export const PIC_BUDGET_POOL_MAX = 2;
export const PIC_BUDGET_QUEUE_MS = 5_000;
export const PIC_BUDGET_POOL_NAME = 'fonbridge-pic-budget';
export const PIC_BUDGET_POOL_OPTIONS: DbPoolOptions = {
  max: PIC_BUDGET_POOL_MAX,
  connectionTimeoutMillis: PIC_BUDGET_QUEUE_MS,
  application_name: PIC_BUDGET_POOL_NAME,
};

/** The client of {@link PIC_BUDGET_POOL_OPTIONS}; created on first use, one per process. */
export function picBudgetClient(): PrismaClient {
  globalForPrisma.picBudgetPool ??= createDbClient(requireDatabaseUrl(), PIC_BUDGET_POOL_OPTIONS);
  return globalForPrisma.picBudgetPool;
}

declare const tenantScopeBrand: unique symbol;
export type TenantScopeBrand = { readonly [tenantScopeBrand]: true };

/**
 * The client shape {@link withTenant} hands its callback: a Prisma client with
 * the connection- and transaction-level methods removed, because inside a
 * transaction they are not available.
 *
 * The brand is nominal: a bare `prisma` does not satisfy this type anymore
 * (TASK-MTV5E5PUAJYSS). The brand is minted here, at the type definition, and
 * stamped at the only place the guarantee is actually enforced —
 * {@link withTenantOn}, beside `set_config('app.tenant_id', ...)`.
 *
 * Note: this does NOT catch `as unknown as TenantTx` in tests or utility scripts
 * (TASK-MTV4ZJEECXNDE §2.3, §2.4). A second guard — lint rule, manual review, or
 * a test helper that mints the brand — is needed for the full nominal guarantee.
 * The brand catches bare-prisma passes at the type boundary; `as unknown as`
 * bypasses it and is a separate audit point.
 *
 * Until a second guard is in place, the tenant guarantee is also carried by
 * {@link assertTenantScope} at the query boundary and by RLS in the database —
 * both of which check a *value*, which is why they hold where the type does not.
 */
export type TenantTx = Prisma.TransactionClient & TenantScopeBrand;

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
  callback: (tx: TenantTx) => Promise<T>,
  options?: TenantTxOptions
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

    // Execute the callback with the transactional client.
    // tx is a Prisma.TransactionClient; casting to TenantTx mints the nominal brand
    // to prove that app.tenant_id has been set in this transaction.
    return callback(tx as TenantTx);
  }, options);
}

/**
 * Prisma's interactive-transaction limits, for the rare caller whose
 * transaction must outlive the 5 s default (evidence confirm holds a lock
 * across an object-store copy). Everything else keeps the default.
 */
export type TenantTxOptions = { maxWait?: number; timeout?: number };

/**
 * Executes a transaction where the PostgreSQL session variable `app.tenant_id`
 * is set to the provided `tenantId` to enforce Row-Level Security (RLS).
 *
 * @param tenantId The Tenant ID to set in the database session
 * @param callback The transactional operations to perform
 */
export async function withTenant<T>(
  tenantId: string,
  callback: (tx: TenantTx) => Promise<T>,
  options?: TenantTxOptions
): Promise<T> {
  return withTenantOn(prisma, tenantId, callback, options);
}

/**
 * {@link withTenant} on its own small pool ({@link LOCK_POOL_MAX}), for a
 * transaction that holds a lock across a call outside the database. Anything
 * that only talks to the database uses {@link withTenant}.
 */
export async function withTenantLockPool<T>(
  tenantId: string,
  callback: (tx: TenantTx) => Promise<T>,
  options?: TenantTxOptions
): Promise<T> {
  return withTenantOn(lockPoolClient(), tenantId, callback, { maxWait: LOCK_POOL_QUEUE_MS, ...options });
}
