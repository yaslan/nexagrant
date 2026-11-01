import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPublicRoute } from '@/lib/routes';
import { assertTenantWritable, PilotExpiredError } from '@/lib/billing/pilot';
import { PILOT_EXPIRED_DIGEST } from '@/lib/pilot-expired';
import { FORBIDDEN_ROLE_DIGEST } from '@/lib/forbidden-role';
import { SERVICE_BUSY_DIGEST } from '@/lib/service-busy';
import { SESSION_REQUIRED_DIGEST } from '@/lib/session-required';
import { isDatabaseUnavailable } from '@/lib/db-unavailable';
import { asRole, can, type Action } from '@/lib/rbac';
import { errorMessage } from '@/lib/errors';

/**
 * Tenant resolution — the single place a request's tenant is decided.
 *
 * CLAUDE.md §1 requires every business query to be tenant-scoped. Before this
 * module the codebase resolved the tenant with inline fallbacks
 * (`session?.tenantId || 'demo-tenant-1'`, or `prisma.tenant.findFirst()`).
 * Both are silent cross-tenant grants: `demo-tenant` is a *real* row in the
 * database, so a caller with a broken or missing session was handed a live
 * tenant's data instead of being rejected.
 *
 * The rule here is: no session tenant → no data. Pages redirect, route handlers
 * answer 401, server actions throw. There is no fallback tenant.
 */

/** Shape of the extra claims the NextAuth session callback puts on the session. */
type SessionLike =
  | {
      user?: { id?: string | null; email?: string | null; isPlatformAdmin?: unknown } | null;
      tenantId?: unknown;
      role?: unknown;
      workspaceIds?: unknown;
      isPlatformAdmin?: unknown;
    }
  | null
  | undefined;

export interface TenantScope {
  /** Tenant the request is allowed to read and write. Never a placeholder. */
  tenantId: string;
  userId: string;
  role: string;
  workspaceIds: string[];
  isPlatformAdmin: boolean;
}

export class TenantScopeError extends Error {
  readonly code = SESSION_REQUIRED_DIGEST;
  /** Kept by Next.js across the action boundary: src/lib/session-required.ts. */
  readonly digest = SESSION_REQUIRED_DIGEST;

