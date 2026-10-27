// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

export const m9Manifest: ModuleManifest = {
  id: 'M9',
  key: 'briefs',
  name: 'Meeting Briefs',
  description: 'One-page brief before a partner meeting, assembled from the partner card and the topic.',
  version: '1.0',
  requires: ['M1', 'M4'],
  recommends: [],
  // Which plans open this module is declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M9'),
  addOnSku: null,
  routes: [{ path: 'opportunities/[id]/briefs', permission: 'briefs:read' }],
  nav: [],
  opportunityTabs: [{ labelKey: 'briefs', routeKey: 'opportunityBriefs', order: 50 }],
  permissions: [
    { id: 'briefs:read', minRole: Role.MEMBER },
    { id: 'briefs:write', minRole: Role.WRITER },
  ],
  tables: ['MeetingBrief'],
  isActive: true,
  category: 'tools',
  stages: ['G2'], // Patron onayı K-563625 (2026-10-17)
  statusBadge: 'ga',
  docsUrl: null,
  quota: null,
  addonPurchasable: false,
  trialDays: 7,
};
