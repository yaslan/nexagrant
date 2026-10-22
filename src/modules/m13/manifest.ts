import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

// FO-40 (TASK-MVC4JL6550ZLE), patron Faz 2 onayı. Yakında: `statusBadge: 'soon'`
// modüller state-machine'de açılamaz; bu manifest yalnız tanım + görüntü içindir.
// Plan görünümü `displayPlansForModule` üzerinden gelir. Pro, Ultra.
export const m13Manifest: ModuleManifest = {
  id: 'M13',
  key: 'budget-wp',
  name: 'Budget & Work Packages',
  description: 'Budget and work-package planning on top of the partner and proposal data.',
  version: '1.0',
  requires: ['M5'],
  recommends: ['M11'],
  planTiers: plansGrantingModule('M13'),
  addOnSku: null,
  routes: [],
  nav: [],
  permissions: [],
  tables: ['Proposal'],
  isActive: true,
  category: 'core',
  stages: ['G3'],
  statusBadge: 'soon',
  docsUrl: null,
  quota: null,
};
