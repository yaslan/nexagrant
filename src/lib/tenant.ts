import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPublicRoute } from '@/lib/routes';

/**
 * Tenant resolution — the single place a request's tenant is decided.
 *
 * CLAUDE.md §1 requires every business query to be tenant-scoped. Before this
 * module the codebase resolved the tenant with inline fallbacks
 * (`(session as any)?.tenantId || 'demo-tenant-1'`, or `prisma.tenant.findFirst()`).
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
      user?: { id?: string | null; email?: string | null } | null;
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
  readonly code = 'TENANT_SCOPE_REQUIRED';

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

/** Convenience for server actions that do their own `auth()` call. */
export async function requireTenantAction(): Promise<TenantScope> {
  return assertTenant((await auth()) as SessionLike);
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
export async function requireTenantApi(): Promise<TenantApiResult> {
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

  return { ok: true, scope };
}
