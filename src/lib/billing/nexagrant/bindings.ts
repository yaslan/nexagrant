/**
 * NG-250 — which product route each NexaGrant plan feature gates, and why the rest gate none.
 * Data, not behaviour: the routes call `ngGateResponse(caller, action, feature)` themselves
 * (route-gate.ts); bindings.test.ts reads each file listed here and fails when the call is
 * missing, when a feature is neither bound nor explained, or when a module-backed route's
 * feature is missing from NG_FEATURE_MODULE (review U5).
 */
import type { Action } from '@/lib/rbac';
import type { ModuleId } from '@/lib/modules/types';
import type { NgFeatureKey } from './features';

export interface NgRouteBinding {
  /**
   * `route`: a route handler, gated by `ngGateResponse` (a 403 with the code).
   * `page`: a server component page, gated by `ngPageGate` (renders the translated refusal).
   */
  kind: 'route' | 'page';
  feature: NgFeatureKey;
  /** The URL path, for the report and the test names. */
  route: string;
  /** The route handler or page file, repo-relative. */
  file: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** The `can()` action the gate asks with. */
  action: Action;
  /** The module the route sits behind, or null; must equal NG_FEATURE_MODULE[feature]. */
  module: ModuleId | null;
  /** Where that module is checked, when not in `file` itself. */
  moduleGuardFile?: string;
}

const PARTNER_SEARCH_GUARD = 'src/modules/m1/server/partner-search/http.ts';
const CORDIS_GUARD = 'src/lib/cordis-api-auth.ts';

export const NG_ROUTE_BINDINGS: readonly NgRouteBinding[] = [
  {
    kind: 'route',
    feature: 'call_search',
    route: '/api/cagrilar',
    file: 'src/app/api/cagrilar/route.ts',
    method: 'GET',
    action: 'search_calls',
    // The calls list has no module switch of its own (M0 call-fit is "Yakında" and cannot open).
    module: null,
  },
  {
    kind: 'route',
    feature: 'partner_search',
    route: '/api/partner-search/announcements',
    file: 'src/app/api/partner-search/announcements/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: PARTNER_SEARCH_GUARD,
  },
  {
    kind: 'route',
    feature: 'partner_search',
    route: '/api/partner-search/announcements/export',
    file: 'src/app/api/partner-search/announcements/export/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: PARTNER_SEARCH_GUARD,
  },
  {
    kind: 'route',
    feature: 'partner_search',
    route: '/api/cordis/organizations',
    file: 'src/app/api/cordis/organizations/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: CORDIS_GUARD,
  },
  {
    kind: 'route',
    feature: 'partner_search',
    route: '/api/cordis/organizations/[id]',
    file: 'src/app/api/cordis/organizations/[id]/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: CORDIS_GUARD,
  },
  {
    kind: 'route',
    feature: 'partner_search',
    route: '/api/organizations/[pic]/announcements',
    file: 'src/app/api/organizations/[pic]/announcements/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: PARTNER_SEARCH_GUARD,
  },
  {
    kind: 'route',
    feature: 'partner_search',
    route: '/api/topics/[identifier]/partner-signal',
    file: 'src/app/api/topics/[identifier]/partner-signal/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: PARTNER_SEARCH_GUARD,
  },
  // Review B1: the pages serve the same CORDIS partner rows as the gated API routes above.
  {
    kind: 'page',
    feature: 'partner_search',
    route: '/[locale]/[workspace]/partners',
    file: 'src/app/[locale]/(app)/[workspace]/partners/page.tsx',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
  },
  {
    kind: 'page',
    feature: 'partner_search',
    route: '/[locale]/[workspace]/partners/[pic]',
    file: 'src/app/[locale]/(app)/[workspace]/partners/[pic]/page.tsx',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
  },
  {
    kind: 'page',
    feature: 'partner_search',
    route: '/[locale]/[workspace]/partners/leaders',
    file: 'src/app/[locale]/(app)/[workspace]/partners/leaders/page.tsx',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
  },
  {
    kind: 'route',
    feature: 'similar_projects',
    route: '/api/cordis/projects',
    file: 'src/app/api/cordis/projects/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: CORDIS_GUARD,
  },
];

