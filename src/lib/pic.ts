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
