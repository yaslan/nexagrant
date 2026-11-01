# TASK-MTVRACMDFRGKV — Tenant-bypass Dilim 3: Stripe webhook senkronizasyonu

**Ajan:** customer-support (CS-EN) · **Tip:** ölçüm → refactor (erişim katmanı) · **Bağlam:** `docs/agent-results/TASK-MTSZ0AL4QP2CT-blockzincir-pm.md` §5 Dilim 3 + §7 Riskler · **Kardeş desen:** `docs/agent-results/TASK-MTVR7W9ZXO7M-blok-zincir-dse.md` §4 (D1–D6)

> **Bu raporun en önemli satırı §2.4'te.** Dilim 3 kendi işini yaptı, ama ölçüm sırasında `fabrika_app` rolüne geçildiği gün patlayacak bir para hatası çıktı: Stripe tekrar-gönderim koruması o rol altında hiç eşleşmiyor. Kart açıldı: **TASK-MTVSBEO7VX6Y4** (backlog, öncelik 2).

---

## 1. Ne yapıldı

Kart iş sırasını dayattı: **önce ölç, sonra değiştir.** Sıra buydu.

### 1.1 Ölçüm fazı — bugünkü transaction sınırı (koda dokunmadan)

Sorulan üç soru ve cevapları:

**(a) Hangi çağrılar tek bir `$transaction` içinde?** — **Hiçbiri.** `src/lib/billing/` altında `$transaction` geçen tek bir satır yok; dosyadaki 13 tenant çağrısının her biri kendi autocommit'inde koşuyordu. Bunu grep'e bırakmadım, tel seviyesinde ölçtüm: `pg.Client.prototype.query`'yi yamayıp Prisma'nın gerçekten gönderdiği her ifadeyi kaydettim (`BEGIN`/`COMMIT` dahil).

```
TX first delivery  syncStripeSubscription: BEGIN=0 COMMIT=0 set_config(app.tenant_id)=0 writes=4 statements=13
   shape: SELECT:AuditEvent SELECT:Tenant SELECT:Plan SELECT:Plan SELECT:AddOnCatalog SELECT:Subscription
          SELECT:PlanVersion INSERT:Subscription SELECT:AddOn SELECT:AddOn INSERT:AddOn
          INSERT:CreditLedger INSERT:AuditEvent
TX first delivery  handleSubscriptionCancellation: BEGIN=0 COMMIT=0 set_config(app.tenant_id)=0 writes=12 statements=15
```

`pg_stat_database.xact_commit` ile denedim ve **çalışmadı** — bu sayaç aralıklı flush ediliyor, bu kadar kısa bir çağrıda hep 0 okuyor. Yanlış ölçüm aracını rapora yazmıyorum, ama not: bu yöntemle "0 transaction" sonucu çıkarsa o sonuç ölçüm değil, ölçüm hatasıdır.

**(b) Webhook iki kez gelirse bugün ne oluyor?** — Hiçbir şey. Üç handler de `auditForStripeEvent(eventId)` ile açılıyor ve ikinci teslimat tek bir `SELECT` sonrası dönüyor:

```
TX redelivery syncStripeSubscription:            BEGIN=0 COMMIT=0 writes=0 statements=1  shape: SELECT:AuditEvent
TX redelivery handleSubscriptionCancellation:    BEGIN=0 COMMIT=0 writes=0 statements=1  shape: SELECT:AuditEvent
```

**(c) Hangi kayıt idempotency anahtarı görevi görüyor?** — `AuditEvent` satırı, `data->>'stripeEventId'` üzerinden aranıyor (`auditForStripeEvent`, dosyanın kendi docstring'i TASK-MTSY88Q6AMCGB'yi anlatıyor). Kritik ayrıntı: **bu satır en SONA yazılıyor**, paradan sonra. Yani bugün handler ortasında bir çökme, parayı yazılmış ama anahtarı yazılmamış bırakır.

### 1.2 Değişiklik fazı — 13 çağrı sarmalayıcıya

