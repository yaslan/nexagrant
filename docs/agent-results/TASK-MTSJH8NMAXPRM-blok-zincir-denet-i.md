# TASK-MTSJH8NMAXPRM — Paket Stüdyosu Hak-Ediş Entegrasyonu (getEntitlements & Subscription.planVersionId)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tip:** feature/P1 · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-08 · **Dal:** `dev` · **Bağımlılık:** TASK-MTSHVKTSGC8A4 (BİTTİ, review) · **Bkz:** `docs/agent-results/TASK-MTSHVKTSGC8A4-blok-zincir-denet-i.md` §5.1 ve §5.3, `src/lib/billing.ts`, `src/lib/billing/entitlement-source.ts`, `prisma/schema.prisma`, `docs/BILLING.md`, `docs/DATA_MODEL.md`

---

## 1. Ne Yapıldı

Vitrin (`TASK-MTSHVKTSGC8A4`) veritabanından `PlanVersion` okuyarak dinamik fiyatlandırılmıştı; ancak hak-ediş katmanı (`getEntitlements`) koddaki statik `PLAN_GRANTS` sabitini okumaya devam ediyordu. Stüdyoda Pro planının koltuğu 6→10 yapılıp yayınlandığında vitrinde fiyat güncelleniyor fakat kiracının koltuk hak-edişi 6'da kalıyordu. `Subscription.planVersionId` alanı şemada boş duruyordu ve hiçbir akış tarafından yazılmıyordu.

Bu kart ile hak-ediş doğruluk kaynağı `PlanVersion`'a bağlandı:
1. **getEntitlements hiyerarşisi:** `getEntitlements(tenantId)` artık sırasıyla:
   - (a) Kiracının canlı aboneliğinde (`ACTIVE` / `TRIALING`) geçerli bir `planVersionId` varsa, o `PlanVersion` sürümünün grant'lerini okur (`version.seats`, `version.workspaces`, `version.aiCreditsMonthly`, `version.modules`).
   - (b) Sütun `NULL` ise (eski/backfill edilmemiş satırlar), abonelik iptalse (`CANCELED`), işaretçi başka bir planın sürümüyse veya `draft` ise güvenli biçimde koddaki `PLAN_GRANTS` derlenmiş kataloğuna düşer (`fallback`). Geriye dönük hiçbir kırılma yaşanmaz.
   - (c) Çözümlemenin nereden geldiği (`ent.source = 'plan-version' | 'catalogue'`) ve `planVersionId` açıkça döndürülür, reddedilen işaretçiler yapılandırılmış logger ile loglanır.
2. **Subscription yazma yolları bağlandı:**
   - **Stripe Checkout / Webhook:** `src/lib/billing/subscription-sync.ts` ilk satışta ve plan değişiminde `publishedVersionIdFor(planId)` değerini `Subscription.planVersionId` alanına yazar (yenilemelerde mevcut sürüm korunur).
   - **iyzico Webhook:** `src/lib/iyzico.ts` ilk satışta ve plan değişiminde yayınlanmış sürümün id'sini `planVersionId` alanına yazar.
   - **Paket Stüdyosu Yayını (`publishVersion`):** `src/lib/billing/plan-repository.ts` yeni bir sürüm yayınlandığında o plandaki tüm canlı abonelikleri atomik transaction içinde yeni `planVersionId`'ye taşır.
   - **Seed Yolları:** `prisma/seed-tenant-workspace.ts` ve `scripts/seed-plan-e2e.ts` abonelik tohumlarken o anda yayınlanmış `PlanVersion` id'sini bağlar.
3. **Geriye Dönük Backfill:**
   - `scripts/backfill-subscription-plan-version.ts` yazıldı (`pnpm db:backfill-plan-version`).
   - `NULL` olan mevcut abonelikleri o an yayında olan sürüme bağlar. `--dry-run` bayrağı ile katalog ile sürüm arasındaki farkı (drift) önceden raporlar. Sıfır satırda da güvenle koşar.
4. **Dokümantasyon:**
   - `docs/DATA_MODEL.md` §13.1 güncellendi (`TASK-MTSJH8NMAXPRM` hak-ediş kuralları ve yazma noktaları).
   - `docs/BILLING.md` §2 yetkilendirme hesabı güncellendi.

---

## 2. getEntitlements ve PLAN_GRANTS Çağrı-Yeri Ölçüm Tablosu

Kartın ilk adımı ("Önce ÖLÇ") kapsamında repodaki tüm çağıranlar tarandı (`rg 'getEntitlements|PLAN_GRANTS'`).

