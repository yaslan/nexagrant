import type { Role } from '@prisma/client';

import { EVIDENCE_READ_ACTION } from '@/lib/evidence-access';
import { can, type Action } from '@/lib/rbac';

/**
 * Which `can()` action each sidebar entry stands behind (NG-4). The action is the
 * one the entry's own screen already reads: the dashboard's `evaluate_gates`,
 * `view_proposal` for evidence (`EVIDENCE_READ_ACTION`) and M17 (`m17/server/gate`),
 * `view_partner_search` for M1, `request_dual_approval` for the approval actions.
 *
 * An entry not listed here has no permission to read: `calls` (public EU data),
 * `settings` (everyone's own profile). `members` already takes `canManageUsers`.
 *
 * Navigation only, the same as the module list: a hidden link is not a closed door.
 */
export const NAV_ITEM_ACTION: Readonly<Record<string, Action>> = {
  dashboard: 'evaluate_gates',
  pipeline: 'view_proposal',
  conceptNotes: 'view_proposal',
  interregReview: 'view_proposal',
  evidence: EVIDENCE_READ_ACTION,
  relationships: 'view_proposal',
  tto: 'view_proposal',
  partners: 'view_partner_search',
  partnerResources: 'view_partner_search',
  apiKeys: 'view_partner_search',
  approvals: 'request_dual_approval',
};

/** The entries this role is not offered. `null` (no known role) holds no action. */
export function hiddenNavKeysFor(role: Role | null): string[] {
  return Object.entries(NAV_ITEM_ACTION)
    .filter(([, action]) => !can(role, action))
    .map(([key]) => key);
}
