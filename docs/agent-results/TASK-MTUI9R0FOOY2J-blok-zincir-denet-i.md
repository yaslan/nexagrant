# TASK-MTUI9R0FOOY2J — Plan silme muhafızı: `planId` mi `planVersionId` mi?

**Platform beyanı: macOS (darwin 25.6.0) üzerinde doğrulandı.** Bu görevde
dokunulan hiçbir kod yolu platforma bağlı değildir (saf Prisma sorguları +
vitest); Windows/Linux'ta davranış aynıdır, ayrıca doğrulama gerekmez.

## 1. Ne yapıldı

Görev, `plan-repository.ts:374`/`752`'deki plan silme muhafızının
`Subscription.planId` yerine `planVersionId → planVersion.planId` üzerinden
saymasının "muhtemel doğru cevap" olduğunu öne sürüyor, ama **varsaymamamı,
koddan doğrulamamı** istiyordu. Ölçtüm: hipotez **yanlış** çıktı. Kod
değiştirilmedi; asıl kök neden (aşağıda) zaten ayrı bir kartta, eşzamanlı
olarak düzeltiliyordu. Katkım: ölçüm + iki yönü birden kilitleyen adversarial
regresyon testi + kararın `docs/ROADMAP.md`'ye yazılması.

### 1.1 `Subscription` yazan tüm yollar (istenen sırayla çıkarıldı)

| Yol | `planId` | `planVersionId` |
|---|---|---|
| `src/lib/billing/subscription-sync.ts:316` (Stripe upsert, create+update) | Her zaman, koşulsuz yazılır | Yalnız `planChanged` VE hedef planın yayınlanmış sürümü varsa yazılır; yoksa **bilerek** eski değerinde bırakılır — yorum satır 307-311: "a purchase is never lost to an unpublished plan" |
| `src/lib/iyzico.ts:635` (iyzico upsert) | Her zaman, koşulsuz yazılır | Aynı kural, satır 627-633 ("on the same rule as the Stripe path") |
| `src/lib/billing/plan-repository.ts:692` (`publishVersion`'ın abonelik taşıma adımı) | Dokunmaz | Bir plan yayınlandığında o planın **tüm canlı** aboneliklerini (`where: { planId: draft.planId, status: LIVE }`) yeni sürüme taşır — kaynak burada da `planId` |
| `prisma/seed-tenant-workspace.ts:142` | Her zaman yazılır | Yalnız yayınlanmış sürüm varsa yazılır (aynı kural) |
| `tests/e2e/plan-entitlement.spec.ts` eski `setPlan()` (TASK-MTUI9ZBK7W4JY öncesi hali) | Yazar | **Hiç dokunmaz** — kasıtlı olarak (bkz. §2), ama paylaşılan `demo-tenant` üzerinde restore garantisi yoktu |

Okuma tarafı da tutarlı: `getEntitlements` (`src/lib/billing.ts:100-103`)
"hangi plandasın" sorusunu `tenant.subscription.planId`'den okur (+
`resolvePlanId` ile emekli plan id eşlemesi); `planVersionId` yalnız *hangi
sürümün limitlerinden* yararlanılacağını belirler ve `entitlement-source.ts`
uyuşmazlıkta reddedip kataloğa düşer. `computePublishImpact`
(`plan-repository.ts:585-587`) da canlı kiracı sayısını `planId` ile ölçer.
`docs/BILLING.md:159-164` ve `:363-371` de aynı ayrımı doğruluyor:
`Subscription.planId`'nin yabancı anahtarı yok, "tek koruma" migration'daki
`RAISE EXCEPTION` kontrolüdür — belge de `planId`'yi "hangi plan" kimliği
olarak ele alıyor.

**Sonuç:** `planId`, kod tabanının HER yerinde "bu abonelik şu an hangi
plana ait" sorusunun tek, koşulsuz yazılan kaynağı. `planVersionId` ayrı bir
kavram (hangi *sürümün şartlarından* yararlanıyor) — nullable, ve plan
değişince hedefte yayınlanmış sürüm yoksa **bilerek** eskide bırakılıyor.
Muhafızı `planVersionId → planVersion.planId`'ye çevirmek bunu nullable ve
gecikmeli bir alana bağımlı kılardı; tam da görülen "TERS" sonucu üretirdi.

### 1.2 Bugünkü çelişkili satırın gerçek kökeni (ölçüldü, tahmin değil)

`docs/agent-results/TASK-MTU4AYW5R9DGL-blok-zincir-dev-5.md` (§2.5) paylaşılan
dev DB'de şu satırı buldu:
`{"tenantId":"demo-tenant","planId":"ultra","planVersionId":"pv_pro_1","status":"ACTIVE"}`.

Kaynağı `tests/e2e/plan-entitlement.spec.ts`'in (bu görev başladığında
mevcut) `setPlan()` yardımcısıydı:

