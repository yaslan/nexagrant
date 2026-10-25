import crypto from 'crypto';
import { withTenant } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { errorMessage } from '@/lib/errors';
import { API_KEY_RATE_LIMIT_PER_MINUTE } from '@/lib/api-rate-limit';
import { checkModuleAccessForTenant } from '@/lib/modules/tenant-access';
import type { MachineViewer } from '@/lib/modules/state-machine';
import type { ModuleId } from '@/lib/modules/types';

export interface AuthenticatedApiRequest {
  tenantId: string;
  apiKeyId: string;
  name: string;
}

const API_KEY_RATE_WINDOW_MS = 60_000;

/**
 * Every `/api/v1/*` route is the Partner REST API, which is the M1 module. The
 * gate sits here, in `authenticateApiKey`, not in each route: a route that calls
 * `authenticateApiKey` is gated, and the route scan in tests/api/v1-module-gate.test.ts
 * fails a route that does not call it or calls it after reading data. A new route
 * that skips the call is not refused by anything at runtime.
 */
const PARTNER_API_MODULE: ModuleId = 'M1';

/**
 * An API key is not a member, so it acts under a role no membership holds. It is a
 * machine audience: open where a pilot's managers are (`PILOT`), closed to `DEV`,
 * which is staff only.
 */
const API_KEY_VIEWER: MachineViewer = { kind: 'machine', role: 'API_KEY', isPlatformAdmin: false, isMachine: true };

function moduleDenied(): { authenticated: false; errorResponse: NextResponse } {
  return {
    authenticated: false,
    errorResponse: NextResponse.json(
      { error: 'MODULE_ACCESS_DENIED', module: PARTNER_API_MODULE },
      { status: 403 }
    ),
  };
}

function invalidKey(): { authenticated: false; errorResponse: NextResponse } {
  return {
    authenticated: false,
    errorResponse: NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or revoked API key.',
        code: 'AUTH_INVALID_API_KEY',
      },
      { status: 401 }
    ),
  };
}

/**
 * Validates API key from `x-api-key` or `Authorization: Bearer <key>` header,
 * then counts the request against the key's per-minute limit (429 when over).
 */
export async function authenticateApiKey(req: Request): Promise<
  | { authenticated: true; data: AuthenticatedApiRequest }
  | { authenticated: false; errorResponse: NextResponse }
