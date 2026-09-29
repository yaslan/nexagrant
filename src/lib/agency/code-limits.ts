/**
 * Invite-code limits, apart from codes.ts so the client form can use them
 * without pulling in node:crypto. Server validation: validateInviteCodeInput.
 */

/**
 * The smallest limit a new code may have (B-1, leed-fb 29.09: at least 5). It is
 * 6: a code that can read "exhausted" and reads "active" has used ≤ maxUses − 1,
 * and that must not be "under 5" either — two 5-use codes beside a funnel of 5
 * would be 1..4 each (funnel.attack.test.ts).
 */
export const MIN_MAX_USES = 6;
export const MAX_USES_LIMIT = 10_000;
