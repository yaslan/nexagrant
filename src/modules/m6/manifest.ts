// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { ModuleManifest } from '@/lib/modules/types';

export const m6Manifest: ModuleManifest = {
  id: 'M6',
  key: 'evaluator',
  name: 'Evaluator Lens',
  description: 'Internal pre-assessment against the call criteria — never presented as an official score.',
  version: '1.0',
  requires: [],
  recommends: [],
  planTiers: ['business', 'enterprise'],
  addOnSku: null,
  // Reached from an opportunity, so it contributes no sidebar entry.
  routes: [{ path: 'opportunities/[id]/evaluations', permission: 'evaluator:read' }],
  nav: [],
  permissions: [
    { id: 'evaluator:read', minRole: Role.MEMBER },
    { id: 'evaluator:write', minRole: Role.WRITER },
  ],
  tables: ['Evaluation', 'Reviewer', 'Criterion', 'Score'],
  isActive: true,
};
