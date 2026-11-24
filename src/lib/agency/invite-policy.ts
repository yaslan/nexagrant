/**
 * Agency invite codes — the numbers a NEW code gets (FO-392).
 *
 * The one place they live. The create action, the panel and the tests read them
 * from here; none of them writes its own copy.
 *
 * Why there is a limit at all: a code is a bearer secret, and everyone who
 * registers with it is exempt from the PIC lookup limit and the shared daily
 * budget. Before FO-392 one code took 300 registrations in a measurement run
 * (0 refused). The limit caps what a leaked code can open.
 *
 * Why the limit is a hidden, per-code number (K-577268, option A): a code that
 * stops at a fixed N tells the agency "this code used exactly N". Joined with the
 * funnel's rounded registration total (funnel.attack.test.ts) that read another
 * code's last 1..4 uses back in about 4-5 % of the tables of a cohort that had
 * really filled a code (crw-fb, FO-392-crw-fb.md B-1). So a new code's real limit
 * is {@link INVITE_CODE_MIN_USE_LIMIT} + a uniformly random 0..{@link INVITE_CODE_USE_LIMIT_SPREAD},
 * drawn once when the code is made. The real number is stored (the database
 * enforces it) and never leaves the server; the panel says only "at least
 * {@link INVITE_CODE_MIN_USE_LIMIT}". Before a code is full, a limit that varies
 * over 25 values hides its count behind a window wider than the 1..4 the funnel masks.
 *
 * What the spread does NOT do (crw-fb FO-392-crw-fb-2.md B-3; FO-398): it protects a code only until
 * it is full, and the limit is not what makes the attack possible. An agency that makes a fresh code and
 * registers on it itself knows that code's uses EXACTLY: at the flip it learns the limit (cost 500..524
 * records), but it does not even need the flip - registering 5-30 organisations of its own on a fresh
 * code gives the same knowledge. With the filled codes exact, another code's uses are read off the
 * funnel's rounded grand total to within the rounding step. FO-398 measured it (funnel.attack.test.ts,
 * 900 tables, several provinces, no deletions): at the old step of 5 the 500-record way read a hidden
 * 1..4 in 74 tables and the 5-30-record way in 60; at the shipped step of 10 (K-577804) 6 and 4. No
 * setting of this file moves those numbers. Do not claim in code, docs or UI that an agency "cannot
 * learn" the limit.
 *
 * Where the numbers come from: the 500 is the autopilot default of K-577141
 * (no owner answer); the 0..24 spread is the owner's decision K-577268. Change
 * them here and in the pinning test (invite-policy.test.ts), nowhere else.
 * Existing codes (useLimit NULL) are not touched: they stay unlimited.
 */

/** Uses every new code can reach at least; the number the panel names. */
export const INVITE_CODE_MIN_USE_LIMIT = 500;

/** A new code's real limit is MIN + a random integer in [0, SPREAD]. */
export const INVITE_CODE_USE_LIMIT_SPREAD = 24;

/** The highest real limit a new code can get. Never shown. */
export const INVITE_CODE_MAX_USE_LIMIT = INVITE_CODE_MIN_USE_LIMIT + INVITE_CODE_USE_LIMIT_SPREAD;

/** Days a new code stays valid when the agency does not pick a day (the cap is MAX_VALIDITY_DAYS). */
export const INVITE_CODE_DEFAULT_VALIDITY_DAYS = 90;

/**
 * A uniform integer in [0, n) from the platform CSPRNG (Web Crypto, present in
 * Node and in the browser, so this file stays importable by the client panel).
 * Rejection sampling: no modulo bias.
 */
function secureInt(n: number): number {
  const range = 0x1_0000_0000; // 2^32
  const limit = range - (range % n);
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}

/**
 * The real use limit for ONE new code. Call once per code, at creation. The result
 * is written to `AgencyInviteCode.useLimit` and must not be sent to a client,
 * logged to a tenant-visible place, or returned by any action.
 */
export function newInviteCodeUseLimit(): number {
  return INVITE_CODE_MIN_USE_LIMIT + secureInt(INVITE_CODE_USE_LIMIT_SPREAD + 1);
}
