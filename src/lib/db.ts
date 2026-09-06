import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';

// Optimized PG connection pool with 1s fast timeout for instant fallback in dev
const pool = new pg.Pool({ 
  connectionString,
  connectionTimeoutMillis: 1000,
  idleTimeoutMillis: 5000,
});
const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? (new (PrismaClient as any)({ adapter }) as PrismaClient);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Executes a transaction where the PostgreSQL session variable `app.tenant_id`
 * is set to the provided `tenantId` to enforce Row-Level Security (RLS).
 * 
 * @param tenantId The Tenant ID to set in the database session
 * @param callback The transactional operations to perform
 */
export async function withTenant<T>(
  tenantId: string,
  callback: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Set the tenant context for this transaction.
    // `SET LOCAL app.tenant_id = $1` is a syntax error in Postgres — SET does not take
    // bind parameters. set_config(..., is_local => true) is the parameterisable
    // equivalent, so the tenant id stays a bound value and is never interpolated.
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    // Execute the callback with the transactional client
    return callback(tx);
  });
}