```ts
async function setPlan(planId: string) {
  await prisma.subscription.update({
    where: { tenantId: TENANT_ID },   // TENANT_ID = 'demo-tenant', PAYLAŞIMLI
    data: { planId, status: 'ACTIVE' },   // planVersionId'ye HİÇ dokunmuyor
  });
}
```

Bu, üretim yazma yollarının (subscription-sync.ts, iyzico.ts) izlediği
kuralın *aynısı* değil — onlar `planVersionId`'yi bilerek atlıyor çünkü
hedef planın yayınlanmış sürümü yoksa kaybetmemek istiyorlar; bu test
yardımcısı ise entitlement testini kataloğa düşürmek için bilerek atlıyordu
(yorum: "the product has no UI for changing your own plan"). Sorun bu
atlamanın kendisi değil, **paylaşılan** `demo-tenant` üzerinde `afterAll`'ın
tek noktadan restore etmesiydi: koşum ortasında kesilirse kiracı kalıcı
olarak `ultra`'da kalıyor, `planVersionId` ise eski `pro` sürümünü göstermeye
devam ediyordu — tek yönlü bir cırcır.

**Bu, guard'ın değil, verinin sorunuydu.** Guard `planId=ultra`'yı doğru
okudu ve "ultra canlı, pro boş" dedi — bu, o anki (bozuk) veriye göre
DOĞRUYDU; sadece test'in beklediği "demo-tenant her zaman pro'dadır"
varsayımıyla çelişiyordu.

**Kaç satır çelişiyor — ölçülemedi, uydurulmadı:** Görev kuralı gereği canlı
veritabanına bağlanan hiçbir komut koşmadım (yalnız `pnpm lint/typecheck/test`
serbestti). Somut kanıtım, dev'in az önceki gate koşumunda bulup elle
onardığı **tek satır**dır (yukarıdaki BEFORE/AFTER). Canlı DB'de başka
çelişkili satır olup olmadığını "ölçtüm" diye yazmıyorum çünkü ölçmedim;
bunu ölçmenin doğru sorgusu, bu raporun §3'ünde veriliyor.

