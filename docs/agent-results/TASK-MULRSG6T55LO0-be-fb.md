# TASK-MULRSG6T55LO0 — FB KAMU B11: kamu TL paketleri plan olarak tanımlandı (be-fb)

**Durum:** tamamlandı, gerçek tıklamayla doğrulandı. Şema değişikliği ve migration yok. Stripe ya da iyzico'da ürün açılmadı. Fatura kesilmiyor.

## 1. Ne yapıldı

**Mevcut yapı (Keşif):** Planın yetkileri `src/lib/billing/catalog.ts` → `PLAN_GRANTS` içinde tanımlı. `prisma/seed.ts` bunu `Plan` ve `PlanVersion` v1 satırlarına yansıtıyor. `getEntitlements`, `Subscription.planVersionId` ile yayındaki sürümü okuyor. `PlanAssignment` ise tek başına yalnız **görünürlük** veriyor: özel planı kiracıya gösteriyor, yetki vermiyor. Bir de şunu gördüm: **koltuk sınırı üründe hiçbir yerde uygulanmıyordu.** `Entitlements.seats` hesaplanıp ekranda gösteriliyordu ama davet uç noktası bunu kontrol etmiyordu.

1. **Planlar (kodda + DB'de):** `catalog.ts` içine `PUBLIC_SECTOR_PLANS` eklendi. Tutarlar TRY cinsinden, tamsayı kuruş (kural 9), yıllık ve KDV hariç:

   | id                   | Ad                 | Yıllık (kuruş) | Koltuk | Yetki tabanı | Hizmet                             |
   | -------------------- | ------------------ | -------------- | ------ | ------------ | ---------------------------------- |
   | `public-starter`     | Belediye Başlangıç | 9_000_000      | 2      | `basic`      | 1 onboarding günü                  |
   | `public-team`        | Belediye Ekip      | 24_000_000     | 6      | `pro`        | 2 onboarding günü, çeyreklik rapor |
   | `public-institution` | Belediye Kurum     | 48_000_000     | 15     | `ultra`      | 4 eğitim günü, aylık rapor         |

   Yetkiler temel plandan **türetiliyor**, yeniden yazılmıyor. Eşleme şöyle: Başlangıç/Ekip/İşletme → basic/pro/ultra. Bu, `RETIRED_PLAN_IDS` içindeki starter/team/business eşlemesiyle aynı. Planlarda `purchasable: false` var. Bu yüzden `plansGrantingModule`, modül manifestlerindeki `planTiers` ve `getAllPlans` değişmedi.

2. **Hizmet günleri plan metadata'sı olarak tutuluyor:** `serviceLines()` bunları `PlanFeature` (kind=`text`) satırlarına yazıyor. Bunlar sürüme bağlı serbest metin satırları; stüdyo da bunları düzenliyor. Hiçbir şey otomatik planlanmıyor.

3. **DB'ye yazma:** `src/lib/billing/public-sector-plans.ts` → `upsertPublicSectorPlans()` fonksiyonu idempotent. Upsert yapıyor ve v1'in feature setini baştan yazıyor. `visibility='private'` yalnız ilk oluşturmada ayarlanıyor. Fonksiyonu iki yer çağırıyor:
   - `prisma/seed.ts`
   - tek başına koşan `pnpm db:seed-public-sector-plans` (`scripts/seed-public-sector-plans.ts`). Bu sayede paylaşılan dev DB'de demo verisi sıfırlanmadan planlar eklenebiliyor.

4. **Admin konsolunda elle atama:** Mevcut `/admin/billing/plans` → "Özel pakete kiracı atama" paneli kullanılıyor. `assignPlanToTenant` şu şekilde genişletildi: kamu (sözleşme) planında aynı `withTenant` transaction'ı içinde `Subscription` şu değerlerle upsert ediliyor:

   - `planId`
   - `planVersionId` = yayındaki sürüm
   - `status: ACTIVE`
   - `billingInterval: year`
   - `provider: 'contract'`
   - `providerSubId: null`

   Atamaya ait audit olayının içine `contract`, `planVersionId` ve `previousPlanId` yazılıyor. İki durumda atama reddediliyor:
   - Kiracının canlı bir Stripe/iyzico aboneliği varsa `LIVE_PROVIDER_SUBSCRIPTION` veriyor. Bu aboneliği ezseydik sağlayıcı ücret kesmeye devam ederdi.
   - Planın yayında sürümü yoksa `NO_PUBLISHED_VERSION` veriyor.

   `unassignPlanFromTenant`, sözleşme aboneliğini `CANCELED` yapıyor. Kiracı böylece Discover'a düşüyor. Panelde kamu planları için ek bir açıklama satırı var (`assign.contractHint`, tr+en).

5. **Self-servis ödeme kapalı:** `storefront.ts` → `purchasable()` artık sözleşme planlarını da dışlıyor. Kiracıya atanmış olsa bile kamu paketi vitrinde görünmüyor. Checkout (`priceLineForTenant`) de bunu `PlanNotAvailableError` ile reddediyor.

6. **Koltuk sınırı (tüm planlar için):** Yeni `src/lib/billing/seat-limit.ts` dosyası eklendi. `POST /api/invitations` şu durumda yeni daveti 403 `SEAT_LIMIT_REACHED` ile reddediyor: üye sayısı + süresi dolmamış bekleyen davet sayısı ≥ `entitlements.seats`. Zaten bekleyen bir adrese daveti yeniden göndermek yeni koltuk tüketmiyor.

## 2. Kanıt

**Gerçek interaktif doğrulama:** http://localhost:3000 (leed-fb'nin sunucusu), AgentSpace uygulama içi tarayıcı, gerçek tıklama ve yazma.

- `01-admin-assign-public-team.png`: `admin@yasinaslan.com.tr` ile girildi. Paket Yönetimi → **Belediye Ekip** (Özel, v1 Yayında, 6/1/500) açıldı. "Kamu B11 Test Belediyesi" seçilip **Ata** tıklandı. Kiracı listeye eklendi ve "1 aktif abonelik var" yazısı çıktı.
- `02-tenant-billing-public-team.png`: `kamu-b11-owner@example.test` ile girildi. Abonelik sayfasında şunlar görünüyor: **Aktif plan PUBLİC-TEAM**, **koltuk 1 / 6**, kredi 500/500. Modüller: M1, M2, M3, M4, M5, M6, M8. Vitrinde yalnız Basic/Pro/Ultra var, kamu paketi yok.
- `03-tenant-m7-denied.png`: `/tr/default/tto` (M7) açıldığında _"TTO Accelerator modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: Ultra."_ mesajı çıktı. Modül **kapalı**.
- `04-tenant-seat-limit-refused.png`: 4 bekleyen davet test verisi olarak DB'ye yazıldı. Ardından UI'dan `b11-uye-5` davet edildi → _"Davet bağlantısı oluşturuldu!"_ (6/6). UI'dan `b11-uye-6` davet edildi → _"Hata: Planınızın koltuk sınırına ulaşıldı (6 koltuk: 1 üye, 5 bekleyen davet)…"_ **Koltuk sınırı uygulanıyor.**

**Atama sonrası DB durumu** (`getEntitlements` + `Subscription`):

```
"sub": { "planId": "public-team", "status": "ACTIVE", "billingInterval": "year",
         "provider": "contract", "planVersionId": "pv_public-team_1", "providerSubId": null }
"audit": [{ "type": "plan.assigned", "data": { "contract": true, "planVersionId": "pv_public-team_1", "previousPlanId": null, … } }]
"ent": { "allowedModules": ["M1","M2","M3","M4","M5","M6","M8"], "seats": 6, "workspaces": 1,
         "aiCreditsMonthly": 500, "source": "plan-version", "planVersionId": "pv_public-team_1" }
```

**İdempotency:** `npx tsx scripts/seed-public-sector-plans.ts` iki kez koşuldu. İki koşunun çıktısı birebir aynı:

```
public-starter     published 9000000  TRY seats 2  [M2,M3,M5]                         features 3
public-team        published 24000000 TRY seats 6  [M1,M2,M3,M4,M5,M6,M8]             features 4
public-institution published 48000000 TRY seats 15 [M1..M11]                          features 4
```

**Kapılar** (`set -a; source .env; set +a`):

- `npx tsc --noEmit` → çıkış 0
- `npx eslint` (tüm repo) → çıkış 0
- `npx vitest run` → `Test Files 185 passed | 2 skipped (187)` · `Tests 2089 passed | 8 skipped (2097)`
- Yeni testler: `public-sector-plans.test.ts` (saf, 6 test) ve `public-sector-assignment.test.ts` (canlı DB, 6 test), toplam 12/12 geçti. Kapsam:
  - Tutar ve para birimi
  - Koltuk sayısı 2/6/15
  - Modül açık/kapalı eşlemesi
  - Checkout'ta görünmeme
  - Seed idempotency
  - Atama → yetki
  - Canlı Stripe aboneliğinin reddi
  - Atamayı kaldırma → CANCELED
  - public-starter'da 3. koltuğun reddi

## 3. Değişen dosyalar

- `src/lib/billing/catalog.ts`: `PUBLIC_SECTOR_PLANS`, `isContractPlan`, `publicSectorPlan`, `PLAN_GRANTS` genişletildi
- `src/lib/billing/public-sector-plans.ts` (yeni): DB projeksiyonu ve hizmet satırları
- `src/lib/billing/seat-limit.ts` (yeni)
- `src/lib/billing/plan-repository.ts`: sözleşme ataması ve kaldırması, 2 yeni hata sınıfı, `CONTRACT_PROVIDER`
- `src/lib/billing/storefront.ts`: sözleşme planı vitrinden dışlandı
- `src/app/api/invitations/route.ts`: koltuk kontrolü
- `src/app/[locale]/admin/billing/plans/client.tsx`: kamu planı açıklama satırı
- `messages/tr.json`, `messages/en.json`: yalnız 3 anahtar (`assign.contractHint`, `errors.LIVE_PROVIDER_SUBSCRIPTION`, `errors.NO_PUBLISHED_VERSION`). Aynı dosyalardaki diğer çalışma ağacı değişiklikleri başka ajanların; commit'e alınmadı.
- `prisma/seed.ts`, `scripts/seed-public-sector-plans.ts` (yeni), `package.json` (`db:seed-public-sector-plans`)
- Testler: `src/lib/billing/public-sector-plans.test.ts`, `src/lib/billing/public-sector-assignment.test.ts`
- Kanıt kareleri: `docs/agent-results/TASK-MULRSG6T55LO0-be-fb/01…04-*.png`

**Geri alma:**

- Kod: bu commit'i revert etmek yeterli.
- Veri: `scripts/seed-public-sector-plans.ts` başlığındaki DELETE sırası uygulanır. Önce sözleşme aboneliği olan kiracı kalmamalı; `deletePlan` aksi halde reddeder.
- Dev DB'deki test verisi (silinebilir):
  - Kiracı `kamu-b11-test` (`cmulxeyfm0001m3xkc5me1fkf`)
  - Kullanıcı `kamu-b11-owner@example.test`
  - 5 davet `b11-uye-{1..5}@example.test`
  - public-team ataması

## 4. Riskler

- **Koltuk sınırı tüm planlarda devreye girdi.** Bu bir davranış değişikliği: zaten sınırında ya da üstünde olan bir kiracı artık yeni davet gönderemez. Bu, BUSINESS_MODEL §5.1'in söylediği davranış. Yalnız davet oluşturma kontrol ediliyor, çünkü repoda davet kabul akışı (`/accept-invite`) yok ve üyelik yalnız kayıtta oluşuyor. Kabul akışı yazıldığında aynı `assertSeatAvailable` orada da çağrılmalı.
- **`provider: 'contract'` yeni bir değer.** `Subscription.provider` serbest metin olduğu için şema değişikliği gerekmedi. Stripe ve iyzico senkronizasyonu `providerSubId` ile eşleştiği için bu satırlara dokunmaz. `currentPeriodEnd` boş bırakıldı: sözleşme tarihleri üründe tutulmuyor, tarih uydurmadım. Yenileme ve bitiş şimdilik elle takip ediliyor.
- Admin sürüm tablosunda kamu planı için "Aylık ₺0,00" görünüyor, çünkü plan yalnız yıllık ve tablo yalnız aylık sütunu gösteriyor. Yıllık tutar DB'de doğru (24_000_000). Kozmetik bir sorun.
- Kiracı abonelik sayfasında plan adı `PUBLİC-TEAM` (id) olarak ve "Dönem: otomatik yenileme" metniyle görünüyor. Bu jenerik bir metin; sözleşme planı için doğru ifade değil.

## 5. Açık sorular

- Sözleşme başlangıç ve bitiş tarihi üründe tutulmalı mı? Tutulacaksa ya `currentPeriodEnd` doldurulur ya da ayrı bir alan açılır; ikincisi şema değişikliği demek, o durumda leed-fb onayı gerekir.
- `public-starter`'ın koltuk sınırı 2. BUSINESS_MODEL'e göre ek koltuk `seatsExtra` ile satılabiliyor; kamu için ek koltuk fiyatı tanımlı değil.

## 6. Sonraki adım

- fe-fb: kiracı abonelik kartında sözleşme planı için ad ve dönem metni (`public-*` → "Belediye Ekip · yıllık sözleşme"), admin tablosuna yıllık sütunu.
- Davet kabul akışı yazıldığında koltuk kontrolü oraya da eklenmeli.
- e-Fatura (TASK-MTRJSOWFH6B45) açıldığında sözleşme planı faturası `yearlyCents` + `currency` üzerinden kesilebilir.

**Platform beyanı:** Doğrulama **macOS**'ta (darwin) yapıldı: yerel Postgres ve Next dev sunucusu (localhost:3000), AgentSpace uygulama içi tarayıcı. Değişen kod platformdan bağımsız: saf TS, Prisma ve HTTP; dosya yolu, süreç, kabuk ya da ikili dosyaya dokunmuyor. Windows ve Linux'ta aynı davranması beklenir. O platformlarda koşulamadı, çünkü bu makinede yalnız macOS var.
