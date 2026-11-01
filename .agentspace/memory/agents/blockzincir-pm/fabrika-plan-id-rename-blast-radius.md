---
name: fabrika-plan-id-rename-blast-radius
description: Fabrika'da bir plan id'sini değiştirmek 5 dosyayı değil ~20'yi kırar — derleyicinin bulduğu yerler ve bulamadığı yerler
metadata:
  type: project
  updatedAt: 2026-09-07
---

`Subscription.planId`'yi yeniden adlandırmadan önce bu listeye bak (2026-09-07,
TASK-MTR6QIE05ZKNH'de ölçüldü):

**Derleyicinin yakaladığı** (`PlanTier` union'ı daraltınca ortaya çıkar):
- `src/lib/modules/types.ts` → `PlanTier`
- `src/modules/m*/manifest.ts` × 11 → `planTiers`
- `settings/modules/{page.tsx,actions.ts,client.tsx}` → varsayılan plan +
  `PLAN_BADGES` Record'u
- `tests/modules/state-machine.test.ts`

**Derleyicinin yakalamadığı — sessizce kırılanlar:**
- `prisma/seed-tenant-workspace.ts` → demo aboneliğine `planId: 'team'` string'i
  yazıyor; her re-seed kiracıyı olmayan plana geri koyar
- `src/lib/beta/constants.ts` → `BETA_PLAN_ID = 'enterprise'`
- `scripts/stripe-sync.ts` → `plan.id === 'enterprise'` atlaması
- `src/lib/iyzico.ts` → `TRY_PLAN_PRICES` anahtarları + conversationId'ye yazılan
  planId (webhook planı o id ile arıyor)
- `tests/beta/pricing-transition.test.ts` → `prisma/seed.ts`'i **regex'le
  tarayıp** fiyat literal'i arıyordu; seed türetilince regex boş döndü ve test
  boş bir map üzerinde sessizce geçti. Dosya tarayan guard testleri, taradıkları
  dosya yeniden yazılınca kapı olmaktan çıkar.

`Subscription.planId`'de FK yok; emekli bir id'yi tolere etmek için
`resolvePlanId()` var ama tek başına yeterli değil — yukarıdaki string'ler yine
de düzeltilmeli.