/** Features with no product route to gate today, each with the reason. */
export const NG_UNBOUND_FEATURES: Readonly<Partial<Record<NgFeatureKey, string>>> = {
  org_profile: 'Granted on every tier, Ücretsiz Kontrol included; a gate would never refuse.',
  eligibility_check:
    'No route yet: the call-fit check (M0) is "Yakında". The monthly allowance decision is ngLimitAllows (usage.ts), to be called by that route.',
  trl_score: 'No product route scores TRL fit against a call yet (the M7 TRL field is a pilot item attribute, not this feature).',
  apply_decision: 'No product route records an apply / withdraw decision on a call yet.',
  newsletter: 'No newsletter of matching calls is sent yet; no route or job to gate.',
  outreach:
    'Outreach is built in the browser (src/modules/m1/outreach.ts: deep links and mailto, nothing sent by the server); there is no server route to gate. Its page sits behind partner search.',
  seats: 'A counted limit, not a route: assertNgSeatAvailable in the invitation route, behind NG_SEAT_LIMIT_ENFORCED (off until approval).',
  ai_writing_monthly: 'A counted limit, not a route: assertNgAiQuota in generateCompletion (src/lib/llm.ts), every model call.',
};

/**
 * Files under src/app that read partner-search data (CORDIS partner rows, Partner Search
 * announcements) and are NOT bound to the NexaGrant gate, each with the reason. The reverse
 * coverage test in bindings.test.ts fails on a reader that is in neither list (review B1).
 */
const M8_CONSORTIUM =
  "Consortium building (M8, behind moduleGate('M8') + view_proposal): suggests CORDIS partners for one of the tenant's own proposals. Not the partner_search directory, and M8 is behind no NexaGrant plan feature (NG_FEATURE_MODULE). Open question to PM in the NG-250 report.";
const API_KEY_PATH =
  'API key path (/api/v1): no member session to ask. Review O2, follow-up NG-272 (gate with the key tenant; to land with or before open question 1).';

export const NG_DATA_FILE_EXCEPTIONS: Readonly<Record<string, string>> = {
  'src/app/[locale]/(app)/[workspace]/opportunities/[id]/matching/page.tsx': M8_CONSORTIUM,
  'src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx': M8_CONSORTIUM,
  'src/app/[locale]/(app)/[workspace]/settings/profile/page.tsx':
    "The tenant's own organisation profile: one CordisOrganization row by the tenant's own PIC (org_profile, granted on every tier), not a search.",
  'src/app/[locale]/(app)/[workspace]/settings/profile/actions.ts':
    "Saving the tenant's own PIC: checks that one CordisOrganization row exists (org_profile, granted on every tier), not a search.",
  'src/app/[locale]/admin/cordis/actions.ts':
    'Platform admin (CORDIS ingest), not a tenant member: the NexaGrant plan belongs to a tenant and gates its members.',
  'src/app/[locale]/admin/partner-search/actions.ts':
    'Platform admin (Partner Search moderation), not a tenant member: the NexaGrant plan gates tenant members.',
  'src/app/[locale]/admin/tenants/[tenantId]/page.tsx':
    "Platform admin tenant detail: shows a tenant's own PIC organisation to platform staff; no tenant member, no plan.",
  'src/app/api/v1/partners/route.ts': API_KEY_PATH,
  'src/app/api/v1/partners/[pic]/route.ts': API_KEY_PATH,
  'src/app/api/v1/organizations/[pic]/announcements/route.ts': API_KEY_PATH,
  'src/app/api/v1/topics/[identifier]/partner-signal/route.ts': API_KEY_PATH,
  'src/app/api/v1/partner-search/announcements/route.ts': API_KEY_PATH,
  'src/app/api/v1/partners/leaders/route.ts': API_KEY_PATH,
};