Kardeş dilimin (TASK-MTVR7W9ZXO7M) D1–D6 desenine uydum; `tenantId`'nin kaynağı **değişmedi** (hâlâ Stripe metadata'sı → `subscription.metadata.tenantId || subscription.description`).

| # | Satır (önce) | Model | Nereye gitti |
|---|---|---|---|
| 1 | 282 `subscription.findUnique` | Subscription | `withTenant` #1 (salt okuma) |
| 2 | 317 `subscription.upsert` | Subscription | `withTenant` #2 (yazma bloğu) |
| 3 | 345 `addOn.findMany` | AddOn | `withTenant` #2 |
| 4 | 360 `addOn.updateMany` | AddOn | `withTenant` #2 |
| 5 | 369 `addOn.findFirst` | AddOn | `withTenant` #2 |
| 6 | 375 `addOn.create` | AddOn | `withTenant` #2 |
| 7 | 385 `addOn.update` | AddOn | `withTenant` #2 (→ `updateMany({id, tenantId})`, §1.4) |
| 8 | 399 `creditLedger.create` | CreditLedger | `withTenant` #2 |
| 9 | 415 `creditLedger.create` | CreditLedger | `withTenant` #2 |
| 10 | 440 `moduleState.upsert` | ModuleState | `withTenant` #2 |
| 11 | 524 `subscription.update` | Subscription | `withTenant` #3 (cancellation) |
| 12 | 530 `addOn.updateMany` | AddOn | `withTenant` #3 |
| 13 | 546 `moduleState.upsert` | ModuleState | `withTenant` #3 |

```
$ grep -nE "prisma\.(subscription|addOn|creditLedger|moduleState)\." src/lib/billing/subscription-sync.ts
(none)
$ grep -n "withTenant(" src/lib/billing/subscription-sync.ts
290:  const existingSubscription = await withTenant(tenantId, (tx) =>
368:  const { addedAddOns, removedAddOns, creditsGranted } = await withTenant(
596:  await withTenant(tenantId, async (tx) => {
```

