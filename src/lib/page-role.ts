import { forbidden } from 'next/navigation';

import { asRole, can, type Action } from '@/lib/rbac';
import { requireTenantPage, type TenantScope } from '@/lib/tenant';

/**
 * `requireTenantPage` plus the role door of a tenant page (NG-64).
 *
 * The sidebar hides an entry the role lacks the permission for (NG-4,
 * src/lib/roles/nav-permissions.ts), but a hidden link is not a closed door: a
 * GUEST_PARTNER typing `/tr/<ws>/firsatlar` was shown the tenant's opportunities.
 * Each page that reads tenant data now names the `can()` action its screen
 * stands behind, and a role without it gets the 403 screen
 * (src/app/forbidden.tsx) before any tenant read runs.
 *
 * The action is always one the permission table already has (src/lib/rbac.ts);
 * this helper only asks it. A role outside the enum grants nothing, as in `can`.
 */
export async function requireTenantPageRole(locale: string, action: Action): Promise<TenantScope> {
  const scope = await requireTenantPage(locale);
  if (!can(asRole(scope.role), action)) forbidden();
  return scope;
}
