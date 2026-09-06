// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { ModuleManifest } from '@/lib/modules/types';

export const m8Manifest: ModuleManifest = {
  id: 'M8',
  key: 'consortium-matching',
  name: 'Consortium Matching',
  description: 'Seat plan per proposal and ranked partner candidates for each open seat.',
  version: '1.0',
  requires: ['M1'],
  recommends: ['M4'],
  planTiers: ['team', 'business', 'enterprise'],
  addOnSku: null,
  // Both pages hang off a specific opportunity, so there is no sidebar entry.
  routes: [
    { path: 'opportunities/[id]/matching', permission: 'consortium-matching:read' },
    { path: 'pipeline/[id]/consortium', permission: 'consortium-matching:read' },
  ],
  nav: [],
  permissions: [
    { id: 'consortium-matching:read', minRole: Role.MEMBER },
    { id: 'consortium-matching:write', minRole: Role.WRITER },
  ],
  tables: ['ConsortiumSeat', 'SeatCandidate', 'TopicMatch'],
  isActive: true,
};
