# TASK-MTSHVKTSGC8A4 — Paket stüdyosu ADIM 3 (vitrin)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tarih:** 2026-09-08 · **Dal:** `dev` · **Commit:** `2015fac`

---

## 1. Ne yapıldı

Faz 1 (`b5749bd`) `PlanVersion` / `Plan.visibility` / `PlanAssignment` üçlüsünü kurmuştu ama **hiçbir müşteri yüzeyi bunları okumuyordu**. Kartın iddiası doğrulandı ve kapatıldı: vitrin (fiyat sayfası, faturalandırma paneli, yönetici faturalandırma, sepet çekmecesi) ve checkout artık statik `catalog.ts` yerine **yayınlanmış `PlanVersion` satırlarını** okuyor.

### Yeni kod

| Dosya | Ne yapar |
|---|---|
| `src/lib/billing/storefront.ts` | Vitrin çözümleyicisi. `storefrontPlans(tenantId)` → Faz 1'in `plansVisibleToTenant`/`listPublicPlans`'ını çağırır (şema yeniden tasarlanmadı, Faz 1 **çağrıldı**). `priceLineForTenant()` sunucuda fiyat üretir ve görünmeyen paketi `PlanNotAvailableError` ile reddeder. |
| `src/lib/billing/tenant-tier.ts` | `tierForTenant()` — kiracının fiyat kilidi + aktif kampanya. Checkout ve quote **aynı** fonksiyonu çağırır, ikisi ayrı cevap veremez. |
| `src/app/api/billing/quote/route.ts` | Sepetin fiyatını sunucudan sorar. Ödeme başlatmaz, checkout ile aynı yolu kullanır. |

### Değiştirilen davranış

* **Aritmetik tek yerde kaldı.** `priceLine`'dan `priceEntry(entry, request, tier)` çıkarıldı; storefront bir `PlanVersion` satırını `PricablePlan`'a dönüştürüp **aynı** fonksiyona verir. `YEARLY_DERIVATION` yuvarlama kuralının ikinci bir kopyası yok. `PlanVersion.currency` artık gerçekten kullanılıyor (eskiden `CATALOG_CURRENCY` sabitti).
* **Fiyat SUNUCUDA çözülüyor.** Fiyat sayfası, faturalandırma paneli, yönetici paneli ve kademe tablosu artık tarayıcıda `priceLine()` çağırmıyor — sunucu bileşeni iki döngü için de (aylık/yıllık) hesaplanmış satırları prop olarak geçiyor. TASK-MTR6Q2IODYQRC'nin nöbetçi testi korundu **ve yeni yola da uygulandı** (§2.3).
* **Görünürlük satın almayı da kapatıyor.** Kartı gizlemek sunum; `priceLineForTenant` aynı görünür kümeye karşı çözdüğü için sku elle yazılsa da reddediliyor. "Bilinmeyen paket" ile "sizin değil" tek mesajla cevaplanıyor (numaralandırma sızıntısı yok), ayrım yalnız sunucu log'unda.
* **Ölçülemeyen ≠ sıfır (CLAUDE.md kural 7).** Paket listesi okunamazsa sayfa "fiyat veremiyoruz" der; **statik kataloğa düşmez** — düşseydi tam da stüdyonun değiştirdiği eski rakamı gösterirdi.
* **Sepet kendi fiyatını hesaplamayı bıraktı.** `CartContext` artık `POST /api/billing/quote`'a soruyor. Aksi hâlde çekmece $147 gösterirken checkout $777 tahsil ederdi — düzelttiğim kusurun yeni kılığı.

---

## 2. Kanıt

### 2.1 KIRMIZI — kusur ölçüldü (düzeltmeden ÖNCE)

DB'ye stüdyo yazımı simüle edildi: `pv_ultra_1.monthlyCents = 99900`, `Plan.basic.visibility = 'private'` (0 atama).

