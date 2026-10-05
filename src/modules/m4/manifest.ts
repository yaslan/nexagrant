// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

export const m4Manifest: ModuleManifest = {
  id: 'M4',
  key: 'focal-point',
  name: 'Focal Point',
  description: 'One internal owner and one external contact per relationship, plus contact cadence.',
  version: '1.0',
  requires: ['M1'],
  recommends: [],
  // Which plans open this module is declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M4'),
  addOnSku: null,
  routes: [
    { path: 'relationships', permission: 'focal-point:read' },
    { path: 'relationships/[id]', permission: 'focal-point:read' },
  ],
  nav: [{ labelKey: 'relationships', routeKey: 'relationships', order: 60 }],
  permissions: [
    { id: 'focal-point:read', minRole: Role.MEMBER },
    { id: 'focal-point:write', minRole: Role.WRITER },
  ],
  tables: ['Relationship', 'Interaction'],
  isActive: true,
};
