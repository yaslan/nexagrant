import { NextResponse } from 'next/server';
import { authenticateApiKey, type ApiKeyNgGate } from '@/lib/api-auth';
import { internalError } from '@/lib/api-error';
import { checkModuleAccess } from '@/lib/modules/access';
import { logger } from '@/lib/logger';
import { asRole, can, type Action } from '@/lib/rbac';
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
  /**
   * `session`: set when the session door let the request in — the member the NexaGrant plan
   * gate (NG-250) asks about. An API key has no member, so it is not set for one.
   */
  | { authenticated: true; session?: { tenantId: string; role: string } }
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
 *   of a limited plan are the ones /api/v1 runs, and `ng` (NG-272) is the route's
 *   NexaGrant plan feature, checked there too. A key that is present but wrong
 *   is a 401 here; it never falls through to the session.
 * - No key: a signed-in member whose tenant opens M1 in full. Anonymous is 401; a
 *   plan without M1, or with M1 only in limited form, is 403 (as for a key); past
 *   the per-user limit is 429 with Retry-After. The route checks `ng` for a member
 *   itself (ngGateResponse), from the `session` this returns.
 */
export async function authenticateCordisRequest(req: Request, ng: ApiKeyNgGate | null): Promise<CordisAuthResult> {
  if (req.headers.get('x-api-key') || req.headers.get('Authorization')) {
    const keyAuth = await authenticateApiKey(req, ng);
    return keyAuth.authenticated ? { authenticated: true } : keyAuth;
  }

  // NG-257: a signed-in session must also hold the permission the partner search
  // stands behind (view_partner_search). Only this door: the API-key branch above is unchanged.
  return authenticateCordisSession('view_partner_search');
}

/**
 * The session door alone, for the pages that show CORDIS data to a signed-in
 * member (`partners/leaders`). Same answers as the session branch above: 401
 * anonymous, 403 when M1 is not open in full, 429 past the shared per-user limit.
 * With `action`, a role without that permission gets 403 `forbidden` first.
 */
export async function authenticateCordisSession(action?: Action): Promise<CordisAuthResult> {
  try {
    const tenant = await requireTenantApi();
    if (!tenant.ok) return { authenticated: false, errorResponse: tenant.response };

    if (action && !can(asRole(tenant.scope.role), action)) {
      return {
        authenticated: false,
        errorResponse: NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 }),
      };
    }

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

    return { authenticated: true, session: { tenantId: tenant.scope.tenantId, role: tenant.scope.role } };
  } catch (error) {
    logger.error('[cordis-api-auth] session check failed', error);
    return {
      authenticated: false,
      errorResponse: internalError({ success: false, error: 'internal_error' }),
    };
  }
}