```
=== BASELINE: pricing page ultra price with DB at 99900 ===
data-testid="plan-price-ultra" ...>$99,75

=== BASELINE: checkout of plan-ultra monthly, client tries to name 50c ===
{ "totalMinor": 14700, "lines": [{ "sku": "plan-ultra", "amountMinor": 14700 }] }

=== BASELINE: is a PRIVATE, unassigned plan still on the public pricing page? ===
1                                    # plan-card-basic hâlâ orada

=== BASELINE: can it be bought by a tenant it was never assigned to? ===
{"totalMinor":4500,"lines":["plan-basic@4500"]}
```

Ekran karesi: `TASK-MTSHVKTSGC8A4-screenshots/01-before-db-ignored.png` — DB $999 derken kart $99,75; özel paket herkese açık sayfada.

### 2.2 YEŞİL — aynı ölçüm, düzeltmeden SONRA

```
=== GREEN 1: does checkout now charge the studio price for ultra? (client also names 50c) ===
{ "totalMinor": 99900,
  "ignoredClientFields": ["items[0]price","items[0]unitAmount"],
  "lines": [{ "sku":"plan-ultra", "amountMinor": 99900 }] }

=== GREEN 2: can an unassigned tenant buy the private basic plan by naming its sku? ===
{"error":"Unknown plan: plan-basic"}
HTTP 400
```

### 2.3 Gerçek tarayıcı — `tests/e2e/plan-storefront.spec.ts` (10/10)

Ayırt edici rakam `$777.00` seçildi: `catalog.ts`'te böyle bir sayı **yok**, yani geçen bir iddia eski yol olamaz.

```
Running 10 tests using 1 worker
  ✓ 1 the public pricing page quotes the published version, not the catalogue (1.4s)
  ✓ 2 the tenant's billing panel quotes the same published version (929ms)
  ✓ 3 the cart drawer shows the price the server quoted, not one it computed (1.9s)
  ✓ 4 checkout charges the published version, and ignores a price the client names (25ms)
  ✓ 5 it is gone from the public pricing page (986ms)
  ✓ 6 it is gone from an unassigned tenant's billing panel (902ms)
  ✓ 7 and it cannot be bought even when the sku is posted by hand (70ms)
  ✓ 8 the plans that are public are still buyable (20ms)
  ✓ 9 the assigned tenant sees it in its billing panel and can be quoted (887ms)
  ✓ 10 but it stays off the public pricing page, which no session backs (824ms)
  10 passed (8.8s)
```

Kartın istediği **iki ayrı ölçüm** ayrı ayrı yapıldı: test 5/6 "GÖRÜNMÜYOR", test 7 "sku elle verilse bile SATIN ALINAMIYOR" (`plan-basic`, `basic`, `BASIC` üç biçimde). Test 8 boş-doğrulama değil: herkese açık paket hâlâ satın alınabiliyor.

Kareler:
* `02-pricing-page-db-price.png` — Ultra `$777,00`; kademe tablosunun Ultra sütunu da ($233,10 / $310,80 / …) ve ömür-boyu karşılaştırması da ("YIL: $7.770,00", "3 yılda $22.022,00 daha az") $777'den türemiş.
* `03-billing-panel-db-price.png` — kiracı panelinde aynı sürüm.
* `04-private-plan-hidden.png` / `05-private-plan-hidden-panel.png` — Basic kartı iki yüzeyden de yok, Pro/Ultra duruyor.
* `06-private-plan-assigned-visible.png` — atama yapılınca Basic aynı panelde geri geliyor.
* `07-cart-server-quoted.png` — sepet çekmecesi "Toplam ödenecek tutar **$777,00**".

Nöbetçi testin yeni yoldaki hâli (test 4): istek `price: 50, unitAmount: 50, discountPercent: 99` taşıyor; cevap `totalMinor: 77700` ve `ignoredClientFields` üç alanı da adıyla sayıyor.

