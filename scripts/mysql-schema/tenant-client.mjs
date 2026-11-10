// FO-381 B1 — the only place that builds a MariaDB view client (tenant-scoped reads and writes).
//
// Why this file exists (FO-375 audit, B1): the adapter's pool keeps session variables between
// requests. `@app_tenant_id` set by one tenant's request stayed on the connection and the next
// request read that tenant's rows without setting anything. Two rules close that:
//   1. `resetAfterUse: true` is fixed here; callers cannot turn it off.
//   2. The tenant is set with SET only inside a transaction (`withTenant`), never outside one.
// Connection settings (strict SQL mode, UTC) are re-applied by `initSql` after each reset.
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../node_modules/.prisma/client-mysql-view/index.js';

export const SQL_MODE = 'STRICT_ALL_TABLES,ANSI_QUOTES,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY';

// Same shape as the storage layer's tenant id check (SAFE_TENANT_ID), with the length cap of
// VarChar(128). A trailing space is rejected because utf8mb4_bin PAD SPACE would match another id.
const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** True when `value` is a tenant id the view client may bind. */
export function isValidTenantId(value) {
  return typeof value === 'string' && TENANT_ID_RE.test(value);
}

/**
 * Pool configuration for the view client. Only the keys below are read; anything else a caller
 * passes (including `resetAfterUse`) is dropped, so the reset flag cannot be disabled.
 */
export function buildPoolConfig({ host, port, user, password, database, connectionLimit = 5 }) {
  return {
    host,
    port,
    user,
    password,
    database,
    connectionLimit,
    resetAfterUse: true,
    initSql: [`SET SESSION sql_mode='${SQL_MODE}', time_zone='+00:00'`],
  };
}

/**
 * Runs `fn` with the tenant bound to the session, inside one transaction (one connection).
 * The variable is cleared when the connection goes back to the pool (resetAfterUse).
 */
export async function withTenant(prisma, tenantId, fn) {
  if (!isValidTenantId(tenantId)) {
    throw new Error('withTenant: invalid tenant id');
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET @app_tenant_id = ${tenantId}`;
    return fn(tx);
  });
}

/**
 * Builds the view client. Tenant work goes through `tenant(id, fn)`. `prisma` stays exposed only
 * for infrastructure code and for tests that prove a query without a tenant sees nothing.
 */
export function createViewClient(options) {
  const adapter = new PrismaMariaDb(buildPoolConfig(options));
  const prisma = new PrismaClient({ adapter });
  return {
    prisma,
    tenant: (tenantId, fn) => withTenant(prisma, tenantId, fn),
    disconnect: () => prisma.$disconnect(),
  };
}
