/**
 * Centralized SEO-Friendly Localized Route Resolver for FonBridge
 * Generates canonical, language-aware URLs for both public marketing and in-app workspace pages.
 */

export type PublicRouteKey =
  | 'home'
  | 'openCalls'
  | 'pricing'
  | 'login'
  | 'register'
  | 'terms'
  | 'privacy'
  | 'dpa'
  | 'modules'
  | 'blog'
  | 'blogDetail';

export type WorkspaceRouteKey =
  | 'dashboard'
  | 'calls'
  | 'callDetail'
  | 'pipeline'
  | 'partners'
  | 'partnerDetail'
  | 'partnerLeaders'
  | 'partnerResources'
  | 'reportsPersonDays'
  | 'opportunityConceptNote'
  | 'opportunityEvaluations'
  | 'opportunityMatching'
  | 'opportunityConsortium'
  | 'opportunityBriefs'
  | 'opportunityDocuments'
  | 'opportunityApplication'
  | 'relationships'
  | 'evidence'
  | 'conceptNotes'
  | 'conceptNoteDetail'
  | 'approvals'
  | 'tto'
  | 'notifications'
  | 'settingsProfile'
  | 'settingsModules'
  | 'settingsBilling'
  | 'settingsApiKeys'
  | 'settingsCalendar'
  | 'settingsGates'
  | 'settingsMembers'
  | 'settingsPrivacy';

/**
 * Returns localized public SEO URL
 */
export function getPublicRoute(key: PublicRouteKey, locale: string = 'tr', param?: string): string {
  const isTr = locale === 'tr';
  switch (key) {
    case 'home':
      return `/${locale}`;
    case 'openCalls':
      return isTr ? `/${locale}/acik-cagrilar` : `/${locale}/open-calls`;
    case 'pricing':
      return isTr ? `/${locale}/fiyatlandirma` : `/${locale}/pricing`;
    case 'login':
      return isTr ? `/${locale}/giris` : `/${locale}/login`;
    case 'register':
      return isTr ? `/${locale}/kayit` : `/${locale}/register`;
    case 'terms':
      return isTr ? `/${locale}/kullanim-kosullari` : `/${locale}/terms`;
    case 'privacy':
      return isTr ? `/${locale}/gizlilik-politikasi` : `/${locale}/privacy`;
    case 'dpa':
      return isTr ? `/${locale}/veri-isleme-sozlesmesi` : `/${locale}/dpa`;
    case 'modules':
      return isTr ? `/${locale}/default/ayarlar/moduller` : `/${locale}/default/settings/modules`;
    case 'blog':
      return `/${locale}/blog`;
    case 'blogDetail':
      return `/${locale}/blog/${param}`;
    default:
      return `/${locale}`;
  }
}

/**
 * Returns localized workspace in-app URL
 */
