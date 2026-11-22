import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

export const m8Manifest: ModuleManifest = {
  id: 'M8',
  key: 'consortium-matching',
  name: 'Consortium Matching',
  description: 'Seat plan per proposal and ranked partner candidates for each open seat.',
  version: '1.0',
  requires: ['M1'],
  recommends: ['M4'],
  // Which plans open this module is declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M8'),
  addOnSku: null,
  // Both pages hang off a specific opportunity, so there is no sidebar entry:
  // they are reached as tabs on the opportunity detail page.
  routes: [
    { path: 'opportunities/[id]/matching', permission: 'consortium-matching:read' },
    { path: 'pipeline/[id]/consortium', permission: 'consortium-matching:read' },
  ],
  nav: [],
  opportunityTabs: [
    { labelKey: 'matching', routeKey: 'opportunityMatching', order: 30 },
    { labelKey: 'consortium', routeKey: 'opportunityConsortium', order: 40 },
  ],
  permissions: [
    { id: 'consortium-matching:read', minRole: 'MEMBER' },
    { id: 'consortium-matching:write', minRole: 'WRITER' },
  ],
  tables: ['ConsortiumSeat', 'SeatCandidate', 'TopicMatch'],
  isActive: true,
  category: 'ai',
  // G1's consortium check reads this module's seats (src/lib/gates/evaluate.ts).
  stages: ['G1', 'G2'], // Patron onayı K-563625 (2026-10-17), G1 eklendi K-577631 (2026-11-06)
  statusBadge: 'ga',
  docsUrl: null,
  quota: null,
  addonPurchasable: false,
  trialDays: 7,
};
