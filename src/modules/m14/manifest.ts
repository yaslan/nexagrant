import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

// FO-40 (TASK-MVC4JL6550ZLE), patron Faz 2 onayı. Yakında: `statusBadge: 'soon'`
// modüller state-machine'de açılamaz; bu manifest yalnız tanım + görüntü içindir.
// Plan görünümü `displayPlansForModule` üzerinden gelir. Ultra.
export const m14Manifest: ModuleManifest = {
  id: 'M14',
  key: 'compliance',
  name: 'Compliance Check',
  description: 'AI-assisted compliance review of application parts against programme rules.',
  version: '1.0',
  requires: ['M11'],
  recommends: [],
  planTiers: plansGrantingModule('M14'),
  addOnSku: null,
  routes: [{ path: 'modules/compliance' }],
  nav: [],
  permissions: [],
  tables: ['ApplicationPart'],
  isActive: true,
  category: 'ai',
  stages: ['G3', 'G4'],
  statusBadge: 'soon',
  docsUrl: null,
  quota: null,
};
