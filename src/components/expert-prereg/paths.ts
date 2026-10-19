/**
 * FO-20 — the public expert pre-registration pages. Turkish and English paths
 * differ (`/tr/uzman`, `/en/experts`), like kayit/register; both folders exist
 * under [locale], so a link always uses the locale's own spelling.
 */
export function expertPreregPath(locale: string): string {
  return locale === 'en' ? '/en/experts' : `/${locale}/uzman`;
}
