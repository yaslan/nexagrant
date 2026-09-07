/**
 * Catalog of every page that really exists under
 * `src/app/[locale]/(app)/[workspace]/`.
 *
 * Manifest routes are validated against this catalog, so a manifest can never
 * claim a page that does not exist. The catalog itself is kept honest by
 * `tests/modules/route-catalog.test.ts`, which walks the app directory and
 * fails when the two drift apart.
 *
 * Turkish pages under `[workspace]` are thin re-exports of the English page
 * (e.g. `ortaklar/page.tsx` re-exports `partners/page.tsx`). They are recorded
 * as aliases, not as separate routes, so route ownership stays unambiguous.
 */

/** Canonical (English) workspace page paths, relative to `/[locale]/[workspace]/`. */
export const WORKSPACE_ROUTE_CATALOG = [
  'approvals',
  'ayarlar',
  'bildirimler',
  'calls',
  'calls/[id]',
  'concept-notes',
  'concept-notes/[id]',
  'dashboard',
  'evidence',
  'marketplace',
  'notifications',
  'opportunities/[id]/application',
  'opportunities/[id]/briefs',
  'opportunities/[id]/documents',
  'opportunities/[id]/evaluations',
  'opportunities/[id]/evaluations/panel',
  'opportunities/[id]/m2',
  'opportunities/[id]/matching',
  'partners',
  'partners/[pic]',
  'partners/leaders',
  'pipeline',
  'pipeline/[id]',
  'pipeline/[id]/consortium',
  'relationships',
  'relationships/[id]',
  'reports/person-days',
  'settings/api-keys',
  'settings/billing',
  'settings/calendar',
  'settings/gates',
  'settings/members',
  'settings/modules',
  'settings/privacy',
  'settings/profile',
  'tto',
] as const;

export type WorkspaceRoutePath = (typeof WORKSPACE_ROUTE_CATALOG)[number];

/** Turkish page path → the canonical page it re-exports. */
export const WORKSPACE_ROUTE_ALIASES: Record<string, WorkspaceRoutePath> = {
  'ayarlar/faturalama': 'settings/billing',
  'ayarlar/kapilar': 'settings/gates',
  'ayarlar/moduller': 'settings/modules',
  'ayarlar/profil': 'settings/profile',
  'ayarlar/takvim': 'settings/calendar',
  'ayarlar/uyeler': 'settings/members',
  cagrilar: 'calls',
  'cagrilar/[id]': 'calls/[id]',
  firsatlar: 'pipeline',
  'firsatlar/[id]': 'pipeline/[id]',
  iliskiler: 'relationships',
  kanitlar: 'evidence',
  'konsept-notlar': 'concept-notes',
  'onay-merkezi': 'approvals',
  ortaklar: 'partners',
  panel: 'dashboard',
  'pazar-yeri': 'marketplace',
  'tto-hizlandirici': 'tto',
};

const CATALOG_SET: ReadonlySet<string> = new Set(WORKSPACE_ROUTE_CATALOG);

export function isKnownWorkspaceRoute(path: string): path is WorkspaceRoutePath {
  return CATALOG_SET.has(path);
}

/** Maps a Turkish alias onto its canonical page; returns other paths unchanged. */
export function canonicalWorkspaceRoute(path: string): string {
  return WORKSPACE_ROUTE_ALIASES[path] ?? path;
}
