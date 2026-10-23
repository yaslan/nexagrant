import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

// FO-40 (TASK-MVC4JL6550ZLE), patron Faz 2 onayı. Yakında: `statusBadge: 'soon'`
// modüller state-machine'de açılamaz; bu manifest yalnız tanım + görüntü içindir.
// Plan görünümü `displayPlansForModule` üzerinden gelir. Ultra.
export const m15Manifest: ModuleManifest = {
  id: 'M15',
  key: 'post-award',
  name: 'Post-Award Management',
  description: 'Reporting, effort tracking and deliverables after a grant is signed.',
  version: '1.0',
  requires: ['M5'],
  recommends: [],
  planTiers: plansGrantingModule('M15'),
  addOnSku: null,
  routes: [{ path: 'modules/post-award' }],
  nav: [],
  permissions: [],
  tables: ['Effort'],
  isActive: true,
  category: 'tools',
  stages: ['G4'],
  statusBadge: 'soon',
  docsUrl: null,
  quota: null,
};
