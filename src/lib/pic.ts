import { z } from 'zod';

/**
 * The EU Participant Identification Code a tenant enters for itself (FO-383).
 *
 * Nine digits: every one of the 35,625 distinct organisation ids in the CORDIS Horizon Europe
 * dump measured for FO-383 has exactly nine, none with a leading zero. Spaces and dashes are
 * what a copy from the Participant Register or a PDF brings along, so they are dropped first.
 * `Tenant.pic` is compared to `CordisParticipation.organisationId` as text, so a stored value
 * has to be the bare digits or the organisation silently loses its history.
 */
export const TenantPicSchema = z
  .string()
  .transform((raw) => raw.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{9}$/));

/** Empty input is a valid answer: it clears the stored PIC. */
export const TenantPicInputSchema = z
  .string()
  .max(40)
  .transform((raw) => raw.trim())
  .pipe(z.union([z.literal(''), TenantPicSchema]));

/**
 * How many times one user may ask, in an hour, whether a PIC can be taken (FO-386). The answer says
 * whether another account holds that PIC, and the CORDIS list of PICs is public, so this is what
 * stands between the form and a list of who our customers are. Saving a listed PIC takes two asks,
 * the question and the confirmation, so this leaves ten honest attempts an hour.
 */
export const PIC_LOOKUPS_PER_HOUR = 20;

/**
 * FO-389. The same question for an account that has nothing behind it: no agency invitation, no
 * pilot, no paid plan. Such an account costs an attacker nothing to open, so it gets the least a
 * real user needs. Saving a listed PIC takes two asks (the question and the confirmation), so
 * three leaves one honest attempt and a retry an hour.
 */
export const PIC_LOOKUPS_PER_HOUR_UNSOLICITED = 3;

/**
 * FO-389. What ALL such accounts together may ask in one UTC day. Per-user limits are beaten by
 * opening accounts; this total is not. At 2,000 a day a full pass over the 35,625 CORDIS
 * organisations takes about 18 days instead of one. Invited, pilot and paid tenants do not spend it,
 * so filling it locks out nobody who is a customer.
 */
export const PIC_UNSOLICITED_LOOKUPS_PER_DAY = 2000;

/**
 * FO-389. How many `tenant.pic.refused` audit rows of one reason (`picTaken`, `rateLimited`) one tenant
 * may add in a UTC day. The audit table grows with the number of accounts, not only with the number
 * of asks, so each tenant's share is capped; the asks past it are still refused, they just stop
 * leaving a row. 50 is above what one honest owner meets (a typo or two) and below the 480 a single
 * user could add under the hourly limit alone.
 */
export const PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY = 50;
