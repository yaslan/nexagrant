import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

// FO-40 (TASK-MVC4JL6550ZLE), patron Faz 2 onayı. Yakında: `statusBadge: 'soon'`
// modüller state-machine'de açılamaz; bu manifest yalnız tanım + görüntü içindir.
// Plan görünümü `displayPlansForModule` üzerinden gelir. Discover (sınırlı), Basic, Pro, Ultra.
// Çağrılar/Fırsatlar menüsü M0 GA olana kadar kilitlenmez.
export const m0Manifest: ModuleManifest = {
  id: 'M0',
  key: 'call-fit',
  name: 'Call Fit',
  description: 'Scores open calls against the organisation profile; a decision aid, not a guarantee of selection.',
  version: '1.0',
  requires: [],
  recommends: [],
  planTiers: plansGrantingModule('M0'),
  addOnSku: null,
  routes: [{ path: 'modules/call-fit' }],
  nav: [],
  permissions: [],
  tables: ['Call'],
  isActive: true,
  category: 'core',
  stages: ['G0'],
  statusBadge: 'soon',
  docsUrl: null,
  quota: null,
  addonPurchasable: false,
  trialDays: null,
};
