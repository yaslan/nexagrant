import { ModuleManifest } from '@/lib/modules/types';

// NG-143 (M18-F1), plan FO-265 option B: HibeLead's client-sales features rebuilt as a NexaGrant
// module, not copied. F1 shipped the data layer; NG-135 (M18-F3) adds the screens.
//
// Not sold: `planTiers` is empty and `addOnSku` is null, and M18 is deliberately NOT in the
// billing catalogue's ALL_MODULE_IDS (that list is the Ultra grant). Patron decision K-581676 = A:
// M18 moves from "Yakında" to `beta`, open only to tenants whose ModuleState is `dev` or `pilot`.
// It is never sold. The rule lives in src/lib/modules/state-machine.ts (`isUnsoldBeta`,
// `isStaffPreviewStatus`) and is applied by `decideModuleAccess`: for an unsold beta module the
// plan check is skipped at DEV/PILOT, and OFF/ON close as MODULE_OFF, never PLAN_UPGRADE_REQUIRED,
// so the module is not listed in `upgradeModules`. Do not add it to billing or `planTiers`.
// Tests: tests/modules/m18-beta-access.test.ts.
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
    { path: 'musteri-hatti/duplicates' },
    { path: 'musteri-hatti/import' },
    { path: 'musteri-hatti/leads' },
    { path: 'musteri-hatti/leads/[id]' },
    { path: 'musteri-hatti/pipeline' },
    { path: 'musteri-hatti/tasks' },
  ],
  // Sidebar entry "Müşteri Satış Hattı". Visibility is still decided by `canAccessStatus`
  // through `listModuleNav`: at DEV/PILOT only the allowed audience sees it.
  nav: [{ labelKey: 'clientPipeline', routeKey: 'clientPipeline', order: 55 }],
  permissions: [
    { id: 'client-pipeline:read', minRole: 'MEMBER' },
    { id: 'client-pipeline:write', minRole: 'WRITER' },
    { id: 'client-pipeline:admin', minRole: 'TENANT_ADMIN' },
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
    'LeadEligibilityReport',
  ],
  isActive: true,
  category: 'tools',
  // G0: a consultancy finds and signs the client before that client's application exists.
  stages: ['G0'],
  statusBadge: 'beta',
  docsUrl: null,
  quota: null,
  addonPurchasable: false,
  trialDays: null,
};