  constructor(message = 'Request has no tenant scope; refusing to query tenant data.') {
    super(message);
    this.name = 'TenantScopeError';
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Pure reader: pulls the tenant scope out of a session object, or null when the
 * session carries no tenant. Exported so it can be unit tested without a
 * request context.
 */
export function tenantScopeOf(session: SessionLike): TenantScope | null {
  if (!session) return null;

  const userId = asString(session.user?.id);
  const tenantId = asString(session.tenantId);
  if (!userId || !tenantId) return null;

  return {
    tenantId,
    userId,
    role: asString(session.role) ?? 'MEMBER',
    workspaceIds: asStringArray(session.workspaceIds),
    isPlatformAdmin: session.isPlatformAdmin === true,
  };
}

/**
 * For server actions. Throws instead of returning a fallback tenant, so a
 * caller that forgets to check cannot accidentally read another tenant.
 */
export function assertTenant(session: SessionLike): TenantScope {
  const scope = tenantScopeOf(session);
  if (!scope) throw new TenantScopeError();
  return scope;
}

/**
 * Convenience for server actions that do their own `auth()` call.
 *
 * A server action is a write by default, so this is also where a tenant whose
 * free pilot has ended is made read-only (TASK-MUMABL78X5JLX,
 * src/lib/billing/pilot.ts): it throws `PilotExpiredError` before the action
 * body runs. An action that only reads passes `{ readOnly: true }`. Failing
 * closed is deliberate — a new action nobody marked is refused for an expired
 * pilot, which is visible; the other default would let it write.
 *
 * `can` is the permission the caller's role must carry (src/lib/rbac.ts); a
 * role without it is refused with `ForbiddenRoleError` before the body runs.
 * Every write action names one — tests/server-action-rbac-guard.test.ts keeps
 * it that way. The pilot is checked first: an expired pilot is the answer for
 * every role, so it is the one worth showing.
 */
export async function requireTenantAction(
  opts: { readOnly?: boolean; can?: Action } = {}
): Promise<TenantScope> {
  const scope = assertTenant((await auth()) as SessionLike);
  if (!opts.readOnly) await assertTenantActionWritable(scope.tenantId);
  if (opts.can) assertTenantActionRole(scope, opts.can);
  return scope;
}

/**
 * The caller's role does not carry the permission an action needs
 * (src/lib/rbac.ts). Leaves the action with `digest = 'FORBIDDEN_ROLE'` so the
 * browser can say "your role cannot do this" instead of "try again"
 * (src/lib/forbidden-role.ts). The message names the permission, never the
 * user.
 */
export class ForbiddenRoleError extends Error {
  readonly code = FORBIDDEN_ROLE_DIGEST;
  readonly digest = FORBIDDEN_ROLE_DIGEST;

  constructor(readonly action: Action) {
    super(`Forbidden: this role cannot ${action}.`);
    this.name = 'ForbiddenRoleError';
  }
}

/**
 * Role half of {@link requireTenantAction} (TASK-MUN80UOUPB2A4, FB GÜVENLİK
 * Y-3). `rbac.ts` is the one permission table; this only asks it. For an
 * action that resolves its tenant itself — call it next to
 * `assertTenantActionWritable`. A role outside the enum (a stale token) grants
 * nothing, as in `can`.
 */
export function assertTenantActionRole(scope: Pick<TenantScope, 'role'>, action: Action): void {
  if (!can(asRole(scope.role), action)) throw new ForbiddenRoleError(action);
}

/**
 * The pilot check could not reach the database: the application pool had no
 * free connection in time, or the server could not be reached at all
 * (src/lib/service-busy.ts, TASK-MUOF85BU7BV3X). Leaves the action with
 * `digest = 'SERVICE_BUSY'`, so the browser says "busy, try again in a moment"
 * rather than the driver's text. The message is fixed; what the driver said is
 * logged on the server, never put on this error.
 */
export class ServiceBusyError extends Error {
  readonly code = SERVICE_BUSY_DIGEST;
  readonly digest = SERVICE_BUSY_DIGEST;

  constructor() {
    super('Service busy: the database had no connection for this request. Try again.');
    this.name = 'ServiceBusyError';
  }
}

/**
 * `assertTenantWritable` for a server action. The refusal leaves with
 * `digest = 'PILOT_EXPIRED'`: Next.js keeps a digest that is already set, so in
 * production — where the browser gets no message — the UI can still tell it
 * apart and say "pilot ended" instead of "try again" (src/lib/pilot-expired.ts,
 * TASK-MUMIIUEGJ6N8B). For an action that checks the tenant itself rather than
 * through `requireTenantAction`.
 *
 * A check that could not reach the database leaves as `ServiceBusyError`
 * (İNCELEME-103 G-1): under load the application pool gives no connection
 * within its 1 s, and every action rejected with pg-pool's own message. Only a
 * failure `isDatabaseUnavailable` recognises is turned into it; any other error
 * leaves as it was thrown.
 */
export async function assertTenantActionWritable(tenantId: string): Promise<void> {
  try {
    await assertTenantWritable(tenantId);
  } catch (error) {
    if (error instanceof PilotExpiredError) Object.assign(error, { digest: PILOT_EXPIRED_DIGEST });
    else if (isDatabaseUnavailable(error)) {
      console.error(`[requireTenantAction] pilot check could not reach the database: ${errorMessage(error)}`);
      throw new ServiceBusyError();
    }
    throw error;
  }
}

/**
 * For pages (server components). Sends an anonymous visitor to the login page
 * and a signed-in user without a membership to the "no workspace" screen.
 * Never returns without a tenant.
 */
export async function requireTenantPage(locale: string): Promise<TenantScope> {
  const session = (await auth()) as SessionLike;

  if (!session?.user?.id) {
    redirect(getPublicRoute('login', locale));
  }

  const scope = tenantScopeOf(session);
  if (!scope) {
    redirect(`/${locale}/no-workspace`);
  }

  return scope;
}

export type TenantApiResult =
  | { ok: true; scope: TenantScope }
  | { ok: false; response: NextResponse };

/**
 * For route handlers. Returns a 401 response object rather than throwing, so
 * the handler can `return result.response` and keep its own error contract.
 */
export async function requireTenantApi(opts: { write?: boolean } = {}): Promise<TenantApiResult> {
  const scope = tenantScopeOf((await auth()) as SessionLike);

  if (!scope) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Oturumunuz bir çalışma alanına bağlı değil. Lütfen tekrar giriş yapın.',
          code: 'TENANT_SCOPE_REQUIRED',
        },
        { status: 401 }
      ),
    };
  }

  // A write handler (`{ write: true }`) of a tenant whose free pilot has ended
  // answers 403 — see requireTenantAction above.
  if (opts.write) {
    try {
      await assertTenantWritable(scope.tenantId);
    } catch (error) {
      if (!(error instanceof PilotExpiredError)) throw error;
      return {
        ok: false,
        response: NextResponse.json(
          {
            // `error` is the sentence: the member form shows `data.error` as is.
            error: 'Ücretsiz pilot süresi doldu; çalışma alanı salt-okunur. Verileriniz korunuyor.',
            code: 'PILOT_EXPIRED',
            endsAt: error.endsAt.toISOString(),
          },
          { status: 403 }
        ),
      };
    }
  }

  return { ok: true, scope };
}

