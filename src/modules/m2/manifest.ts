// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { Role } from '@prisma/client';

import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

export const m2Manifest: ModuleManifest = {
  id: 'M2',
  key: 'concept-note',
  name: 'Concept Note Architectures',
  description: 'Programme-specific short proposal templates with an AI first draft.',
  version: '1.0',
  requires: [],
  recommends: ['M3'],
  // Which plans open this module is declared once, in the billing catalogue.
  planTiers: plansGrantingModule('M2'),
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
  category: 'core',
  stages: ['G0', 'G1'], // Patron onayı K-563625 (2026-10-17)
  statusBadge: 'ga',
  docsUrl: null,
  quota: null,
  programTemplates: ['horizon-europe', 'eurostars', 'digital-europe', 'eic-accelerator'],
};