Geriye kalan `prisma.` çağrıları kapsam dışı modellerdir (`Plan`, `PlanVersion`, `AddOnCatalog`, `ModuleCatalog` = platform katalogları; `Tenant`; `AuditEvent` = TASK-MTSZ0AL4QP2CT §3.5 gereği 48'lik listede yok) ve `createInvoiceForPayment`'a geçirilen istemci.

### 1.3 İç içe transaction: OLUŞMADI — ve oluşmaması tasarımdı

Kartın adıyla sorduğu şey buydu. Cevap: **yok**, ama bedava gelmedi. İki platform okuması tam da tenant çağrılarının ARASINDA duruyordu:

- `publishedVersionIdFor(planId)` (satır 314) — `existingSubscription` okumasıyla `subscription.upsert` arasında, ve `plan-repository.ts` üzerinden **çıplak singleton'a** gidiyor.
- `oldPlan = prisma.plan.findUnique(...)` (satır 428) — kredi tahsisiyle `moduleState.upsert` arasında.

Bunları tek bir sarmalayıcının içinde bırakmak iç içe transaction değil, ondan **daha kötüsü** olurdu: transaction bir bağlantıyı tutarken çıplak singleton'dan **ikinci bir bağlantı** istemek. `createDbClient` pg havuzuna `max` vermiyor, yani havuz pg varsayılanı olan **10**. On eş zamanlı webhook'ta bu yavaş sorgu değil, kilitlenmedir.

Çözüm: `publishedVersionIdFor` iki sarmalayıcının arasında bırakıldı (bu yüzden `syncStripeSubscription`'da bir yerine iki transaction var), `oldPlan` okuması ise yazma bloğunun ÜSTÜNE alındı ve yerine düz bir `modulesToTurnOff: string[]` listesi geçirildi. Aynısı `handleSubscriptionCancellation`'da `freePlan` + `moduleCatalog.findMany` için yapıldı.

Sonuç şekli (`SELECT:PlanVersion`'ın iki `[BEGIN … COMMIT]` bloğunun DIŞINDA durduğuna dikkat):

```
TX first delivery  syncStripeSubscription: BEGIN=2 COMMIT=2 set_config(app.tenant_id)=2 writes=4 statements=19
   shape: SELECT:AuditEvent SELECT:Tenant SELECT:Plan SELECT:Plan SELECT:AddOnCatalog
          [BEGIN SET-TENANT SELECT:Subscription COMMIT]
          SELECT:PlanVersion
          [BEGIN SET-TENANT INSERT:Subscription SELECT:AddOn SELECT:AddOn INSERT:AddOn INSERT:CreditLedger COMMIT]
          INSERT:AuditEvent

TX first delivery  handleSubscriptionCancellation: BEGIN=1 COMMIT=1 set_config(app.tenant_id)=1 writes=12 statements=18
   shape: SELECT:AuditEvent SELECT:Plan SELECT:ModuleCatalog
          [BEGIN SET-TENANT UPDATE:Subscription UPDATE:AddOn INSERT:ModuleState ×9 COMMIT]
          INSERT:AuditEvent
```

**Mevcut sınır nasıl korundu:** `existingSubscription` okuması eskiden de kendi autocommit'indeydi; onu yazma bloğuyla aynı transaction'a almak, bugün var olmayan bir atomiklik sözü vermek olurdu. Ayrı bıraktım — okuma ile yazma arasındaki pencere dünkü pencerenin aynısı. İdempotency anahtarı (`AuditEvent`) da bilerek sarmalayıcının DIŞINDA, en sonda kaldı: içeri almak, "handler ortasında çökme neyi geride bırakır" sorusunun cevabını değiştirirdi ve bu kart erişim katmanı taşımasıdır.

### 1.4 Tek davranış dokunuşu: `addOn.update` → `updateMany({id, tenantId})`

Kardeş raporun D3'ü: sarmalayıcı satır sahipliği vermez, sahiplik yüklemi yazmanın kendi `where`'inde de durmalı. Buradaki `existing.id`, üç satır yukarıda **aynı transaction içinde** ve zaten `tenantId` ile filtrelenmiş bir `findFirst`'ten geliyor; yani satır sayısı her zaman 1 ve gözlemlenebilir hiçbir şey değişmiyor (dönüş değeri zaten atılıyordu). Kazanç: tenant artık okumayla birlikte yazmada da yolculuk ediyor — dosyanın geri kalanının (`addOn.updateMany({tenantId, sku, endedAt})`) zaten yaptığı şey.

Para hesaplarına dokunulmadı: `src/lib/money.ts`, `invoice-writer.ts`, KDV/tevkifat mantığı ve `price-lock.ts` bu kartta hiç açılmadı.

---

## 2. Kanıt

### 2.1 Asıl kanıt — mutasyon: yeşil test kanıt değildir

Yeni birim testini üç kez bozdum. Her mutasyon, tam da hedeflediği iddiayı kırmalıydı — kırdı:

**Mutasyon A — bir tenant yazması çıplak singleton'a geri kondu** (`tx.creditLedger.create` → `prisma.creditLedger.create`):
```
× writes the subscription, the credit grant and the add-ons through withTenant
× never reaches the bare client while a wrapper is open
× still writes the idempotency audit row outside the transaction
TypeError: Cannot read properties of undefined (reading 'create')
Tests  3 failed | 4 passed (7)
```
Mock'taki `prisma` nesnesinde `creditLedger` deleg**esi hiç yok** — regresyon spy sayısına takılmıyor, çağrının kendisinde ölüyor.

**Mutasyon B — idempotency audit satırı sarmalayıcının İÇİNE taşındı:**
```
× never reaches the bare client while a wrapper is open
× still writes the idempotency audit row outside the transaction
AssertionError: expected [ 'auditEvent' ] to deeply equal []
Tests  3 failed | 4 passed (7)
```

**Mutasyon C — platform okuması (`plan.findUnique`) sarmalayıcının İÇİNE geri kondu** (§1.3'teki kilitlenme kuralı):
```
× never reaches the bare client while a wrapper is open
AssertionError: expected [ 'plan' ] to deeply equal []
Tests  2 failed | 5 passed (7)
```

Her mutasyondan sonra dosya yedekten geri alındı (`diff -q` ile birebir doğrulandı) ve suite yeniden yeşile döndü: `Tests  7 passed (7)`.

### 2.2 Aynı olay İKİ KEZ — abonelik satırı, fatura, kredi bakiyesi (kartın istediği kanıt)

`tests/stripe-webhook-tenant-scope.live.test.ts` (YENİ, gerçek Postgres): her iddia veritabanından geri okunan bir sayı.

```
$ pnpm vitest run tests/stripe-webhook-tenant-scope.live.test.ts
 ✓ a redelivered subscription event moves the subscription, add-on and credit rows exactly once 44ms
 ✓ a new event id does change the same rows 12ms
 ✓ a redelivered invoice payment issues exactly one invoice 16ms
 ✓ a redelivered cancellation ends the add-ons exactly once 17ms
 ✓ ten simultaneous webhooks all complete without exhausting the connection pool 40ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Ölçüm sondasının aynı senaryodaki ham sayıları, değişiklik ÖNCESİ ve SONRASI — kart "öncesi/sonrası sayılarla" dediği için ikisi de burada:

| | boş | 1. teslimat sonrası | 2. teslimat (aynı event id) sonrası |
|---|---|---|---|
| **ÖNCE (çıplak prisma)** | `subs 0, addOn 0, kredi 0, fatura 0, audit 0` | `subs 1, addOn 1, kredi 1000, fatura 0, audit 1` | `subs 1, addOn 1, kredi 1000, fatura 0, audit 1` |
| **SONRA (withTenant)** | `subs 0, addOn 0, kredi 0, fatura 0, audit 0` | `subs 1, addOn 1, kredi 1000, fatura 0, audit 1` | `subs 1, addOn 1, kredi 1000, fatura 0, audit 1` |

`IDENTICAL AFTER REDELIVERY: true` — her iki koşuda, hem `syncStripeSubscription` hem `handleSubscriptionCancellation` için. Fatura sütunu bu sondada 0 çünkü `syncStripeSubscription` fatura kesmiyor; fatura tarafı testte ayrıca ölçülüyor (`TenantBillingIdentity` kurulu bir kiracıda `invoiceRows` 0 → 1 → **1**).

**Karşı-olgu kolu** testin içinde: `a new event id does change the same rows`. Bu olmadan, hiçbir şey yazmayan bozuk bir handler da "ikinci teslimat hiçbir şeyi değiştirmedi" iddiasını kusursuz sağlardı.

### 2.3 Eşzamanlılık — bağlantı havuzu (envanter raporu §7'nin ayrıca istediği ölçüm)

Havuz: `createDbClient` `max` vermiyor → pg varsayılanı **10**, `connectionTimeoutMillis: 1000`. Risk gerçekti: artık her webhook transaction'ı süresince bir bağlantıyı TUTUYOR, eskiden ifade başına ödünç alıp bırakıyordu. 10'da kalmadım, uçurumu aramak için 25 ve 50'ye de çıktım:

| eşzamanlı webhook | ÖNCE | SONRA |
|---|---|---|
| 10 | 10/10 · 24 ms · 0 timeout | 10/10 · 56 ms · 0 timeout |
| 25 | 25/25 · 31 ms · 0 timeout | 25/25 · 43 ms · 0 timeout |
| 50 | 50/50 · 60 ms · 0 timeout | 50/50 · 76 ms · 0 timeout |

Her seviyede, her kiracı tam olarak 1 abonelik + 1000 kredi + 1 eklenti aldı (`10/10`, `25/25`, `50/50`). Uçurum yok: transaction 5 ifade uzunluğunda ve birkaç ms sürüyor, 10 bağlantı bu hızda dönüyor. Havuz tükenmesi **ölçülmedi ve gözlenmedi**; maliyet ~2 kat gecikme (56 vs 24 ms, 10 eşzamanlıda).

### 2.4 🔴 Ölçüm sırasında çıkan gerçek bulgu: `fabrika_app` altında idempotency KIRIK

Bu kartın bütün gerekçesi, uygulamanın bir gün `fabrika` (BYPASSRLS) yerine `fabrika_app` (NOBYPASSRLS) rolüne geçmesi. O yüzden handler'ı gerçekten o rol altında koşturdum.

```
role: fabrika_app (NOBYPASSRLS)
ÖNCE (çıplak prisma):  handler threw — Invalid `prisma.subscription.upsert()` invocation
  Subscription rows written: 0 · CreditLedger rows written: 0 · AuditEvent rows written: 0
SONRA (withTenant):    handler threw — Invalid `prisma.auditEvent.create()` invocation
  Subscription rows written: 1 · CreditLedger rows written: 1 · AuditEvent rows written: 0
```

İyi haber: **sarma çalışıyor.** Para yazmaları artık RLS'i geçiyor; Dilim 3 işini yaptı.

Kötü haber: geriye kalan `AuditEvent` erişimi — yani idempotency anahtarının **kendisi** — sarmalayıcı dışında ve o rol altında reddediliyor. Guard'ın OKUMASI da aynı şekilde kör:

```
guard row visible as fabrika (BYPASSRLS):        1
guard row visible as fabrika_app, no tenant set: 0     <-- guard hiçbir zaman eşleşmez
guard row visible as fabrika_app, tenant set:    1
```

Zinciri sonuna kadar götürünce: `fabrika_app`'e geçilen gün webhook parayı yazar → idempotency anahtarını yazamadan patlar → Stripe tekrar gönderir → guard okuyamadığı için olay baştan işlenir → **her tekrar gönderimde bir aylık kredi tahsisi daha.** Bu tam olarak TASK-MTSY88Q6AMCGB'de kapatılan hata, rol geçişiyle geri açılıyor.

Ve dikkat: bu dilim, başarısızlığın ŞEKLİNİ değiştirdi. Önce "hiçbir şey yazılmadı, güvenle tekrar denenebilir"di; şimdi "para yazıldı, anahtar yazılmadı". Dilim 3 bunu yaratmadı — `AuditEvent`'in kapsam dışı olması yarattı (TASK-MTSZ0AL4QP2CT §3.5, doğru bir karar) — ama ilk kez burada görünür oldu.

Kendi kartımda çözmedim, çünkü çözümü idempotency semantiğini değiştirmek demek ve bu kart onu açıkça yasakladı. Bağlamıyla birlikte yükseltildi: **TASK-MTVSBEO7VX6Y4** (backlog, öncelik 2), üç seçenekli bir 1-3-1 kararı olarak yazıldı. **`fabrika_app` rol geçişinin ön koşuludur.**

### 2.5 `pnpm vitest run src/lib/billing/**` + `tests/invoice-*`

```
$ pnpm vitest run src/lib/billing/ tests/invoice-document.test.ts tests/invoice-fx-tcmb.test.ts \
    tests/invoice-i18n.test.ts tests/stripe-webhook-idempotency.live.test.ts \
    tests/stripe-webhook-tenant-scope.live.test.ts
 Test Files  15 passed (15)
      Tests  266 passed (266)
```

Mevcut canlı idempotency suite'i (TASK-MTSY88Q6AMCGB'nin koruması) dokunulmadan yeşil — 4 testin dördü de gerçekten koştu, `skipIf` ile atlanmadı:
```
 ✓ a redelivered subscription event writes no second audit row 39ms
 ✓ a stale event replayed after a cancellation grants no second allowance 25ms
 ✓ a redelivered cancellation event writes no second audit row 19ms
 ✓ a redelivered invoice payment writes no second audit row 10ms
```

### 2.6 `pnpm typecheck` — ana ağaçta 2 kırmızı var, İKİSİ DE BENİM DEĞİL

```
$ tsc --noEmit
tests/pipeline-surface-tenant-scope.live.test.ts(208,21): error TS2339: Property 'feedbackId' does not exist on type 'SubmitFeedbackResult'.
tests/pipeline-surface-tenant-scope.live.test.ts(213,78): error TS2339: Property 'feedbackId' does not exist on type 'SubmitFeedbackResult'.
```

`lib/feedback/submit.ts` Dilim 2'de (blockzincir-pm), kartımın "DOKUNMA" listesinde. İddia olarak bırakmamak için HEAD üzerinde izole bir worktree kurup **yalnız kendi 3 dosyamı** kopyaladım:

```
$ git -C /tmp/fabrika-cs-probe status --porcelain
 M src/lib/billing/subscription-sync.ts
?? src/lib/billing/subscription-sync-tenant-scope.test.ts
?? tests/stripe-webhook-tenant-scope.live.test.ts

$ tsc --noEmit
TSC EXIT CODE: 0
```

Aynı izole ağaçta tüm birim suite'i:
```
 Test Files  1 failed | 154 passed | 3 skipped (158)
 ❯ tests/i18n-check-script.test.ts (8 tests | 8 failed)
```
Tek kırmızı `i18n-check-script`. Onu da bana ait olmadığını varsaymadım — kendi dosyalarımı worktree'den GERİ ALIP tertemiz HEAD'de koştum:
```
$ git checkout -- … && rm -f (benim 2 yeni dosyam) && git status --porcelain   → (boş)
$ vitest run tests/i18n-check-script.test.ts
 Failed Tests 8 · SyntaxError: "undefined" is not valid JSON
```
Yani `i18n-check-script` HEAD'de zaten kırmızı — mevcut durum, benim değil. Probe worktree `git worktree remove --force` ile kaldırıldı.

Ana ağaçta `vitest run` ayrıca `tests/modules/ai-module-gate.test.ts` ve `tests/modules/module-plan-gate.test.ts`'i de kırmızı gösteriyor (`src/lib/modules/access.ts:88` — Dilim 2, blockzincir-pm'in commit edilmemiş işi); izole ağaçta ikisi de yeşil, dolayısıyla benim değil.

### 2.7 `pnpm rls:verify`

```
Kiracıya özel model: 45 · RLS açık tablo: 52 · tenant_isolation politikası: 45
⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 21 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif): app.tenant_id yokken INSERT reddedildi
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi
✅ 45 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

Script'in kendi uyarısı §2.4'ün gerekçesi: ana bağlantı bugün BYPASSRLS bir rolle bağlanıyor, yani bu 13 çağrı bugün *sadece bu yüzden* çalışıyordu.

### 2.8 `pnpm lint`

```
$ eslint src/lib/billing/subscription-sync.ts src/lib/billing/subscription-sync-tenant-scope.test.ts \
         tests/stripe-webhook-tenant-scope.live.test.ts
(çıktı yok — 0 error, 0 warning)
$ eslint .
(çıktı yok)
```

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/billing/subscription-sync.ts` | 13 tenant çağrısı 3 `withTenant` sarmalayıcısına; iki platform okuması sarmalayıcının üstüne hoist edildi (§1.3); `addOn.update` → `updateMany({id, tenantId})` (§1.4) · +208 / −141 |
| `src/lib/billing/subscription-sync-tenant-scope.test.ts` | **YENİ** — 7 birim testi: sarmalayıcı kullanımı, "sarmalayıcı içinde çıplak istemciye dokunma" kuralı, audit satırının dışarıda kalması |
| `tests/stripe-webhook-tenant-scope.live.test.ts` | **YENİ** — 5 canlı DB testi: tekrar-gönderim satır sayıları, karşı-olgu, fatura, iptal, 10 eşzamanlı webhook |

`prisma/schema.prisma`, `package.json`, `tsconfig.json` değişmedi. Migration yok. Başka ajanların dosyalarına dokunulmadı (`src/lib/inngest/**`, `src/modules/**`, `src/app/**`, `src/components/**`, `pipeline/actions.ts`, `lib/feedback/submit.ts`, `lib/dashboard/fetch-metrics.ts` — hiçbiri açılmadı).

Ölçüm sondaları `.qa-scratch/` altında (gitignore'lu, commit edilmiyor): `measure.ts`, `rls-role-probe.ts`, `audit-guard-probe.ts`.

---

## 4. Riskler

1. **🔴 `fabrika_app` geçişi bu haliyle para hatası üretir** — §2.4. Bu dilimin ürettiği bir risk değil, ama bu dilim sayesinde ölçüldü ve şekli değişti ("hiçbir şey yazılmadı" → "para yazıldı, anahtar yazılmadı"). **TASK-MTVSBEO7VX6Y4** açıldı; rol geçişinden ÖNCE kapatılmalı.
2. **Bir webhook artık bir bağlantıyı transaction süresince tutuyor.** 50 eşzamanlıda bile uçurum ölçülmedi (§2.3), ama havuz `max=10` ve bu değer hiçbir yerde açıkça yazılı değil — pg varsayılanı. `createDbClient`'a bir gün `max` eklenirse ya da transaction içine yavaş bir iş girerse tablo değişir. Kural yazıya döküldü ve teste bağlandı: **sarmalayıcının içinden çıplak singleton'a dokunulmaz** (Mutasyon C).
3. **`syncStripeSubscription` iki transaction açıyor, bir değil.** `publishedVersionIdFor` ikisinin arasında (§1.3). Okuma ile yazma arasındaki pencere dünküyle aynı, ama artık iki `set_config` round-trip'i var. Tek transaction'a indirmek `publishedVersionIdFor`'un `TenantTx` alabilmesini gerektirir — `plan-repository.ts` bu kartın kapsamı dışındaydı.
4. **`.live.test.ts` DB yoksa kendini atlıyor** (`describe.skipIf`). Sessiz yeşil üretebilir. `pnpm gate` zaten `rls:verify` üzerinden DB istiyor, ama bu bağımlılık farkındalıkla taşınmalı — kardeş raporun 3. riski, hâlâ aynı.
5. **`addOn.update` → `updateMany` bir "0 satır" dalı yaratıyor** (§1.4). Bugün erişilemez (id aynı transaction içindeki filtreli okumadan geliyor), ama sessiz bir no-op ihtimali teorik olarak var olmayan bir yerde artık var.

---

## 5. Açık sorular

1. §2.4 için üç seçenekten hangisi? (a) guard'ı `withTenant`'a al (tenantId çıkarımını yukarı taşıyarak), (b) idempotency anahtarını `stripeEventId` üzerinde UNIQUE kısıtlı kendi tablosuna taşı — dosyanın kendi docstring'inin önerisi ve eşzamanlı iki teslimatı da kapatan tek seçenek, (c) `SECURITY DEFINER` fonksiyon. Karar TASK-MTVSBEO7VX6Y4'te.
2. `createDbClient` havuzuna açık bir `max` yazılmalı mı? Bugün pg varsayılanına (10) sessizce güveniliyor ve artık bu sayı transaction sınırıyla birlikte anlam taşıyor.
3. Dilim 5'in allowlist'i bu dosyanın 13 satırını listeden düşürmeli — artık `tx.` üzerinden çağrılıyorlar ve grep onları yakalamayacak.

---

## 6. Sonraki adım

TASK-MTVSBEO7VX6Y4'ü `fabrika_app` rol geçişi kartının bağımlılığı olarak işaretle. Dilim 4 (cron alt-işlemleri) TASK-MTVR8KK92G0GA ile bitmiş görünüyor; kalan Dilim 5 (allowlist + statik kapı) artık 1–4'ün hepsi indiği için başlatılabilir.

---

## 7. Platform beyanı

Doğrulama **macOS**'ta yapıldı (Darwin 25.6.0, zsh, Node v26.5.0, yerel PostgreSQL). Bu kartta dokunulan kodun platforma bağlı hiçbir yanı yok: süreç öldürme, dosya yolu, kabuk/ikili adı, ekran/DPI ya da cihaz izni içermiyor — değişen şey Prisma sorgularının hangi istemci üzerinden koştuğu ve SQL transaction sınırı, ikisi de platformdan bağımsız. Ölçüm sondaları (`pg.Client.prototype.query` yaması, `pg_stat_database`, `set_config`) saf Node + Postgres; Windows ve Linux'ta aynı sonuçları verir. **Windows ve Linux'ta koşulmadı** — bu ofiste yalnız macOS makinesi var; eksikliğin sebebi ortam, kod değil.