### 2.4 RLS rolü altında birim ölçüm — `tests/plan-storefront.spec.ts` (10/10)

Yerel `fabrika` rolü SUPERUSER olduğu için ölçüm üretimin kullandığı `fabrika_app` (NOBYPASSRLS) rolüne bağlı client üzerinde yapıldı (bkz. hafıza: `fabrika-local-app-role-bypasses-rls`).

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

**Boş-doğrulama değil.** `storefront.ts`'teki görünürlük araması geçici olarak sökülünce süit kırmızıya döndü:

```
--- with the visibility lookup removed (should go RED) ---
 FAIL  › the price charged is the published version, not the static catalogue
 FAIL  › a campaign discount still applies, and applies to the database figure
 FAIL  › the assigned tenant can see the private plan and be quoted its price
      Tests  3 failed | 7 passed (10)
```
Sökülen satır geri konunca 10/10 yeşil.

### 2.5 Kapı

```
typecheck   : temiz (çıktı yok)
test        : 105 passed | 2 skipped (107 dosya) · 1224 passed | 8 skipped (1232 test)
i18n:check  : ✅ passed — both catalogs agree and every key used in src/ resolves (tr 1327 = en 1327)
rls:check   : ✅ All 42 tenant-scoped models have RLS policies registered
rls:verify  : ✅ Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor
lint        : kendi kapsamımda 0 hata (aşağıya bak)
```

Pre-commit kapısı commit anında temiz raporladı: `✓ Kapı temiz (staged kapsamı).`

**`pnpm gate` repo genelinde KIRMIZI — hepsi başka ajanların uçuşan işi, benim değil:**
* `scripts/_g0-inspect.ts`, `scripts/_g0-whoami.ts` — takip edilmeyen sonda script'leri (7 × `no-explicit-any`).
* `src/types/prisma-override.d.ts` — commit edilmemiş yeniden yazım (3 hata: 167, 203, 203).

Ölçüldü: bu dosyanın **commit'li** hâliyle `npx eslint` çıktısı tamamen boş. Yani üç hata da o ajanın çalışma kopyasına ait. Dosyaya dokunmadım (ölçüm için stash'ledim, hemen geri koydum; `git status` hâlâ `M`).

Koşu sırasında ayrıca `src/lib/__ghost-probe.ts` adlı yabancı bir sonda dosyası test süitini iki testle kırdı, sonra sahibi tarafından silindi; benim değişikliğimle ilgisi yok.

### 2.6 Regresyon taraması

Faturalandırmaya komşu e2e'ler:
```
tests/e2e/{price-lock,price-lock-deeper-campaign,plan-entitlement,module-plan-gate,billing-invoice-history,admin-plan-editor}.spec.ts
  1 skipped · 22 passed (23.7s)
```
Fiyat kilidi sözü yeni yolda da duruyor: *"checkout charges the locked rate, not the campaign of the day"* ✓. (Atlanan tek test `BILLING_ACTIVE_TIER` gerektiren, koşuldan bağımsız bir atlama.)

Tam e2e süiti (`npx playwright test`): **114 passed, 1 skipped, 8 failed**. Sekizini tek tek kovaladım — **hiçbiri benim değil:**

| Fail | Teşhis |
|---|---|
| `fabricated-fallbacks` (4 test), `f10-absence-not-zero`, `feedback` | Tek başına koşunca **geçiyor** → paylaşılan kiracı üzerinden spec'ler arası girişim; bilinen açık kart **TASK-MTS9C07AQ6DNO** (`review`). |
| `st6-empty-tenant-no-fabrication:127` | Değişikliklerim park edilerek **kontrol koşusu** yapıldı: o hâlde de FAIL → önceden var olan kusur, benim değil. |
| `render-purity-refactor:79` | Kontrol koşusunda geçti, ama değişikliklerim geri konduktan sonra üst üste **3/3 geçti** (11s / 37s / 11s). Zamanlamaya duyarlı bir yükleme testi + `calls/page.tsx` başka bir ajanın elinde. Flake. |