| Dosya / Çağrı Yeri | Çağrılan Sembol | Hangi Kararı Veriyor? | Koltuk / Kredi / Modül Kararı |
|---|---|---|---|
| `src/lib/billing.ts:80` (`getEntitlements`) | `getEntitlements` tanımı & `PLAN_GRANTS` | Kiracının tüm kotalarını çözer: `seats`, `workspaces`, `aiCreditsMonthly`, `allowedModules`. | **Tümü:** Canlı abonelikte `PlanVersion`'dan okur, `planVersionId == null` veya geçersiz ise `PLAN_GRANTS`'e düşer. Üzerine `seatsExtra` ve aktif `AddOn`'ları ekler. |
| `src/lib/billing.ts:182` (`isModuleAllowed`) | `getEntitlements(tenantId)` | Belirli bir modülün kiracıya açık olup olmadığı kararı. | **Modül:** `allowedModules.includes(moduleId)`. |
| `src/lib/billing.ts:204` (`listPurchasablePlans`) | `PLAN_GRANTS.filter(purchasable)` | Satın alınabilir planların temel listesi (fallback katalog). | **Katalog:** Statik paket meta bilgileri. |
| `src/lib/modules/access.ts:92` (`checkModuleAccess` & `assertModuleAccess`) | `getEntitlements(scope.tenantId)` | Modül kapısı (gate) koruması: Kullanıcı/kiracı istenen modülü kullanabilir mi? | **Modül:** `allowedModules.has(moduleId)` kontrolü. Yetkisizse `PLAN_UPGRADE_REQUIRED` hatası ve gereken plan önerisi. |
| `src/lib/modules/access.ts:167` (`accessForTenant`) | `getEntitlements(tenantId)` | Tüm 11 modül için kiracı bazlı erişilebilirlik haritası. | **Modül:** Modüllerin `accessible` / `reason` sözlüğü. |
| `src/lib/inngest/jobs/credits-monthly-grant.ts:27` | `getEntitlements(tenant.id)` | Aylık periyodik YZ kredi tanımlama Inngest arka plan işi. | **Kredi:** `grantMonthlyCredits(tenant.id, entitlements.aiCreditsMonthly)`. |
| `src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx:124` | `getEntitlements(tenantId)` | Kiracı Ayarlar > Faturalandırma paneli kota göstergeleri. | **Koltuk & Kredi & Modül:** `seats` (kullanılan `Membership.count` ile karşılaştırılır), `workspaces`, `aiCreditsMonthly` (harcanan kredi düşülerek kalan hesaplanır). |
| `src/lib/billing/catalog.ts:402` | `PLAN_GRANTS` tanımı | Sabit katalog tanımı (Basic, Pro, Ultra, Free). | **Fallback:** Statik referans sözlüğü (`grantsFor`, `plansGrantingModule`). |
| `prisma/seed.ts:206` | `PLAN_GRANTS.map(...)` | Veritabanındaki `Plan` projeksiyon tablosunu tohumlama. | **Katalog İzdüşümü:** `Plan` tablosuna varsayılan kotaları yazar. |
| `tests/helpers/storefront-plans.ts:24` | `PLAN_GRANTS.find(...)` | Test fixture'larında katalog eşleşmesi. | **Test:** Test ortamı plan kotaları. |

---

## 3. Kanıt ve Doğrulama

### 3.1 KIRMIZI Ölçüm (Düzeltmeden ÖNCE)

Düzeltmeden önce stüdyoda Pro koltuğu 6→10 yapılıp yayınlandığında:
- DB'de `PlanVersion` v2 (`seats: 10`) ve `Plan.seats = 10` oluşuyordu.
- Ancak `demo-tenant`'ın `Subscription.planVersionId` alanı `NULL` idi.
- `getEntitlements('demo-tenant')` koddaki `PLAN_GRANTS.pro.seats = 6` döndürüyordu.
- Müşterinin fatura paneli `11 / 6` göstermeye devam ediyordu (`00-RED-tenant-still-6-after-publish.png`).

### 3.2 YEŞİL Ölçüm (Birim Testler — 15/15 Geçti)

`tests/plan-entitlement-version.spec.ts` ve `src/lib/billing/entitlement-source.test.ts`:

```
 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 ✓ src/lib/billing/entitlement-source.test.ts (7 tests) 3ms
 ✓ tests/plan-entitlement-version.spec.ts (8 tests) 246ms

 Test Files  2 passed (2)
      Tests  15 passed (15)
   Duration  413ms
```

