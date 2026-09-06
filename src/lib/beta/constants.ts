/**
 * E11 beta programme constants.
 *
 * Kept in one place so the invite mail, the onboarding CLI and the beta guide
 * cannot drift apart. Anything an operator may need to change per environment is
 * read from the environment with a documented default.
 *
 * NOTE — two programme designs are in play for E11.1 and the choice is not ours:
 *   • the E11 brief asks for every module in `pilot`, Mondays 15:00 Europe/Brussels;
 *   • docs/BETA_GUIDE.md scopes the beta to the MVP modules, Thursdays 14:00
 *     Europe/Istanbul.
 * Both are therefore configurable rather than hard-coded — see MODULE_SETS below
 * and the --modules / --day / --time / --tz flags on scripts/beta-onboarding.ts.
 */

import type { ModuleId } from '../modules/types';

/**
 * Module grants, listed in dependency-safe order (every `requires[]` entry comes
 * first). `assertDependencyOrder` in the CLI enforces that this stays true.
 */
export const BETA_MODULE_SETS = {
  /** E11 brief: the whole catalogue in `pilot`. */
  all: ['M1', 'M2', 'M3', 'M5', 'M4', 'M8', 'M11', 'M6', 'M7', 'M9', 'M10'],
  /** docs/BETA_GUIDE.md: MVP surface only; M6/M7/M9/M10/M11 stay off. */
  mvp: ['M1', 'M2', 'M3', 'M5', 'M4', 'M8'],
} as const satisfies Record<string, readonly ModuleId[]>;

export type BetaModuleSet = keyof typeof BETA_MODULE_SETS;

/** Plan the beta tenants are put on so no module is blocked by a plan tier. */
export const BETA_PLAN_ID = 'enterprise';

/** Number of weekly check-ins across the beta (S8 → S16). */
export const BETA_CHECKIN_WEEKS = 8;

/** Default check-in slot — the E11 brief's Monday 15:00 Brussels. */
export const BETA_CHECKIN_TZ = 'Europe/Brussels';
/** ISO weekday, 1 = Monday … 7 = Sunday. */
export const BETA_CHECKIN_WEEKDAY = 1;
export const BETA_CHECKIN_HOUR = 15;
export const BETA_CHECKIN_MINUTE = 0;
export const BETA_CHECKIN_DURATION_MIN = 45;

export const BETA_SUPPORT_EMAIL = process.env.BETA_SUPPORT_EMAIL ?? 'support@fabrika.dev';
export const BETA_FEEDBACK_EMAIL = process.env.BETA_FEEDBACK_EMAIL ?? 'feedback@fabrika.dev';
export const BETA_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.fabrika.dev';
export const BETA_MEETING_URL = process.env.BETA_MEETING_URL ?? 'https://meet.google.com/fabrika-beta-checkin';
