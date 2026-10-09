/**
 * Tenant.province (TASK-MULV3JXS1AW5X) — which values may be stored, and when.
 *
 * The value is a province NAME from TR_PROVINCES, spelled exactly as there: the
 * dictionary the scorecard (`?il=`) and the public-sector catalogue
 * (`turkeyRegions`) already use. The database holds the same list as a CHECK
 * (prisma/migrations/add-tenant-province.sql); province.test.ts keeps them equal.
 *
 * Server-free on purpose: the registration form imports it.
 */
import type { TrProvince } from './readiness/provinces';
import { parseProvince } from './readiness/share';

/** A province is asked for, and kept, only for an organisation in Türkiye. */
export function provinceAppliesTo(country: string | null | undefined): boolean {
  return country === 'TR';
}

/**
 * Anything from a form, a cookie or a URL in; a stored value or null out.
 * An unknown or misspelt name is null, not an error: the field is optional, so
 * a bad value must not stop a registration.
 */
export function toTenantProvince(raw: unknown, country: string | null | undefined = 'TR'): TrProvince | null {
  if (!provinceAppliesTo(country) || typeof raw !== 'string') return null;
  return parseProvince(raw);
}
