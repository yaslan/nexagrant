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
  feature: NgFeatureKey;
  /** The URL path, for the report and the test names. */
  route: string;
  /** The route handler file, repo-relative. */
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
    feature: 'call_search',
    route: '/api/cagrilar',
    file: 'src/app/api/cagrilar/route.ts',
    method: 'GET',
    action: 'search_calls',
    // The calls list has no module switch of its own (M0 call-fit is "Yakında" and cannot open).
    module: null,
  },
  {
    feature: 'partner_search',
    route: '/api/partner-search/announcements',
    file: 'src/app/api/partner-search/announcements/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: PARTNER_SEARCH_GUARD,
  },
  {
    feature: 'partner_search',
    route: '/api/partner-search/announcements/export',
    file: 'src/app/api/partner-search/announcements/export/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: PARTNER_SEARCH_GUARD,
  },
  {
    feature: 'partner_search',
    route: '/api/cordis/organizations',
    file: 'src/app/api/cordis/organizations/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: CORDIS_GUARD,
  },
  {
    feature: 'partner_search',
    route: '/api/cordis/organizations/[id]',
    file: 'src/app/api/cordis/organizations/[id]/route.ts',
    method: 'GET',
    action: 'view_partner_search',
    module: 'M1',
    moduleGuardFile: CORDIS_GUARD,
  },
  {
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
