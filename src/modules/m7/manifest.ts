// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

export const m7Manifest: ModuleManifest = {
  id: 'M7',
  key: 'tto',
  name: 'TTO Accelerator',
  description: 'Technology transfer portfolio: readiness, ownership and commercialisation route per asset.',
  version: '1.0',
  requires: ['M1', 'M4'],
  recommends: [],
  // Which plans open this module is declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M7'),
  addOnSku: null,
  routes: [{ path: 'tto', permission: 'tto:read' }],
  nav: [{ labelKey: 'tto', routeKey: 'tto', order: 70 }],
  permissions: [
    { id: 'tto:read', minRole: Role.MEMBER },
    { id: 'tto:write', minRole: Role.WRITER },
  ],
  tables: ['TtoPortfolioItem'],
  isActive: true,
};
