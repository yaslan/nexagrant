import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

export const m3Manifest: ModuleManifest = {
  id: 'M3',
  key: 'evidence',
  name: 'Evidence Pack',
  description: 'Reusable evidence library with source and validity discipline.',
  version: '1.0',
  requires: [],
  recommends: [],
  // Which plans open this module is declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M3'),
  addOnSku: null,
  routes: [{ path: 'evidence', permission: 'evidence:read' }],
  nav: [{ labelKey: 'evidence', routeKey: 'evidence', order: 50 }],
  permissions: [
    { id: 'evidence:read', minRole: 'MEMBER' },
    { id: 'evidence:write', minRole: 'WRITER' },
  ],
  tables: ['Evidence', 'Claim', 'ClaimEvidenceLink'],
  isActive: true,
  category: 'core',
  stages: ['G3', 'G4'], // Patron onayı K-563625 (2026-10-17)
  statusBadge: 'ga',
  docsUrl: null,
  quota: null,
  addonPurchasable: false,
  trialDays: 7,
};
