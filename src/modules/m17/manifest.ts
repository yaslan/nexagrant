// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

// FO-186 (TASK-MVRIV9LCDHYKO), owner-approved plan FO-185. The plan called it
// "M15", but M15 is Post-Award Management (FO-40), so it takes the next free id.
// F1 ships the data model and the upload/extract API only: the page is a gated
// placeholder (fe-fb's screens replace it in F2/F3). F2 (FO-188) adds the LLM run
// (POST …/analyses/[id]/evaluate, `M17:evaluate` in `AI_ACTION_CREDITS`, price pending
// the owner's approval). Until the screens ship it stays `soon` — listed as a preview
// on Pro and Ultra, refused by every gate (COMING_SOON) whatever ModuleState says.
// Opening it = statusBadge 'beta' + a route/nav entry + `moduleIds` in the catalogue.
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
  // Coming-soon placeholder; the real screens replace it (fe-fb).
  routes: [{ path: 'modules/interreg-review' }],
  nav: [],
  permissions: [
    { id: 'interreg-review:read', minRole: Role.MEMBER },
    { id: 'interreg-review:write', minRole: Role.WRITER },
  ],
  // Its own tenant tables; the rubric tables (InterregRubric*) are platform reference data.
  tables: ['InterregAnalysis', 'InterregAnalysisResult', 'InterregCriterionMark'],
  isActive: true,
  category: 'ai',
  stages: ['G3'],
  statusBadge: 'soon',
  docsUrl: null,
  quota: null,
  addonPurchasable: false,
  trialDays: null,
};
