// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

export const m10Manifest: ModuleManifest = {
  id: 'M10',
  key: 'followups',
  name: 'Follow-up Documents',
  description: 'NDA, LOI and award packs generated from an opportunity and versioned per signature.',
  version: '1.0',
  requires: ['M4'],
  recommends: ['M9'],
  // Which plans open this module is declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M10'),
  addOnSku: null,
  routes: [{ path: 'opportunities/[id]/documents', permission: 'followups:read' }],
  nav: [],
  permissions: [
    { id: 'followups:read', minRole: Role.MEMBER },
    { id: 'followups:write', minRole: Role.WRITER },
  ],
  tables: ['FollowupDoc'],
  isActive: true,
};