export function getWorkspaceRoute(
  key: WorkspaceRouteKey,
  locale: string = 'tr',
  workspace: string = 'default',
  param?: string
): string {
  const isTr = locale === 'tr';
  switch (key) {
    case 'dashboard':
      return isTr ? `/${locale}/${workspace}/panel` : `/${locale}/${workspace}/dashboard`;
    case 'calls':
      return isTr ? `/${locale}/${workspace}/cagrilar` : `/${locale}/${workspace}/calls`;
    case 'callDetail':
      return isTr ? `/${locale}/${workspace}/cagrilar/${param}` : `/${locale}/${workspace}/calls/${param}`;
    case 'pipeline':
      return isTr ? `/${locale}/${workspace}/firsatlar` : `/${locale}/${workspace}/pipeline`;
    case 'partners':
      return isTr ? `/${locale}/${workspace}/ortaklar` : `/${locale}/${workspace}/partners`;
    case 'partnerDetail':
      return isTr ? `/${locale}/${workspace}/ortaklar/${param}` : `/${locale}/${workspace}/partners/${param}`;
    case 'partnerResources':
      return isTr ? `/${locale}/${workspace}/ortaklar/kaynaklar` : `/${locale}/${workspace}/partners/resources`;
    // The pages below have no Turkish re-export under [workspace] (route-catalog.ts
    // WORKSPACE_ROUTE_ALIASES), so both locales use the one canonical path. `param` is
    // the opportunity id for the `opportunity*` keys.
    case 'partnerLeaders':
      return `/${locale}/${workspace}/partners/leaders`;
    case 'reportsPersonDays':
      return `/${locale}/${workspace}/reports/person-days`;
    case 'opportunityConceptNote':
      return `/${locale}/${workspace}/opportunities/${param}/m2`;
    case 'opportunityEvaluations':
      return `/${locale}/${workspace}/opportunities/${param}/evaluations`;
    case 'opportunityMatching':
      return `/${locale}/${workspace}/opportunities/${param}/matching`;
    case 'opportunityConsortium':
      return `/${locale}/${workspace}/pipeline/${param}/consortium`;
    case 'opportunityBriefs':
      return `/${locale}/${workspace}/opportunities/${param}/briefs`;
    case 'opportunityDocuments':
      return `/${locale}/${workspace}/opportunities/${param}/documents`;
    case 'opportunityApplication':
      return `/${locale}/${workspace}/opportunities/${param}/application`;
    case 'relationships':
      return isTr ? `/${locale}/${workspace}/iliskiler` : `/${locale}/${workspace}/relationships`;
    case 'evidence':
      return isTr ? `/${locale}/${workspace}/kanitlar` : `/${locale}/${workspace}/evidence`;
    case 'conceptNotes':
      return isTr ? `/${locale}/${workspace}/konsept-notlar` : `/${locale}/${workspace}/concept-notes`;
    case 'conceptNoteDetail':
      return isTr ? `/${locale}/${workspace}/konsept-notlar/${param}` : `/${locale}/${workspace}/concept-notes/${param}`;
    case 'approvals':
      return isTr ? `/${locale}/${workspace}/onay-merkezi` : `/${locale}/${workspace}/approvals`;
    case 'tto':
      return isTr ? `/${locale}/${workspace}/tto-hizlandirici` : `/${locale}/${workspace}/tto`;
    case 'notifications':
      return isTr ? `/${locale}/${workspace}/bildirimler` : `/${locale}/${workspace}/notifications`;
    case 'settingsProfile':
      return isTr ? `/${locale}/${workspace}/ayarlar/profil` : `/${locale}/${workspace}/settings/profile`;
    case 'settingsModules':
      return isTr ? `/${locale}/${workspace}/ayarlar/moduller` : `/${locale}/${workspace}/settings/modules`;
    case 'settingsBilling':
      return isTr ? `/${locale}/${workspace}/ayarlar/faturalama` : `/${locale}/${workspace}/settings/billing`;
    case 'settingsApiKeys':
      return isTr ? `/${locale}/${workspace}/ayarlar/api-anahtarlari` : `/${locale}/${workspace}/settings/api-keys`;
    case 'settingsCalendar':
      return isTr ? `/${locale}/${workspace}/ayarlar/takvim` : `/${locale}/${workspace}/settings/calendar`;
    case 'settingsGates':
      return isTr ? `/${locale}/${workspace}/ayarlar/kapilar` : `/${locale}/${workspace}/settings/gates`;
    case 'settingsMembers':
      return isTr ? `/${locale}/${workspace}/ayarlar/uyeler` : `/${locale}/${workspace}/settings/members`;
    case 'settingsPrivacy':
      return isTr ? `/${locale}/${workspace}/ayarlar/gizlilik` : `/${locale}/${workspace}/settings/privacy`;
    default:
      return `/${locale}/${workspace}/panel`;
  }
}

/**
 * Switch the locale of a pathname, mapping it to the localized counterpart.
 * Preserves workspace slug and query string.
 */
