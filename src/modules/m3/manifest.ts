// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

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
    { id: 'evidence:read', minRole: Role.MEMBER },
    { id: 'evidence:write', minRole: Role.WRITER },
  ],
  tables: ['Evidence', 'Claim', 'ClaimEvidenceLink', 'EvidenceReminder'],
  isActive: true,
};
