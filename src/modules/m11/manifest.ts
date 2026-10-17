// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

export const m11Manifest: ModuleManifest = {
  id: 'M11',
  key: 'application',
  name: 'Full Application Production',
  description: 'Part-by-part application drafting on top of the concept note, evidence and consortium.',
  version: '1.0',
  requires: ['M2', 'M3', 'M5', 'M8'],
  recommends: [],
  // Which plans open this module is declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M11'),
  addOnSku: null,
  routes: [{ path: 'opportunities/[id]/application', permission: 'application:read' }],
  nav: [],
  permissions: [
    { id: 'application:read', minRole: Role.MEMBER },
    { id: 'application:write', minRole: Role.WRITER },
  ],
  tables: ['ApplicationPart'],
  isActive: true,
  category: 'tools',
  stages: ['G3', 'G4'], // Patron onayı K-563625 (2026-10-17)
  statusBadge: 'ga',
  docsUrl: null,
  quota: null,
};
