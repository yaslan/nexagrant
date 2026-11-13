// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { ModuleManifest } from '@/lib/modules/types';

// NG-143 (M18-F1), plan FO-265 option B: HibeLead's client-sales features rebuilt as a FonBridge
// module, not copied. F1 ships the data layer and this manifest only: no routes and no nav yet
// (the screens are F3), so the module has nothing to open.
//
// Not sold yet: `planTiers` is empty and `addOnSku` is null (price decision K2 pending), and M18
// is deliberately NOT in the billing catalogue's ALL_MODULE_IDS — that list is the Ultra grant,
// and adding it there would sell the module.
//
// `statusBadge: 'soon'` ("Yakında", FO-40), not 'beta': `decideModuleAccess` checks the plan
// before the state, so with no plan behind it a 'beta' M18 would sit in every paying tenant's
// `upgradeModules` with a "Planı Yükselt" link that no plan answers, and a DEV row would still
// open it to nobody. 'soon' is the existing "not built, not sold" state. Flip it to 'beta' in
// F3 together with the entitlement answer (K2, or a staff path past the plan check for DEV).
//
// "Client pipeline" is a consultancy's sales line over its own clients (Deal, DealStage). It is
// NOT the applicant pipeline (M5 Opportunity G0–G4) and ServiceQuote is not Proposal (M5).
// Scope is the tenant, not the workspace (lead assumption K4, docs/DATA_MODEL.md §M18).
// Role mapping lives in src/lib/rbac.ts (`client_pipeline_*`), kept equal to minRole by
// tests/modules/m18-manifest.test.ts.
export const m18Manifest: ModuleManifest = {
  id: 'M18',
  key: 'client-pipeline',
  name: 'Client Pipeline',
  description:
    "A consultancy's sales pipeline over its own clients: client organisations, deals, service packages and quotes.",
  version: '0.1',
  requires: [],
  recommends: ['M9', 'M16'],
  planTiers: [],
  addOnSku: null,
  routes: [
    { path: 'musteri-hatti' },
    { path: 'musteri-hatti/leads' },
    { path: 'musteri-hatti/leads/[id]' },
    { path: 'musteri-hatti/pipeline' },
    { path: 'musteri-hatti/tasks' },
  ],
  nav: [],
  permissions: [
    { id: 'client-pipeline:read', minRole: Role.MEMBER },
    { id: 'client-pipeline:write', minRole: Role.WRITER },
    { id: 'client-pipeline:admin', minRole: Role.TENANT_ADMIN },
  ],
  tables: [
    'LeadOrganization',
    'LeadContact',
    'LeadMatch',
    'Deal',
    'DealActivity',
    'DealTask',
    'ServicePackage',
    'ServiceQuote',
    'FunderRule',
  ],
  isActive: true,
  category: 'tools',
  // G0: a consultancy finds and signs the client before that client's application exists.
  stages: ['G0'],
  statusBadge: 'soon',
  docsUrl: null,
  quota: null,
  addonPurchasable: false,
  trialDays: null,
};