export function switchLocalePath(pathname: string, targetLocale: string): string {
  if (!pathname) return `/${targetLocale}`;

  const segments = pathname.split('/').filter(Boolean);
  const currentLocale = segments[0];

  if (!currentLocale || (currentLocale !== 'tr' && currentLocale !== 'en')) {
    return `/${targetLocale}`;
  }

  if (segments.length === 1) {
    return `/${targetLocale}`;
  }

  const workspace = segments[1] || '';

  const publicRoutes: Record<string, PublicRouteKey> = {
    'blog': 'blog', 'acik-cagrilar': 'openCalls', 'open-calls': 'openCalls',
    'fiyatlandirma': 'pricing', 'pricing': 'pricing',
    'giris': 'login', 'login': 'login', 'kayit': 'register', 'register': 'register',
    'kullanim-kosullari': 'terms', 'terms': 'terms',
    'gizlilik-politikasi': 'privacy', 'privacy': 'privacy',
    'veri-isleme-sozlesmesi': 'dpa', 'dpa': 'dpa',
  };

  if (workspace in publicRoutes) {
    const routeKey = publicRoutes[workspace];
    if (routeKey === 'blog' && segments.length > 2) {
      return getPublicRoute('blogDetail', targetLocale, segments[2]);
    }
    if (routeKey) return getPublicRoute(routeKey, targetLocale);
  }

  const workspaceRoutes: Record<string, WorkspaceRouteKey> = {
    'panel': 'dashboard', 'dashboard': 'dashboard',
    'cagrilar': 'calls', 'calls': 'calls',
    'firsatlar': 'pipeline', 'pipeline': 'pipeline',
    'ortaklar': 'partners', 'partners': 'partners',
    'iliskiler': 'relationships', 'relationships': 'relationships',
    'kanitlar': 'evidence', 'evidence': 'evidence',
    'konsept-notlar': 'conceptNotes', 'concept-notes': 'conceptNotes',
    'onay-merkezi': 'approvals', 'approvals': 'approvals',
    'tto-hizlandirici': 'tto', 'tto': 'tto',
    'bildirimler': 'notifications', 'notifications': 'notifications',
    'ayarlar': 'settingsProfile', 'settings': 'settingsProfile',
  };

  const thirdSegment = segments[2];
  if (!thirdSegment || thirdSegment in workspaceRoutes) {
    const baseRoute = thirdSegment || 'panel';
    const routeKey = (workspaceRoutes[baseRoute] || 'dashboard') as WorkspaceRouteKey;

    if (segments.length > 3) {
      const subRoute = segments[3] || '';
      const detailedRoutes: Record<string, WorkspaceRouteKey> = {
        'profil': 'settingsProfile', 'profile': 'settingsProfile',
        'moduller': 'settingsModules', 'modules': 'settingsModules',
        'faturalama': 'settingsBilling', 'billing': 'settingsBilling',
        'api-anahtarlari': 'settingsApiKeys', 'api-keys': 'settingsApiKeys',
        'takvim': 'settingsCalendar', 'calendar': 'settingsCalendar',
        'kapilar': 'settingsGates', 'gates': 'settingsGates',
        'uyeler': 'settingsMembers', 'members': 'settingsMembers',
        'gizlilik': 'settingsPrivacy', 'privacy': 'settingsPrivacy',
      };
      const detailRouteKey = detailedRoutes[subRoute];
      if (detailRouteKey) return getWorkspaceRoute(detailRouteKey, targetLocale, workspace);
    }

    // A fixed page under Partners, not a PIC: `ortaklar/kaynaklar` ↔ `partners/resources`.
    if (routeKey === 'partners' && (segments[3] === 'kaynaklar' || segments[3] === 'resources')) {
      return getWorkspaceRoute('partnerResources', targetLocale, workspace);
    }

    if (segments.length > 3 && ['cagrilar', 'calls', 'ortaklar', 'partners', 'konsept-notlar', 'concept-notes'].includes(baseRoute)) {
      const detailRoutes: Record<string, WorkspaceRouteKey> = {
        'cagrilar': 'callDetail', 'calls': 'callDetail',
        'ortaklar': 'partnerDetail', 'partners': 'partnerDetail',
        'konsept-notlar': 'conceptNoteDetail', 'concept-notes': 'conceptNoteDetail',
      };
      const detailKey = detailRoutes[baseRoute];
      if (detailKey) return getWorkspaceRoute(detailKey, targetLocale, workspace, segments[3]);
    }

    return getWorkspaceRoute(routeKey, targetLocale, workspace);
  }

  return `/${targetLocale}`;
}

/**
 * Where a public call card's "details" button goes.
 *
 * TASK-MUNWZGWA70P16 (İNCELEME-71 B-2): the cards linked /[locale]/calls/<id>,
 * the `[region]` route, and every one 404'd. Owner decision (30.09): they go to
 * the signed-in call detail.
 *
 * TASK-MUO12A7NHANOT (İNCELEME-76 Y-1): that detail sits under a workspace the
 * public page does not know, and the fixed `default` segment put pipeline
 * writes in the wrong workspace. The card now links a workspace-free route that
 * the server resolves per session (src/app/[locale]/(public)/calls/topic/[id]/route.ts),
 * so the link is the same for every visitor and the page needs no session.
 */
export function publicCallDetailHref(locale: string, identifier: string): string {
  return `/${locale}/calls/topic/${encodeURIComponent(identifier)}`;
}
