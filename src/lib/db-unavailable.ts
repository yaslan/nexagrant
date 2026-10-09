import { errorCode, errorMessage } from '@/lib/errors';

/**
 * Whether a caught value says "the database could not be reached", as opposed to
 * "the database (or Prisma) refused this query".
 *
 * TASK-MUO64UQJUWEBI (İNCELEME-83 Y-1). `createOpportunity` falls back to an
 * in-memory buffer when the database is down, and its `catch` used to treat every
 * error as that outage. A `workspaceSlug` of `{foo:1}` or `7` (Prisma validation
 * error) or `"ws-a\u0000"` (Postgres 22021) made the workspace lookup throw, the
 * refusal never happened, and the row was buffered with `success: true` — drawn on
 * every workspace board of the tenant. A fallback for outages must only ever see
 * outages, so this is an allow-list: anything not recognised here is a refusal.
 *
 * Shapes measured against Prisma 7 + `@prisma/adapter-pg` (the client `db.ts` builds):
 * - port closed: `PrismaClientKnownRequestError` with `code: 'ECONNREFUSED'`; inside
 *   `$transaction`, an `AggregateError` with the same code;
 * - host unknown / unreachable: Prisma `P1001`; bad credentials: `P1000`;
 * - pool connect timeout (`connectionTimeoutMillis`): a plain `Error`,
 *   "Connection terminated due to connection timeout".
 */

/**
 * Prisma: authentication failed, server unreachable, connect timeout, operation timeout,
 * TLS failure, server closed the connection, pool exhausted.
 */
const PRISMA_UNAVAILABLE = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1011', 'P1017', 'P2024']);

/** Node socket errnos a driver passes through. */
const SOCKET_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
]);

/** Postgres SQLSTATEs for "no usable connection": class 08, shutdown/startup, too many clients. */
const PG_UNAVAILABLE = /^08[0-9A-Z]{3}$|^57P0[123]$|^53300$/;

/** `pg` / `pg-pool` connection failures, which carry no code. */
const DRIVER_MESSAGES = /Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error/i;

const UNAVAILABLE_CLASSES = new Set(['PrismaClientInitializationError', 'PrismaClientRustPanicError']);

export function isDatabaseUnavailable(error: unknown, depth = 0): boolean {
  if (typeof error !== 'object' || error === null || depth > 4) return false;

  if (UNAVAILABLE_CLASSES.has(error.constructor?.name ?? '')) return true;

  const code = errorCode(error);
  if (code && (PRISMA_UNAVAILABLE.has(code) || SOCKET_CODES.has(code) || PG_UNAVAILABLE.test(code))) return true;

  const adapterCode = (error as { meta?: { driverAdapterError?: { cause?: { code?: unknown } } } }).meta
    ?.driverAdapterError?.cause?.code;
  if (typeof adapterCode === 'string' && (PG_UNAVAILABLE.test(adapterCode) || SOCKET_CODES.has(adapterCode))) {
    return true;
  }

  if (DRIVER_MESSAGES.test(errorMessage(error, ''))) return true;

  const { cause, errors } = error as { cause?: unknown; errors?: unknown };
  if (cause !== undefined && isDatabaseUnavailable(cause, depth + 1)) return true;
  return Array.isArray(errors) && errors.some((e) => isDatabaseUnavailable(e, depth + 1));
}
