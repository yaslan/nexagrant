// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

export const m1Manifest: ModuleManifest = {
  id: 'M1',
  key: 'partner-intel',
  name: 'Partner Intelligence Database',
  description: 'One partner card per organisation, topic leaders and the collaboration graph.',
  version: '1.0',
  requires: [],
  recommends: [],
  // Which plans open this module is declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M1'),
  addOnSku: null,
  routes: [
    { path: 'partners', permission: 'partner-intel:read' },
    { path: 'partners/leaders', permission: 'partner-intel:read' },
    { path: 'partners/[pic]', permission: 'partner-intel:read' },
  ],
  nav: [{ labelKey: 'partners', routeKey: 'partners', order: 30 }],
  permissions: [
    { id: 'partner-intel:read', minRole: Role.MEMBER },
    { id: 'partner-intel:write', minRole: Role.WRITER },
  ],
  tables: [
    'CordisOrganization',
    'CordisProject',
    'CordisParticipation',
    'CordisProjectTopic',
    'CordisCoParticipation',
    'CordisPartnerProfile',
    'PartnerOrg',
  ],
  isActive: true,
  category: 'core',
  stages: ['G0', 'G2'], // Patron onayı K-563625 (2026-10-17)
  statusBadge: 'ga',
  docsUrl: null,
  quota: null,
};