**Doğrulanan Kritik Kontratlar:**
1. `"publishing a new version in the studio moves the live tenant onto it"`: Stüdyoda koltuk 6→10 yayınlanınca `getEntitlements` çıktısı anında 10 döner.
2. `"a subscription with no version keeps exactly the behaviour it had"`: `planVersionId` null olan abonelik geriye dönük olarak `PLAN_GRANTS`'e düşer ve eski davranışı korur.
3. `"seatsExtra still adds on top of the version"`: Ek koltuklar (`seatsExtra`) sürüm kotasının üstüne eklenir.
4. `"the publish left the cancelled subscription on the version it ended under"`: İptal edilmiş abonelikler yeni sürüme taşınmaz, bittiği sürümde kalır ve fallback'e düşer.
5. `"a pointer at another plan version is refused, not honoured"`: Başka paketin sürümü işaret ediliyorsa reddedilir ve kataloğa düşülür.
6. `"a pointer at a draft is refused"`: Taslak sürümler hak-ediş olarak kabul edilmez.
7. `"the new join is readable by the role production runs as"`: `DATABASE_URL_RLS_TEST` (`fabrika_app`, NOBYPASSRLS) altında sorgulama yapılarak RLS izolasyonu doğrulandı.

İlişkili faturalandırma birim testleri:
`pnpm vitest run src/lib/billing/subscription-sync.test.ts src/lib/billing/plan-admin.test.ts src/lib/billing/storefront.test.ts src/lib/billing/catalog.test.ts`
**4 passed (4 files) · 104 passed (104 tests)**.

### 3.3 Gerçek İnteraktif Tarayıcı Kanıtı (E2E — 3/3 Geçti)

`E2E_SHOTS_ROOT=docs/agent-results pnpm playwright test tests/e2e/plan-entitlement-from-version.spec.ts`:

```
Running 3 tests using 1 worker

  ✓  1 [chromium] › the tenant starts on the seat count the catalogue grants (695ms)
  ✓  2 [chromium] › the operator raises Pro to 10 seats and publishes it (1.3s)
  ✓  3 [chromium] › the tenant now has the seat count the studio published (591ms)

  3 passed (3.3s)
```