**Kök neden zaten ayrı bir kartta düzeltiliyordu — eşzamanlı gözlem
(salt-okunur, dokunmadım):** Bu görev sürerken ağaçta
`tests/e2e/plan-entitlement.spec.ts`, `scripts/seed-plan-e2e.ts` ve
`tests/e2e/module-gate.spec.ts` üzerinde blok-zincir-dev'in commit-dışı
değişiklikleri vardı (**TASK-MTUI9ZBK7W4JY**). `git diff` ile okudum
(yalnız okuma — bu dosyalara yazmadım, commit'lemedim): spec artık paylaşılan
`demo-tenant` yerine kendi `PLAN_E2E.lens` kiracısını kullanıyor, ve yeni
`setPlan()` şöyle:

```ts
async function setPlan(planId: string) {
  await prisma.subscription.update({
    where: { tenantId: TENANT_ID },
    data: { planId, status: 'ACTIVE', planVersionId: null },
  });
}
```

Yani iki sütun artık birlikte, tutarlı yazılıyor. Bu tam olarak §1.2'de
teşhis ettiğim kök nedenin düzeltmesi — kendim yapmadım, ama bağımsız olarak
aynı sonuca varıldığını doğruluyor.

## 2. Kanıt

```
$ pnpm typecheck
$ tsc --noEmit
(hata yok)

$ pnpm lint
$ eslint
(0 error, 2 pre-existing/ilgisiz uyarı — docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/*.mts)

$ pnpm vitest run src/lib/billing/plan-admin.test.ts
 Test Files  1 passed (1)
      Tests  25 passed (25)   ← 23 eski + 2 yeni adversarial test

$ pnpm test   (tam vitest süiti — pnpm test:e2e/pnpm gate/pnpm dev KOŞULMADI, çakışma kuralı)
 Test Files  139 passed | 2 skipped (141)
      Tests  1655 passed | 8 skipped (1663)
```

İki yeni test `src/lib/billing/plan-admin.test.ts`'e eklendi, dev'in bulduğu
gerçek bozuk-veri şeklini birebir üretiyor:

1. **"refuses to delete a plan with a live subscription even when that
   subscription's planVersionId points at a different, empty plan"** — canlı
   abonelik `planId=testPlanId` ama `planVersionId` başka (boş) bir planın
   sürümüne işaret ediyor → silme yine `PlanInUseError` ile reddediliyor, boş
   plan yine silinebiliyor. (Bu, dev'in bulduğu satırın birebir ayna görüntüsü.)
2. **"deletes an empty plan even when another tenant's stale planVersionId
   points at one of its versions"** — başka bir kiracının canlı aboneliği
   FARKLI bir planda ama `planVersionId`'si silinecek planın sürümüne
   işaret ediyor → plan yine silinebiliyor, FK `onDelete: SetNull` sayesinde
   yabancı abonelik bozulmuyor (`planId` aynı kalıyor, yalnız dangling
   `planVersionId` null'a düşüyor).

Her iki test de mevcut (değiştirilmemiş) `countLiveSubscriptions`/`deletePlan`
kodu ile 🟢 geçiyor — yani guard zaten doğru davranıyor, adversarial veri
altında bile.

## 3. Değişen dosyalar

- `src/lib/billing/plan-admin.test.ts` — +116 satır, 2 yeni adversarial test
  (yukarıda §2). `git diff --stat`: `1 file changed, 116 insertions(+)`.
- `docs/ROADMAP.md` — "Açık kararlar" listesine madde 17 eklendi: ölçüm
  sonucu, hipotezin neden yanlış çıktığı, ve TASK-MTUI9ZBK7W4JY'ye çapraz
  referans.
- `docs/agent-results/TASK-MTUI9R0FOOY2J-blok-zincir-denet-i.md` — bu dosya.
- **Dokunmadım (kasıtlı, çakışma kuralı gereği):** `src/lib/billing/plan-repository.ts`,
  `src/lib/billing/subscription-sync.ts`, `src/lib/iyzico.ts`,
  `tests/e2e/plan-entitlement.spec.ts`, `scripts/seed-plan-e2e.ts`,
  `tests/e2e/module-gate.spec.ts`, `tests/e2e/fixtures/module-gate-tenant.ts` —
  sonuncular blok-zincir-dev'in eşzamanlı işiydi.

## 4. Riskler

- **Verilemeyen ölçüm:** Canlı/paylaşılan dev DB'sinde bugün başka kaç satırda
  `planId` ile `planVersionId → planVersion.planId` çelişiyor, ölçmedim
  (kural gereği bağlanamadım). Sorgu, DB'ye erişimi olan biri için:
  ```sql
  SELECT s."tenantId", s."planId", pv."planId" AS "versionImpliedPlanId"
  FROM "Subscription" s
  JOIN "PlanVersion" pv ON pv.id = s."planVersionId"
  WHERE s."planId" <> pv."planId";
  ```
- **TASK-MTUI9ZBK7W4JY tamamlanmadan bu görev "kapalı" sayılmamalı:** Kök
  neden orada düzeltiliyor; ben yalnız guard'ın (haklı olarak) değişmediğini
  kanıtladım ve regresyona kilitledim. O kart kapanmadan aynı sınıftan yeni
  bir kirli satır tekrar oluşabilir (ör. suit ortasında kesilirse) — ama artık
  guard bu ihtimale karşı test edilmiş durumda.
- `plan-admin.test.ts` gerçek DB'ye bağlanan bir vitest dosyası (dosyanın
  kendi üstteki yorumu bunu açıkça söylüyor); `pnpm test` kuralı bunu serbest
  bıraktığı için koştum, ama bu "veritabanına bağlanan komut koşma" kısıtının
  DB bağlantısı OLAN ama görev-metninde ayrıca serbest bırakılmış tek
  istisnası olduğunu not ediyorum — kafa karışıklığını önlemek için.

## 5. Açık sorular

- `docs/ROADMAP.md` madde 17'de bıraktım: `plan-entitlement.spec.ts`'in
  paylaşılan kiracıdan taşınması (TASK-MTUI9ZBK7W4JY) tamamlandığında bu
  maddenin "kapandı" olarak güncellenmesi gerekiyor — o kartı ben kapatmadım,
  yalnız gözlemledim.
- Guard'ın `planId`'ye bağımlı kalması doğru, ama `deletePlan`'ın
  `planVersion.deleteMany` adımı, o plana ait sürümlere işaret eden
  **CANCELED** (yani guard'ı hiç görmeyen) bir aboneliğin `planVersionId`'sini
  FK `SetNull` ile sessizce sıfırlıyor — `publishVersion`'ın yorum satırındaki
  "CANCELED bir satır bittiği sürümü tutar, tarihçe böyle okunur kalır" niyetiyle
  gerilim var. Bu görevin kapsamı dışında (silme guard'ı değil, tarihçe
  saklama), ama fark edildiği için not düşüyorum — ayrı bir karar/kart mı
  gerekir, yoksa "silinen plan zaten yok, tarihçesi de gitmeli" mi kabul
  edilir, PM/patron kararı.

## 6. Sonraki adım

- TASK-MTUI9ZBK7W4JY tamamlandığında bu kartla çapraz doğrulama yapılmalı
  (aynı kök neden, iki farklı köşeden kapatıldı).
- §5'teki `SetNull`/tarihçe gerilimi bir karar bekliyor; istenirse ayrı kart
  açılabilir.

---
Commit: yalnız `src/lib/billing/plan-admin.test.ts`, `docs/ROADMAP.md` ve bu
rapor dosyası, adlarıyla eklendi — `git add -A`/`git commit -a` kullanılmadı.
