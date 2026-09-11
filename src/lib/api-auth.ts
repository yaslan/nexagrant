import crypto from 'crypto';
import { withTenant } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/errors';

export interface AuthenticatedApiRequest {
  tenantId: string;
  apiKeyId: string;
  name: string;
}

/**
 * Validates API key from `x-api-key` or `Authorization: Bearer <key>` header
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

    // Update lastUsedAt asynchronously. The tenant is known by now, so this one
    // is scoped rather than system-scoped: only the read had to be cross-tenant.
    //
    // It was invisible to `pnpm rls:bypass-check` until this card, because CHECK
    // A matches `prisma.<model>.<op>(` on one line and this call was written
    // across three. It is the only tenant-scoped call in src/** in that shape —
    // measured, see docs/agent-results/TASK-MTVTPVTEBCF5Z-de-fb.md §5.
    // Fire-and-forget, and it must STAY fire-and-forget: `.catch()` alone only
    // catches a rejected promise, so a synchronous throw here (a helper that is
    // undefined under a partial test double, a pool that refuses a connection)
    // would escape into the try block above and turn a valid key into
    // AUTH_INTERNAL_ERROR. A last-used timestamp must never fail an
    // authentication — measured: it did, in tests/api/v1-calls.test.ts.
    void (async () => {
      try {
        await withTenant(keyRecord.tenantId, (tx) =>
          tx.apiKey.update({
            where: { id: keyRecord.id, tenantId: keyRecord.tenantId },
            data: { lastUsedAt: new Date() },
          })
        );
      } catch {
        // best effort
      }
    })();

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
      errorResponse: NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'API key authentication failed.',
          code: 'AUTH_INTERNAL_ERROR',
        },
        { status: 500 }
      ),
    };
  }
}
