/**
 * FO-20 — the public expert pre-registration pages. Turkish and English paths
 * differ (`/tr/uzman`, `/en/experts`), like kayit/register; both folders exist
 * under [locale], so a link always uses the locale's own spelling.
 */
export function expertPreregPath(locale: string): string {
  return locale === 'en' ? '/en/experts' : `/${locale}/uzman`;
}

/** Where GET /api/expert-preregistration/verify lands (FO-19 contract). */
export function expertPreregVerifiedPath(locale: string): string {
  return locale === 'en' ? '/en/experts/verified' : `/${locale}/uzman/dogrulandi`;
}

/** `?n=` is a Founding Expert number 1..100; anything else (incl. `yok`) means none. */
export function parseFounderNumber(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 100 ? n : null;
}
