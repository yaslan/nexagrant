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
 * What the spread does NOT do (crw-fb FO-392-crw-fb-2.md B-3, patron decision A): it
 * protects a code only until it is full. The status turns "Limit reached" (panel)
 * and the form refuses at exactly the limit, so an agency that makes a fresh code
 * and registers on it itself until the flip learns its limit EXACTLY. The price is
 * about that many real records (500..524, visible on the platform). With the
 * filled codes exact, the window for another code's uses shrinks to the funnel's
 * rounding step (+-2), and in the multi-province, no-deletion case a hidden 1..4
 * is read back in 57-84 of 900 simulated tables, about 8 % on average and above
 * the ~5.8 % a FIXED 500 leaks (funnel.attack.test.ts, "self-burn KNOWN RESIDUAL"; the
 * rate moves between runs because the limits are drawn at random). The owner accepted this and kept the behaviour; the notice
 * addendum says so and the lawyer is asked (HUKUK-SORULARI-2026-09.md). Do not
 * claim in code, docs or UI that an agency "cannot learn" the limit.
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