> {
  const apiKeyHeader =
    req.headers.get('x-api-key') ||
    req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');

  if (!apiKeyHeader) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Missing API key. Provide `x-api-key` or `Authorization: Bearer <key>` header.',
          code: 'AUTH_MISSING_API_KEY',
        },
        { status: 401 }
      ),
    };
  }

  // Hash key with SHA-256
  const keyHash = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');

  try {
    // The SHA-256 hash IS the credential, and this lookup is what DISCOVERS the
    // tenant — withTenant cannot wrap it, because the argument it needs is this
    // call's result. Under `fabrika_app` (NOBYPASSRLS) the unscoped read returns
    // no row at all and every API key on the platform stops authenticating, so
    // the discovery runs on the sanctioned cross-tenant path instead.
    const keyRecord = await withSystemScope('tenant-discovery', 'api-auth.keyByHash', (tx) =>
      tx.apiKey.findUnique({ where: { keyHash } })
    );

    if (!keyRecord) {
      // An unknown key is rejected, full stop. There used to be a prefix
      // escape hatch here (`fp_live_demo...`) that authenticated the caller as
      // a fixed tenant — that is an unauthenticated cross-tenant read for
      // anyone who can guess a prefix, so it is gone. Integration testing uses
      // a real ApiKey row created by the seed.
      return invalidKey();
    }

    // Per-key rate limit (TASK-MUN66T2HM4A4E O-4). The API keys screen promises
    // {@link API_KEY_RATE_LIMIT_PER_MINUTE} requests a minute; this is where that
    // promise is kept. One UPDATE both counts the request and reads the result,
    // so concurrent requests serialise on the row lock and none can slip past
    // the limit between a read and a write. It is a fixed one-minute window: a
    // new window starts when the stored one is a minute old, which lets a client
    // spend at most twice the limit across one window boundary — the price of a
    // counter that lives in two columns instead of a table of timestamps.
    //
    // The same statement records lastUsedAt. That write used to be
    // fire-and-forget so a timestamp could never fail an authentication; the
    // counter has to be synchronous, and a failure here lands in the catch below
    // and fails closed like the key lookup does (an uncounted key is unlimited).
    // Tenant-scoped, not system-scoped: only the discovery read is cross-tenant.
    //
    // The same statement also refuses a soft-deleted tenant (`Tenant.deletedAt`
    // set, in its hold before the purge; TASK-MUO4GO5ARDY2W). The session path
    // already drops such a tenant in the jwt callback, and a key must not keep
    // reading a workspace its own members can no longer open. `ApiKey` declares
    // no `tenant` relation, so the check is an EXISTS here rather than a filter
    // on the discovery read: no extra round trip, and a deleted tenant's key
    // neither counts nor stamps `lastUsedAt`. Clearing `deletedAt` gives the
    // same key its access back.
    const now = new Date();
    const windowStartedBefore = new Date(now.getTime() - API_KEY_RATE_WINDOW_MS);
    const usage = await withTenant(keyRecord.tenantId, (tx) =>
      tx.$queryRaw<Array<{ count: number; windowStartedAt: Date }>>`
        UPDATE "ApiKey"
        SET "rateWindowCount" = CASE
              WHEN "rateWindowStartedAt" IS NULL OR "rateWindowStartedAt" <= ${windowStartedBefore}
              THEN 1 ELSE "rateWindowCount" + 1 END,
            "rateWindowStartedAt" = CASE
              WHEN "rateWindowStartedAt" IS NULL OR "rateWindowStartedAt" <= ${windowStartedBefore}
              THEN ${now} ELSE "rateWindowStartedAt" END,
            "lastUsedAt" = ${now}
        WHERE "id" = ${keyRecord.id} AND "tenantId" = ${keyRecord.tenantId}
          AND EXISTS (SELECT 1 FROM "Tenant" WHERE "Tenant"."id" = ${keyRecord.tenantId} AND "Tenant"."deletedAt" IS NULL)
        RETURNING "rateWindowCount" AS "count", "rateWindowStartedAt" AS "windowStartedAt"`
    );
    const window = usage[0];
    if (!window) {
      // The row vanished between the lookup and the count (revoked mid-request),
      // or its tenant is soft-deleted. Both read as a revoked key.
      return invalidKey();
    }

    if (window.count > API_KEY_RATE_LIMIT_PER_MINUTE) {
      const resetAt = new Date(window.windowStartedAt).getTime() + API_KEY_RATE_WINDOW_MS;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));
      return {
        authenticated: false,
        errorResponse: NextResponse.json(
          {
            error: 'Too Many Requests',
            message: `Rate limit of ${API_KEY_RATE_LIMIT_PER_MINUTE} requests per minute exceeded for this API key.`,
            code: 'RATE_LIMITED',
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfterSeconds),
              'X-RateLimit-Limit': String(API_KEY_RATE_LIMIT_PER_MINUTE),
              'X-RateLimit-Remaining': '0',
            },
          }
        ),
      };
    }

    // Module and plan gate, after the key and its count: a key whose tenant has
    // switched M1 off, or whose plan no longer includes it, is refused here even
    // though it still authenticates. Revoking a key is not gated (its own route).
    const access = await checkModuleAccessForTenant(keyRecord.tenantId, PARTNER_API_MODULE, API_KEY_VIEWER);
    if (!access.allowed) {
      return moduleDenied();
    }
    // FO-41: a plan granting M1 in limited form (Discover, Basic, TTO Edition)
    // meters partner searches per month. This API counts nothing, so it is not
    // part of the limited mode; such a tenant cannot mint a key either
    // (`assertModuleWrite` in settings/api-keys/actions.ts).
    if (access.limits) {
      return moduleDenied();
    }

    return {
      authenticated: true,
      data: {
        tenantId: keyRecord.tenantId,
        apiKeyId: keyRecord.id,
        name: keyRecord.name,
      },
    };
  } catch (e) {
    // A database outage must fail closed. The previous behaviour authenticated
    // any `fp_live_` prefixed string as a fixed tenant whenever the key lookup
    // threw, which turned an outage into an open door.
    console.error(`[authenticateApiKey] key lookup failed: ${errorMessage(e)}`);

    return {
      authenticated: false,
      errorResponse: internalError({
        error: 'Internal Server Error',
        message: 'API key authentication failed.',
        code: 'AUTH_INTERNAL_ERROR',
      }),
    };
  }
}
