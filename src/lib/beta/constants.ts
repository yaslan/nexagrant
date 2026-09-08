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

/**
 * Plan the beta tenants are put on so no module is blocked by a plan tier.
 * Was `enterprise`; that plan was retired with the EUR ladder
 * (TASK-MTR6QIE05ZKNH) and `ultra` is the tier that now grants all 11 modules.
 */
export const BETA_PLAN_ID = 'ultra';

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

/**
 * E11.3 ESR calibration survey deadline (TASK-MTQ2KL3JO4MK2).
 *
 * Pinned, not computed. `scripts/esr-calibration.ts` regenerates
 * docs/CORDIS-SAMPLE-CALIBRATION.md on every run, and a "two weeks from today"
 * default silently moved the stated deadline each time: the survey sheets under
 * docs/BETA_DATA/generated/esr-calibration/survey/ say 2026-09-21 while a re-run
 * on 2026-09-08 wrote 2026-09-22 into the report. A date partners are told is a
 * commitment, so it lives here and moves only when a human edits it. Override for
 * a one-off run with `--deadline=YYYY-MM-DD`.
 */
export const ESR_SURVEY_DEADLINE = '2026-09-21';
