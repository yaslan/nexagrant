import { withTenant } from '@/lib/db';
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
