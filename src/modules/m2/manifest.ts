// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { ModuleManifest } from '@/lib/modules/types';

export const m2Manifest: ModuleManifest = {
  id: 'M2',
  key: 'concept-note',
  name: 'Concept Note Architectures',
  description: 'Programme-specific short proposal templates with an AI first draft.',
  version: '1.0',
  requires: [],
  recommends: ['M3'],
  planTiers: ['starter', 'team', 'business', 'enterprise'],
  addOnSku: null,
  routes: [
    { path: 'concept-notes', permission: 'concept-note:read' },
    { path: 'concept-notes/[id]', permission: 'concept-note:read' },
    { path: 'opportunities/[id]/m2', permission: 'concept-note:read' },
  ],
  nav: [{ labelKey: 'conceptNotes', routeKey: 'conceptNotes', order: 40 }],
  permissions: [
    { id: 'concept-note:read', minRole: Role.MEMBER },
    { id: 'concept-note:write', minRole: Role.WRITER },
  ],
  tables: ['ConceptTemplate', 'ConceptNote'],
  isActive: true,
};
