/**
 * Invite-code limits, apart from codes.ts so the client form can use them
 * without pulling in node:crypto. Server validation: validateInviteCodeInput.
 */

/**
 * The smallest limit a new code may have (B-1, leed-fb 29.09: at least 5). The
 * agency knows each code's limit, so a limit under 5 bounds its uses to 0..4.
 * It is 6 because "active" once meant used ≤ maxUses − 1 beside an "exhausted"
 * status; that status is gone (TASK-MUM2RMN3YIBGC), the margin is kept.
 */
export const MIN_MAX_USES = 6;
export const MAX_USES_LIMIT = 10_000;