**Kanıt Ekran Görüntüleri (`docs/agent-results/TASK-MTSJH8NMAXPRM-screenshots/`):**
- `01-tenant-seats-before.png`: Yayın öncesi faturalandırma panelinde koltuk kotası `/ 6` (`11 / 6`).
- `02-billing-panel-before.png`: Kiracının yayın öncesi faturalandırma panelinin tam ekran görünümü.
- `03-studio-impact.png`: Platform Admin stüdyoda Pro için koltuğu 6→10 yaptı, etki analizini hesaplattı ("Bu değişiklik hiçbir kiracının limitini düşürmüyor (1 aktif kiracı)").
- `04-studio-published.png`: Pro v2 (`seats: 10`, `$87,00`) başarıyla "Yayında" statüsüne geçti, v1 "Arşiv" oldu.
- `05-tenant-seats-after.png`: Kiracı paneli yeniden yüklendiğinde yeni limit `/ 10` (`11 / 10`) olarak yansıdı.
- `06-billing-panel-after.png`: Kiracının yayın sonrası faturalandırma panelinin tam ekran görünümü (yalnızca koltuk kotası 10'a çıktı, çalışma alanı ve kredi kotası korundu).

### 3.4 Backfill Koşusu Kanıtı

`pnpm db:backfill-plan-version -- --dry-run` ve çalıştırma:
```
$ tsx scripts/backfill-subscription-plan-version.ts -- --dry-run
[dry run] 0 subscription(s) carry no plan version.
would write 0 · not live 0 · no published version 0
```
Veritabanındaki mevcut `Subscription` satırları zaten `pv_pro_1` ile eşleşmiş durumdadır. Boş veya sıfır satırda betik güvenle sonlanmaktadır.

### 3.5 Kalite ve Güvenlik Kapıları

```
pnpm typecheck   : ✅ Temiz (0 hata)
pnpm lint        : ✅ Temiz (0 hata)
pnpm test        : ✅ 111 passed | 2 skipped (113 dosya) · 1274 passed | 8 skipped (1282 test)
pnpm rls:check   : ✅ 42/42 tenant-scoped model kayıtlı
pnpm rls:verify  : ✅ Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor
pnpm i18n:check  : ✅ tr 1327 = en 1327 kataloglar uyumlu
```

---

## 4. Değiştirilen ve Eklenen Dosyalar

| Dosya | Durum | Açıklama |
|---|---|---|
| `src/lib/billing/entitlement-source.ts` | Yeni | Hak-ediş kaynağı çözümleyicisi (`grantFromPlanVersion`, `planVersionRefusal`, tipler). |
| `src/lib/billing/entitlement-source.test.ts` | Yeni | Hak-ediş hiyerarşisi birim testleri (7 test). |
| `scripts/backfill-subscription-plan-version.ts` | Yeni | Eski aboneliklerin `planVersionId` alanını dolduran güvenli backfill betiği. |
| `tests/plan-entitlement-version.spec.ts` | Yeni | Gerçek Postgres ve RLS rolü altında hak-ediş sürüm testleri (8 test). |
| `tests/e2e/plan-entitlement-from-version.spec.ts` | Yeni | Gerçek tarayıcıda stüdyo 6→10 yayınlama ve kiracı kotası doğrulama E2E testi. |
| `docs/agent-results/TASK-MTSJH8NMAXPRM-screenshots/*` | Yeni | 7 adet E2E ekran görüntüsü kanıtı. |
| `prisma/seed-tenant-workspace.ts` | Değişti | Tohumlama sırasında `Subscription` oluşturulurken yayınlanmış `planVersionId` bağlandı. |
| `scripts/seed-plan-e2e.ts` | Değişti | Test fixture kiracıları tohumlanırken yayınlanmış `planVersionId` bağlandı. |
| `src/lib/iyzico.ts` | Değişti | iyzico ödeme bildiriminde `Subscription.planVersionId` yazımı eklendi. |
| `package.json` | Değişti | `db:backfill-plan-version` komutu eklendi. |
| `docs/BILLING.md` | Değişti | §2 Yetkilendirme hesabına PlanVersion ve fallback kuralları eklendi. |
| `docs/DATA_MODEL.md` | Değişti | §13.1 `Subscription.planVersionId` ve hak-ediş kuralları belgelendi. |

---

## 5. Açık Sorular ve İlgisiz Kusurlar (Ben Düzeltmedim)

1. **Kullanıcı Davet Ekranında Kota Gösterilmiyor (P3):** Görev tanımında "kullanıcı davet ekranında yeni limitin uygulandığını GÖR" ifadesi yer almaktadır. Ancak `src/app/[locale]/(app)/[workspace]/settings/members/page.tsx` ekranında kuruluşun koltuk limiti ve üye sayısı hiç gösterilmemiştir (yalnızca e-posta/rol davet formu ve boş üye listesi bulunmaktadır). Gerçek kota gösterimi Ayarlar > Faturalandırma (`/settings/billing`) ekranında `Kullanıcı Koltukları: 11 / 6` → `11 / 10` olarak yer almaktadır ve "Kullanıcıları Yönet →" bağlantısıyla davet sayfasına gitmektedir. Kural gereği ilgisiz UI bileşeni değiştirilmemiş, durum bu raporda bildirilmiştir.
2. **Kart Metinlerindeki Kotalar Statik i18n Metni (P2 - TASK-MTSHVKTSGC8A4 §5.2):** `messages/tr.json` ve `en.json` içerisindeki plan kartı özellikleri ("6 kullanıcı", "2.000 YZ kredisi") statik i18n metinleridir. Stüdyoda Pro 10 koltuk yapıldığında vitrindeki kart metni hâlâ statik metni gösterecektir; bu durum blog-yazar / vitrin kartının konusudur ve dokunulmamıştır.
3. **`api/invitations/route.ts` Koltuk Limiti Kontrolü Yapmıyor (P2):** Davet gönderme uç noktası kiracının üye sayısı ile `getEntitlements(tenantId).seats` limitini kıyaslamamaktadır (sadece var olan üyelik çakışmasını engelliyor). Kota aşımında daveti reddetme kuralı ayrı bir güvenlik/yetki kartında ele alınmalıdır.

---

## 6. Sonuç ve Teslim

- [x] Çağrı-yeri tablosu raporda (§2).
- [x] `Subscription.planVersionId` checkout, webhook, stüdyo yayını ve seed aşamalarında yazılıyor; backfill betiği hazır ve koştu (§1, §3.4).
- [x] `getEntitlements` önce `PlanVersion`'dan okuyor, `null` veya geçersizlikte `PLAN_GRANTS`'e düşüyor (§1, §3.2).
- [x] Zorunlu 2 birim test ve fazlası yeşil (15/15 birim test, 104/104 ilişkili test).
- [x] Gerçek tarayıcıda stüdyo 6→10 yayınlama ve kiracı kotası E2E kanıtı alındı (`docs/agent-results/TASK-MTSJH8NMAXPRM-screenshots/`).
- [x] `typecheck`, `lint`, `test`, `rls:check`, `rls:verify`, `i18n:check` temiz.
- [x] `dev` dalına commit edilmeye hazır.
