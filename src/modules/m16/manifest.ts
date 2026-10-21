// `Role` is imported as a value, not a string literal: src/types/prisma-override.d.ts
// declares it as a TS enum, so `'MEMBER'` is not assignable to `Role` (TS2322).
import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

// FO-40 (TASK-MVC4JL6550ZLE), patron Faz 2 onayı. Yakında: `statusBadge: 'soon'`
// modüller state-machine'de açılamaz; bu manifest yalnız tanım + görüntü içindir.
// Plan görünümü `displayPlansForModule` üzerinden gelir. Tüm planlar.
export const m16Manifest: ModuleManifest = {
  id: 'M16',
  key: 'tr-layer',
  name: 'Turkish National Layer',
  description: 'Turkish national programmes and calls (TÜBİTAK, KOSGEB and similar) alongside the EU pipeline.',
  version: '1.0',
  requires: [],
  recommends: [],
  planTiers: plansGrantingModule('M16'),
  addOnSku: null,
  routes: [],
  nav: [],
  permissions: [],
  tables: ['Programme'],
  isActive: true,
  category: 'core',
  stages: ['G1'],
  statusBadge: 'soon',
  docsUrl: null,
  quota: null,
};
