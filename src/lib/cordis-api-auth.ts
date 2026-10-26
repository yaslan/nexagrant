import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-auth';
import { internalError } from '@/lib/api-error';
import { checkModuleAccess } from '@/lib/modules/access';
import { logger } from '@/lib/logger';
import { requireTenantApi } from '@/lib/tenant';
import { UserWindowLimiter } from '@/lib/user-rate-limit';

/**
 * Searches one signed-in user may run against /api/cordis/* in a minute. An API
 * key has its own per-key limit (API_KEY_RATE_LIMIT_PER_MINUTE); a session has
 * none, so without this a logged-in client could walk the whole CORDIS table in a
 * loop (FO-159: 100.000 organisations in 9,7 s). 60 is a guess at human pace, not
 * a measured one; change it here, nowhere else.
 */
export const CORDIS_SESSION_PER_USER_PER_MINUTE = 60;
const sessionLimiter = new UserWindowLimiter(CORDIS_SESSION_PER_USER_PER_MINUTE);

export type CordisAuthResult =
  | { authenticated: true }
  | { authenticated: false; errorResponse: NextResponse };

function moduleDenied(): CordisAuthResult {
  return {
    authenticated: false,
    errorResponse: NextResponse.json({ error: 'MODULE_ACCESS_DENIED', module: 'M1' }, { status: 403 }),
  };
}

/**
 * Who may read /api/cordis/*: the /api/v1 policy, reached by one of two doors.
 *
 * - An API key (`x-api-key` or `Authorization`) goes through `authenticateApiKey`
 *   unchanged, so the key lookup, the per-key limit, the M1 gate and the refusal
 *   of a limited plan are the ones /api/v1 runs. A key that is present but wrong
 *   is a 401 here; it never falls through to the session.
 * - No key: a signed-in member whose tenant opens M1 in full. Anonymous is 401; a
 *   plan without M1, or with M1 only in limited form, is 403 (as for a key); past
 *   the per-user limit is 429 with Retry-After.
 */
export async function authenticateCordisRequest(req: Request): Promise<CordisAuthResult> {
  if (req.headers.get('x-api-key') || req.headers.get('Authorization')) {
    const keyAuth = await authenticateApiKey(req);
    return keyAuth.authenticated ? { authenticated: true } : keyAuth;
  }

  try {
    const tenant = await requireTenantApi();
    if (!tenant.ok) return { authenticated: false, errorResponse: tenant.response };

    const access = await checkModuleAccess('M1');
    if (!access.allowed || access.limits) return moduleDenied();

    const retryAfter = sessionLimiter.take(tenant.scope.userId);
    if (retryAfter !== null) {
      return {
        authenticated: false,
        errorResponse: NextResponse.json(
          { success: false, error: 'rate_limited' },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        ),
      };
    }

    return { authenticated: true };
  } catch (error) {
    logger.error('[cordis-api-auth] session check failed', error);
    return {
      authenticated: false,
      errorResponse: internalError({ success: false, error: 'internal_error' }),
    };
  }
}
