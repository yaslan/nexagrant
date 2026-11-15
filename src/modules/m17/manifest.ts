import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

// FO-186 (TASK-MVRIV9LCDHYKO), owner-approved plan FO-185. The plan called it
// "M15", but M15 is Post-Award Management (FO-40), so it takes the next free id.
// F1 shipped the data model and the upload/extract API. F2 (FO-188) adds the LLM
// run (POST …/analyses/[id]/evaluate, `M17:evaluate` in `AI_ACTION_CREDITS`, price
// pending the owner's approval). F2 (FO-189) ships the two-step upload, check and
// report screen, so the module opens as `beta`: a sidebar entry, `moduleIds` on Pro
// and Ultra in the catalogue, and the gate decides by plan and ModuleState like any
// other module. Opening it = statusBadge 'beta' + a route/nav entry + `moduleIds` in
// the catalogue.
// The grid it assesses against is data, not code (FO-187): InterregRubric, seeded
// from prisma/seed-data/interreg-rubrics.ts; the FO-185 7-criterion draft is void.
export const m17Manifest: ModuleManifest = {
  id: 'M17',
  key: 'interreg-review',
  name: 'Interreg Pre-Assessment',
  description:
    'Internal pre-assessment of a project file against an Interreg call guide — never presented as an official score.',
  version: '1.0',
  requires: [],
  recommends: [],
  // "Pro and above" (FO-185); declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M17'),
  addOnSku: null,
  routes: [{ path: 'modules/interreg-review' }],
  nav: [{ labelKey: 'interregReview', routeKey: 'interregReview', order: 45 }],
  permissions: [
    { id: 'interreg-review:read', minRole: 'MEMBER' },
    { id: 'interreg-review:write', minRole: 'WRITER' },
  ],
  // Its own tenant tables; the rubric tables (InterregRubric*) are platform reference data.
  tables: ['InterregAnalysis', 'InterregAnalysisResult', 'InterregCriterionMark'],
  isActive: true,
  category: 'ai',
  stages: ['G3'],
  statusBadge: 'beta',
  docsUrl: null,
  quota: null,
  addonPurchasable: false,
  trialDays: null,
};