### 2.7 Veritabanı geri bırakıldı

Her fixture kendi satırını geri alıyor; koşu sonrası doğrulandı:
```
Plan       : basic/free/pro/ultra = public
PlanVersion: basic 4500/38700 · free 0/0 · pro 8700/74700 · ultra 14700/119700
Assignment : 0
leftover fixtures: []
```

---

## 3. Değişen dosyalar

**Yeni**
* `src/lib/billing/storefront.ts`
* `src/lib/billing/storefront.test.ts` (10 test: okunamayan liste, `free`'nin satılamazlığı, para birimi, kademe tablosu, reddetme)
* `src/lib/billing/tenant-tier.ts`
* `src/app/api/billing/quote/route.ts`
* `tests/plan-storefront.spec.ts` (RLS rolü altında, 10 test)
* `tests/e2e/plan-storefront.spec.ts` (gerçek tarayıcı, 10 test)
* `tests/helpers/storefront-plans.ts`
* `docs/agent-results/TASK-MTSHVKTSGC8A4-screenshots/01–07`

**Değişen**
* `src/lib/billing/catalog.ts` — `priceEntry` çıkarıldı, `PricablePlan` eklendi, satır para birimi artık `entry.currency`
* `src/app/api/billing/checkout/route.ts` — `priceLineForTenant`; yerel `lockedRateFor` paylaşılan `tierForTenant`'a taşındı
* `src/app/[locale]/pricing/{page,PricingClient}.tsx`
* `src/app/[locale]/(app)/[workspace]/settings/billing/{page,BillingClient}.tsx`
* `src/app/[locale]/admin/billing/{page,client}.tsx`
* `src/components/cart/{CartContext,CartDrawer}.tsx`
* `messages/{tr,en}.json` — 8 yeni anahtar (her ikisine de; i18n kapısı yeşil)
* `tests/billing-settings-{invoices,lifetime-badge}.test.tsx` — yeni prop'lar için fixture

---

## 4. Riskler

1. **Vitrin ile hak-ediş hâlâ iki ayrı kaynaktan.** Fiyat `PlanVersion`'dan, **ne verildiği** (`seats`/`workspaces`/`aiCreditsMonthly`/`modules`) hâlâ `PLAN_GRANTS`'ten (`src/lib/billing.ts:getEntitlements` → `grantsFor(planId)`). Bu yüzden kart metinlerindeki kota satırlarını **bilerek** DB'den türetmedim: türetseydim ürünün tutmayacağı bir söz basmış olurdum. Mevcut hâl tutarlı ama eksik — ayrıntı §5.1.
2. **Sepet artık ağa bağımlı.** Quote isteği başarısız olursa toplam `—` gösterilir ve "Ödemeye geç" düğmesi kapanır. Bu bilinçli (yanlış rakam yerine rakam yok), ama çevrimdışı bir kullanıcı için eskisinden daha kısıtlayıcı.
3. **Ömür-boyu banner'ı artık Ultra'nın görünürlüğüne bağlı.** Ultra vitrinden kalkarsa banner da kalkar — karşılaştıracak bir abonelik fiyatı kalmadığı için doğru davranış, ama davranış değişikliği.
4. `Plan.free` satırı vitrinden `FALLBACK_PLAN_ID` ile eleniyor; `Plan` tablosunda "satılabilir mi" sütunu yok. Stüdyo ileride gerçekten yeni paket üretebilir hâle gelirse bu kuralın sütunlaşması gerekir.

---

## 5. Açık sorular (sprintin sıradaki gündemi — ben DÜZELTMEDİM)

### 5.1 Stüdyo fiyatı değiştiriyor ama HAKKI değiştirmiyor — P1
`getEntitlements` `PLAN_GRANTS`'i okuyor, `PlanVersion`'ı değil. Stüdyoda Pro'nun koltuğunu 6→10 yapıp yayınlarsanız **fiyat değişir, koltuk değişmez**. `Subscription.planVersionId` sütunu şemada duruyor ve hiç yazılmıyor — kapatacak yol bu. Kart metni "vitrin" dediği için kapsam dışı bıraktım; ayrı kart ister.

### 5.2 Kart metinlerindeki kotalar hâlâ elle yazılı — P2
`billingPanels.settings.plans.<id>.{seats,credits,modules}` ve `pricing.plans.<id>.f1..f6` sabit rakam taşıyor ("6 kullanıcı", "2.000 YZ kredisi", "En fazla 15 ekip üyesi"). `catalog.test.ts`'teki nöbetçi bunları `grantsFor()`'a bağlıyor — yani bugün **doğru**. 5.1 kapandığı gün bu metinler de `PlanVersion`'dan türetilmeli, yoksa yayınlanan sürüm ile kart metni ayrışır.

### 5.3 Stüdyo yeni paket ÜRETEMİYOR — P2
`plan-repository.ts`'te `createPlan` yok; yalnız dört tohum paketin yeni **sürümü** açılabiliyor, görünürlüğü ve ataması değiştirilebiliyor. "Stüdyoda açılan paket" bugün pratikte "yeniden fiyatlandırılmış/özelleştirilmiş mevcut paket" demek. Vitrin tarafı rastgele `planId`'yi zaten taşıyor (birim testte `bespoke`/`eur-plan` ile doğrulandı), eksik olan yazma tarafı.

### 5.4 `src/types/prisma-override.d.ts` çalışma kopyası kapıyı kırıyor — P2 (sahibi bilinmiyor)
Commit edilmemiş hâli 3 eslint hatası veriyor (`no-unsafe-declaration-merging` ×2, `no-empty-object-type`). Commit'li hâli temiz. Kim üzerinde çalışıyorsa commit'ten önce görmeli.

### 5.5 `scripts/_g0-*.ts` ve `scripts/_cs-st6-*.ts` sonda dosyaları repoda duruyor — P3
`.gitignore` bunları eslint/tsc'den gizlemiyor (hafıza: `fabrika-gitignore-does-not-hide-a-file-from-the-gate`). `_g0-*` şu an kapıyı kırıyor. Sahipleri silmeli.

### 5.6 `st6-empty-tenant-no-fabrication.spec.ts:127` önceden kırık — P2
"the header bell carries no feed of its own" — benim değişikliklerim park edilmiş kontrol koşusunda da FAIL. Bildirim zili tarafında gerçek bir kusur ya da bayat bir test; ayrı kart ister.

### 5.7 Add-on kartları hâlâ fiyatsız — P3
`BillingClient`'taki `UNPRICED_ADDONS` (`credits500`, `credits1500`, `addonM6`) kataloğa girmediği için checkout onlara 400 veriyor. `AddOnCatalog` tablosu var; vitrin şimdi DB'den okuduğuna göre add-on'ları da oradan okumak artık küçük bir iş.

---

## 6. Sonraki adım

1. Lider kararı: kart `review` → `done` mı, yoksa **5.1** (hak-edişi `PlanVersion`'a bağlama + `Subscription.planVersionId` yazımı) aynı karta mı ekleniyor. Öneri: **ayrı kart** — vitrin uçtan uca doğrulandı, hak-ediş ayrı bir katman ve ayrı bir regresyon yüzeyi.
2. **5.4** ve **5.5** sahiplerine iletilmeli; `pnpm gate` repo genelinde onlar temizlenmeden yeşile dönmez.
3. TASK-MTS9C07AQ6DNO (e2e paylaşılan kiracı girişimi) kapanınca tam süit tek koşuda ölçülebilir hâle gelir; bugün "tek başına yeşil, hep birlikte kırmızı" ayrımını elle yapmak gerekiyor.
