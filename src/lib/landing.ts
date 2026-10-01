import type { Role } from '@prisma/client';

import { can } from '@/lib/rbac';
import { getWorkspaceRoute } from '@/lib/routes';

/**
 * The first screen a signed-in person should see, by role (TASK-MUPUGXME9DP6K,
 * QA Y-1). The KPI dashboard needs `evaluate_gates`, so MEMBER and WRITER used
 * to land on "Erişim Reddedildi" straight after accepting an invitation. The
 * gate on the dashboard is untouched; the landing moves to a page the role can
 * open:
 *   - evaluate_gates  → dashboard
 *   - view_proposal   → pipeline board
 *   - anyone else     → notifications (no role gate)
 */
export function landingPathFor(role: Role | null | undefined, locale: string, workspace = 'default'): string {
  if (can(role, 'evaluate_gates')) return getWorkspaceRoute('dashboard', locale, workspace);
  if (can(role, 'view_proposal')) return getWorkspaceRoute('pipeline', locale, workspace);
  return getWorkspaceRoute('notifications', locale, workspace);
}
