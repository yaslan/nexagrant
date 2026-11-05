/**
 * Agency invite codes — the defaults a NEW code gets (FO-392).
 *
 * The one place the numbers live. The create action, the panel's default date and
 * the tests read them from here; none of them writes its own copy.
 *
 * Why there is a limit at all: a code is a bearer secret, and everyone who
 * registers with it is exempt from the PIC lookup limit and the shared daily
 * budget. Before FO-392 one code took 300 registrations in a measurement run
 * (0 refused). The limit caps what a leaked code can open.
 *
 * Why it is large: a limit that is small enough to be useful as a gate is also
 * small enough to read back through the funnel's rounded totals (leed-fb
 * TASK-MUM4WVYLSH9IT, funnel.attack.test.ts). 500 lifetime uses is the owner's
 * choice in K-577141 (default A); change it here, nowhere else. Existing codes
 * (useLimit NULL) are not touched: they stay unlimited.
 */

/** Uses a new code may reach over its life. */
export const INVITE_CODE_DEFAULT_USE_LIMIT = 500;

/** Days a new code stays valid when the agency does not pick a day (the cap is MAX_VALIDITY_DAYS). */
export const INVITE_CODE_DEFAULT_VALIDITY_DAYS = 90;
