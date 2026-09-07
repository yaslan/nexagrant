// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

export const m5Manifest: ModuleManifest = {
  id: 'M5',
  key: 'workflows',
  name: 'Proposal Production Workflows',
  description: 'Gate-driven pipeline from opportunity to submission, with person-day reporting.',
  version: '1.0',
  requires: [],
  recommends: [],
  // Which plans open this module is declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M5'),
  addOnSku: null,
  routes: [
    { path: 'pipeline', permission: 'workflows:read' },
    { path: 'pipeline/[id]', permission: 'workflows:read' },
    { path: 'reports/person-days', permission: 'workflows:read' },
  ],
  nav: [{ labelKey: 'pipeline', routeKey: 'pipeline', order: 20 }],
  permissions: [
    { id: 'workflows:read', minRole: Role.MEMBER },
    { id: 'workflows:write', minRole: Role.WRITER },
  ],
  tables: ['Opportunity', 'GateDecision', 'Proposal', 'Effort', 'ProposalUsage'],
  isActive: true,
};
