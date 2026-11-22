import type { Action } from '@/lib/rbac';

/**
 * NG-11 — who may see the NexaGrant plan and trial (Settings → Plan and trial).
 *
 * Decision K-584303 = A: TENANT_OWNER only, the same door as Settings → Billing
 * (`manage_billing`, src/lib/rbac.ts). This is the one place that names the
 * permission: the page door, the server action and the user-menu link all read it
 * from here. To change the decision, change this line and nothing else.
 */
export const NG_PLAN_VIEW_ACTION: Action = 'manage_billing';
