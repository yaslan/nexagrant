import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';

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
  return new (PrismaClient as any)({ adapter: new PrismaPg(pool) }) as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createDbClient(connectionString);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

type TenantTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

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
