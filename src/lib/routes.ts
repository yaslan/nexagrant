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
  | 'settingsPrivacy'
  | 'settingsSso';

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
    case 'settingsSso':
      return isTr ? `/${locale}/${workspace}/ayarlar/sso` : `/${locale}/${workspace}/settings/sso`;
    default:
      return `/${locale}/${workspace}/panel`;
  }
}