/**
 * Platform-admin scope. A platform admin acts *across* tenants, so it is a
 * separate check from {@link tenantScopeOf} — never a stronger version of it.
 *
 * `auth.ts` already resolves the flag (from the User row; the demo profile and
 * the superadmin email count only while DEMO_LOGIN_ENABLED is on, see
 * src/lib/demo-login.ts) and puts it on the session, so this reads the claim and
 * does not re-derive it from an email address.
 */
export function isPlatformAdminSession(session: SessionLike): boolean {
  if (!session) return false;
  return Boolean(
    session.isPlatformAdmin === true ||
      session.user?.isPlatformAdmin === true ||
      session.role === 'SUPER_ADMIN' ||
      session.role === 'PLATFORM_ADMIN'
  );
}

export class PlatformAdminRequiredError extends Error {
  readonly code = 'PLATFORM_ADMIN_REQUIRED';

  constructor(message = 'Unauthorized: platform admin required.') {
    super(message);
    this.name = 'PlatformAdminRequiredError';
  }
}

/**
 * For admin server actions. Throws unless the caller is a platform admin —
 * being signed in is not enough, because these actions take a `tenantId`
 * argument and therefore write outside the caller's own tenant.
 */
export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const session = (await auth()) as SessionLike;

  if (!session?.user?.id || !isPlatformAdminSession(session)) {
    throw new PlatformAdminRequiredError();
  }

  return { userId: session.user.id };
}

export type PlatformAdminApiResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * For admin route handlers — the route-handler twin of
 * {@link requirePlatformAdmin}, shaped like {@link requireTenantApi} so the
 * handler returns `result.response` instead of catching a throw.
 *
 * The two refusals are deliberately different answers, not one "denied":
 * an anonymous caller gets **401** because signing in may well grant the
 * request, while a signed-in non-admin gets **403** because it never will.
 * Collapsing them into 401 would send a legitimate tenant user back to the
 * login page for a permission they cannot obtain by logging in again.
 *
 * The admin decision itself is {@link isPlatformAdminSession} — called, not
 * re-derived here, so route handlers, pages and server actions cannot drift
 * apart on what counts as platform staff.
 */
export async function requirePlatformAdminApi(): Promise<PlatformAdminApiResult> {
  const session = (await auth()) as SessionLike;
  const userId = asString(session?.user?.id);

  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Bu işlem için giriş yapmanız gerekiyor.',
          code: 'UNAUTHENTICATED',
        },
        { status: 401 }
      ),
    };
  }

  if (!isPlatformAdminSession(session)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Bu işlem yalnızca platform yöneticileri tarafından yapılabilir.',
          code: 'PLATFORM_ADMIN_REQUIRED',
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId };
}
