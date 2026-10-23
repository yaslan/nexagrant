import { plansGrantingModule } from '@/lib/billing/catalog';
import { ModuleManifest } from '@/lib/modules/types';

// FO-40 (TASK-MVC4JL6550ZLE), patron Faz 2 onayı. Yakında: `statusBadge: 'soon'`
// modüller state-machine'de açılamaz; bu manifest yalnız tanım + görüntü içindir.
// Plan görünümü `displayPlansForModule` üzerinden gelir. Tüm planlar. Mevcut uzman ön kayıt sayfasıyla ilişkisi FO-40 raporunda.
export const m12Manifest: ModuleManifest = {
  id: 'M12',
  key: 'expert-pool',
  name: 'Expert Pool',
  description: 'Expert pre-registration pool for evaluator and reviewer matching.',
  version: '1.0',
  requires: [],
  recommends: [],
  planTiers: plansGrantingModule('M12'),
  addOnSku: null,
  routes: [{ path: 'modules/expert-pool' }],
  nav: [],
  permissions: [],
  tables: ['ExpertPreRegistration'],
  isActive: true,
  category: 'tools',
  stages: ['G2'],
  statusBadge: 'soon',
  docsUrl: null,
  quota: null,
};
