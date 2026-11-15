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
    { id: 'workflows:read', minRole: 'MEMBER' },
    { id: 'workflows:write', minRole: 'WRITER' },
  ],
  tables: ['Opportunity', 'GateDecision', 'Proposal', 'Effort', 'ProposalUsage'],
  isActive: true,
  category: 'core',
  stages: ['G3', 'G4'], // Patron onayı K-563625 (2026-10-17)
  statusBadge: 'ga',
  docsUrl: null,
  quota: null,
  addonPurchasable: false,
  trialDays: 7,
};
