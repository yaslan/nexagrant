import { withTenant, type TenantTx } from '@/lib/db';
import { tenantScopeOf, type TenantScope } from '@/lib/tenant';
import { errorMessage } from '@/lib/errors';

/**
 * The workspaces a session may switch to.
 *
 * TASK-MTRNQHC3IV2BE. The user menu's workspace switcher held two names written
 * into the component — "Demo SME Consultancy" (`demo-sme`) and "Horizon Research
 * Lab" (`horizon-lab`). The switcher is mounted in the app shell, so every
 * tenant was shown two organisations that are not theirs and links into a URL
 * space their membership does not cover. Nothing was ever queried.
 *
 * This is the query that should have been there. It answers from `Workspace`
 * rows, through `withTenant` so the RLS policy applies at the database
 * (CLAUDE.md §1), and it returns an empty list rather than inventing an entry
 * when the session has no tenant or the lookup fails — the caller renders an
 * explicit "no workspace" line for that.
 */
export interface SessionWorkspace {
  /** `Workspace.slug` — the `[workspace]` URL segment. */
  slug: string;
  /** `Workspace.name`, as the tenant stored it. */
  name: string;
}

type SessionLike = Parameters<typeof tenantScopeOf>[0];

/**
 * Which workspaces of the scoped tenant this membership covers.
 *
 * `Membership.workspaceIds` is documented in prisma/schema.prisma as "empty =
 * all workspaces of tenant", so an empty array widens to the whole tenant and a
 * non-empty one narrows to exactly those ids. Pure, so the branch is unit
 * testable without a database.
 */
export function workspaceIdFilter(
  workspaceIds: string[]
): { id: { in: string[] } } | Record<string, never> {
  return workspaceIds.length > 0 ? { id: { in: workspaceIds } } : {};
}

/** Reads the switcher list for an already-resolved scope. */
export async function listWorkspacesForScope(scope: TenantScope): Promise<SessionWorkspace[]> {
  try {
    return await withTenant(scope.tenantId, (tx) =>
      tx.workspace.findMany({
        where: {
          tenantId: scope.tenantId,
          deletedAt: null,
          ...workspaceIdFilter(scope.workspaceIds),
        },
        select: { slug: true, name: true },
        orderBy: { name: 'asc' },
      })
    );
  } catch (e) {
    // A database outage must not put invented workspaces in the shell, and must
    // not take the shell down either. The switcher shows its empty state.
    console.warn(`[listSessionWorkspaces] lookup failed, switcher stays empty: ${errorMessage(e)}`);
    return [];
  }
}

/**
 * Switcher list for a session. A session with no tenant scope has no workspace
 * to offer, and gets an empty list — never a placeholder tenant.
 */
export async function listSessionWorkspaces(session: SessionLike): Promise<SessionWorkspace[]> {
  const scope = tenantScopeOf(session);
  if (!scope) return [];
  return listWorkspacesForScope(scope);
}

/**
 * The URL segment the app uses when it does not know the user's workspace
 * (AuthCard's default landing, old /calls card links). It is an alias, not a
 * slug a membership can be checked against.
 */
export const WORKSPACE_ALIAS = 'default';

export interface ScopedWorkspace {
  id: string;
  slug: string;
}

/**
 * The live workspace `slug` names, if this membership may use it — the server
 * side of every "which workspace does this write go to" decision
 * (TASK-MUO12A7NHANOT, İNCELEME-76 Y-1).
 *
 * The URL's `[workspace]` segment is client input. `createOpportunity` used to
 * treat `default` as "the tenant's first workspace" with no `deletedAt` and no
 * membership filter, so a user restricted to workspace B wrote into A, and a
 * tenant whose `default` workspace was soft-deleted wrote into the deleted one.
 *
 * - a slug is matched only among the scope's own, non-deleted workspaces;
 * - `null`, or the `default` alias when no permitted workspace is literally
 *   called that, means the oldest permitted workspace (deterministic);
 * - anything else — unknown, deleted, outside the membership — is `null`.
 *   Never a fallback: a caller that falls back silently writes somewhere the
 *   user did not pick.
 *
 * Takes the transaction so a write can prove and use the workspace in one scope.
 */
export async function findScopedWorkspace(
  tx: TenantTx,
  scope: TenantScope,
  slug: string | null
): Promise<ScopedWorkspace | null> {
  const where = { tenantId: scope.tenantId, deletedAt: null, ...workspaceIdFilter(scope.workspaceIds) };
  const select = { id: true, slug: true } as const;
  if (slug) {
    const exact = await tx.workspace.findFirst({ where: { ...where, slug }, select });
    if (exact || slug !== WORKSPACE_ALIAS) return exact;
  }
  return tx.workspace.findFirst({ where, select, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

/** `findScopedWorkspace` in its own tenant scope, for pages and route handlers. */
export async function resolveScopedWorkspace(
  scope: TenantScope,
  slug: string | null
): Promise<ScopedWorkspace | null> {
  return withTenant(scope.tenantId, (tx) => findScopedWorkspace(tx, scope, slug));
}
