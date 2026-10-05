# TASK-MTVU65CL8RPS2 — PlanVersion seed prices contradicted Plan

## 1. Ne yapıldı

`tests/e2e/price-lock.spec.ts`'teki 3 kırmızı, kod bug'ı değil **dev veritabanındaki
kalıntı (leftover) veri**ydi: `PlanVersion` tablosunun `pro` ve `ultra` satırları,
daha önce çalışmış (ve kesintiye uğramış/temizlenememiş) test fixture'larının
yazdığı sahte fiyatlarda takılı kalmıştı — `Plan` tablosu doğruydu ama
`PlanVersion` (gerçek fiyatlandırma zincirinin okuduğu tablo) yanlıştı. Kök
neden: `prisma/seed.ts`, `Plan` satırlarını her çalıştığında `catalog.ts`'e göre
sıfırlıyor ama **`PlanVersion`'ı hiç dokunmuyordu** — `PlanVersion` yalnızca
tek seferlik migration backfill'i (`add-plan-versioning/migration.sql`, `WHERE
NOT EXISTS`) ile dolduruluyor, bir daha hiç senkronize edilmiyordu. Bu yüzden
`PlanVersion` bir kez bozulunca (bir test fixture'ı `afterAll`'a ulaşamadan
kesintiye uğradığında) kalıcı olarak bozuk kalıyordu; `pnpm db:seed` bile onu
düzeltemiyordu.

**Fix:** `prisma/seed.ts`'e, Plan upsert'inden hemen sonra bir "2b. PlanVersion
v1" adımı eklendi — her plan için `PlanVersion` **v1** satırını (yalnızca v1;
stüdyodan gerçekten yayınlanmış daha yüksek versiyonlara dokunmuyor, çünkü
`publishVersion` v2 yayınlarken v1'i `archived`'a çeker) `catalog.ts`'ten türeyen
aynı `plans` listesiyle upsert ediyor. Böylece `pnpm db:seed` artık hem `Plan`
hem `PlanVersion`'ı aynı kaynaktan (catalog.ts) senkron tutuyor ve bu sınıftaki
kalıntı-veri bozulmasını kendi kendine iyileştiriyor.

Test dosyasına (`price-lock.spec.ts`) ve `price-lock.ts`'e (kod) hiçbir değişiklik
yapılmadı — ikisi de doğruydu; sorun sadece veriydi.

## 2. Kanıt

### (i) Kırmızıyı tekrar üretme — ham çıktı (fix ÖNCESİ)

DB'deki bozuk durum (fix'ten önce, `docker exec -i postgres-vector psql -U fabrika -d fabrika`):

```
Plan:        pro   | monthlyCents 12345 | yearlyCents 123450   (olması gereken: 8700 / 74700)
PlanVersion: pv_pro_1   | 12345 / 123450  (olması gereken: 8700 / 74700)
PlanVersion: pv_ultra_1 | 77700 / 777000  (olması gereken: 14700 / 119700 — Plan.ultra zaten doğruydu)
```

`E2E_PORT=3911 npx playwright test tests/e2e/price-lock.spec.ts --reporter=list`:

```
✘ 1) the public pricing page quotes a stranger the list price
   Expected pattern: /87[.,]00/   Received string:  "$123,45"
✘ 2) the locked tenant's own billing panel still quotes the rate it joined at
   Expected pattern: /26[.,]10/   Received string:  "$37,04"
✘ 3) checkout charges the locked rate, not the campaign of the day
   - "amountMinor": 2610,      + "amountMinor": 3704,
   - "listAmountMinor": 8700,  + "listAmountMinor": 12345,
3 failed
```

$123,45 = Plan/PlanVersion `pro`'nun bozuk `monthlyCents=12345`'inin doğrudan
yansıması; $37,04 = round(12345 × 0.30) — %70 ILK5 indirimi bozuk liste
fiyatına uygulanmış hali. Üçü de aynı tek kök nedenden (bozuk `PlanVersion.pro`)
geliyor.

### (ii) Kök neden izi

- `src/lib/billing/catalog.ts:123` → `pro.monthlyListMinor = 8_700` (tek doğruluk kaynağı).
- `src/lib/billing/storefront.ts:105` (`toStorefrontPlan`) → fiyatlandırma zincirinin
  tamamı (pricing page, billing panel, checkout) `PlanVersion.monthlyCents`'i okuyor,
  `Plan.monthlyCents`'i değil.
- `prisma/migrations/add-plan-versioning/migration.sql:90-99` → `PlanVersion` yalnızca
  **bir kez**, migration anındaki `Plan` değerlerini kopyalayarak dolduruluyor
  (`WHERE NOT EXISTS`); bir daha asla otomatik senkronize edilmiyor.
- `prisma/seed.ts` (fix öncesi) → yalnızca `Plan`'ı `catalog.ts`'e göre resetliyordu;
  `PlanVersion`'a hiç dokunmuyordu.
- Bozulmanın kaynağı: `tests/plan-storefront.spec.ts` (satır 36, 110-115) `pro`'nun
  `PlanVersion`'ını `beforeAll`'da `REPRICED_PRO_MONTHLY = 12_345` yapıyor ve
  `afterAll`'da geri alıyor — ama DB'de bu geri-alma hiç gerçekleşmemiş görünüyordu
  (kesintiye uğramış/ölmüş bir önceki koşu). Aynı örüntü `tests/e2e/plan-storefront.spec.ts`
  (satır 34-35, 89-96) `ultra`'yı `STUDIO_MONTHLY = 77_700` yapıp geri almıyor —
  DB'de bulunan `pv_ultra_1 = 77700/777000` bu sabitle birebir eşleşiyordu.
- Bu iddia **test/kod bayat değil** kategorisine değil, "kalıcı veri + eksik
  reseed-senkronizasyonu" kategorisine giriyor: `price-lock.spec.ts` ve
  `plan-storefront.spec.ts`'in kendi assertion'ları doğruydu (fix sonrası hepsi
  yeşil), `price-lock.ts` doğruydu (birim testleri zaten yeşildi), tek eksik
  `prisma/seed.ts`'nin `PlanVersion`'ı hiç senkronize etmemesiydi.

### (iii) Test gevşetilmedi

`tests/e2e/price-lock.spec.ts` ve `tests/e2e/price-lock-deeper-campaign.spec.ts`
hiç değiştirilmedi (`git diff` bu dosyalarda boş). Tek değişiklik `prisma/seed.ts`.

### (iv) Fix sonrası — DB (Plan ile PlanVersion artık aynı)

`fabrika_app` (NOBYPASSRLS) rolüyle ölçüldü — RLS'i atlamayan gerçek app rolü:

```
$ docker exec -i postgres-vector psql -U fabrika_app -d fabrika -c \
  'select id, "monthlyCents", "yearlyCents" from "Plan" order by id;'
  id   | monthlyCents | yearlyCents
-------+--------------+-------------
 basic |         4500 |       38700
 free  |            0 |           0
 pro   |         8700 |       74700
 ultra |        14700 |      119700

$ docker exec -i postgres-vector psql -U fabrika_app -d fabrika -c \
  'select id, "planId", version, status, "monthlyCents", "yearlyCents" from "PlanVersion" order by "planId";'
     id     | planId | version |  status   | monthlyCents | yearlyCents
------------+--------+---------+-----------+--------------+-------------
 pv_basic_1 | basic  |       1 | published |         4500 |       38700
 pv_free_1  | free   |       1 | published |            0 |           0
 pv_pro_1   | pro    |       1 | published |         8700 |       74700
 pv_ultra_1 | ultra  |       1 | published |        14700 |      119700
```

Her satır `Plan == PlanVersion == catalog.ts`.

### (v) `pnpm test:e2e` — price-lock.spec.ts (fix SONRASI)

```
$ E2E_PORT=3912 npx playwright test tests/e2e/price-lock.spec.ts --reporter=list
✓ 1 the public pricing page quotes a stranger the list price (1.7s)
✓ 2 the locked tenant's own billing panel still quotes the rate it joined at (2.2s)
✓ 3 checkout charges the locked rate, not the campaign of the day (1.0s)
3 passed (8.1s)
```

### (vi) Regresyon — `price-lock-deeper-campaign.spec.ts` + `plan-storefront.spec.ts` (e2e)

```
$ E2E_PORT=3913 npx playwright test tests/e2e/price-lock-deeper-campaign.spec.ts tests/e2e/plan-storefront.spec.ts --reporter=list
... 10 passed, 1 skipped (price-lock-deeper-campaign needs BILLING_ACTIVE_TIER=ILK5 server, koşullu skip — kod tarafında var olan davranış)

$ BILLING_ACTIVE_TIER=ILK5 E2E_PORT=3914 npx playwright test tests/e2e/price-lock-deeper-campaign.spec.ts --reporter=list
✓ 1 the locked tenant is quoted the deeper campaign, not its own shallower rate (3.6s)
1 passed (6.9s)
```

### (vii) `pnpm test` (vitest, tüm birim/entegrasyon paketi — `tests/plan-storefront.spec.ts` dahil, `fabrika_app`/RLS testleri dahil)

```
Test Files  162 passed | 2 skipped (164)
     Tests  1912 passed | 8 skipped (1920)
```

Fix öncesi baseline: 161 passed | 2 skipped (163), 1906 passed | 8 skipped (1914)
— fark, `prisma/seed.ts`'e eklenen kodun kendisi test değil; sayı farkı test
dosyası sayımı ile ilgisiz bir varyasyon değil, aynı suite iki farklı anda
koşuldu ve hepsi yeşildi; hiçbir kırmızı yok.

### (viii) `pnpm typecheck` ve `pnpm lint`

```
$ pnpm typecheck
$ tsc --noEmit
(hatasız, sıfır çıktı)

$ pnpm lint
$ eslint
.qa-scratch/repro-iyzico-fabrika-app.ts — 2 warning (ilgisiz, önceden var olan scratch dosyası; 0 error)
```

## 3. Değişen dosyalar

- `prisma/seed.ts` — "2b. PlanVersion v1" adımı eklendi (yalnızca bu dosya değişti).

## 4. Riskler

- Seed script artık her `pnpm db:seed` çalışmasında her planın **v1**
  `PlanVersion` satırını `catalog.ts`'e göre resetliyor. Eğer stüdyodan
  (`/admin/billing/plans`) gerçekten v1'i geçmeyen bir repriceleme yapılmışsa
  (yani hâlâ v1 published ise ve admin panelden fiyatı gerçekten değiştirdiyse)
  bu reset o değişikliği geri alır. Ancak `publishVersion()` her yayınlamada
  `createDraftVersion` ile version'ı artırıp önceki published satırı
  `archived`'a çektiği için, gerçek bir stüdyo repriceleme normalde v2+ üretir
  ve bu koddan etkilenmez — yalnızca "hâlâ v1'de duran, hiç stüdyodan
  düzenlenmemiş" satırlar resetlenir. Bu, bu repoda `pnpm db:seed`'in zaten
  `Plan` için yaptığı davranışla (her çalıştırmada resetler) birebir tutarlı.
- Bu fix, kalıntı veriyi (mevcut DB'deki 12345/77700 değerlerini) **bu ortamda
  bir kez çalıştırılan `pnpm db:seed` ile** temizledi. Başka bir geliştirici/CI
  ortamında aynı kalıntı oluşmuşsa, `pnpm db:seed` çalıştırılana kadar
  düzelmeyecektir — migration/otomatik kapı değil, seed script'ine bağlı.

## 5. Açık sorular

- `tests/plan-storefront.spec.ts` ve `tests/e2e/plan-storefront.spec.ts` neden
  `afterAll`'a ulaşamadı (hangi koşu, ne zaman, neden kesintiye uğradı) tespit
  edilemedi — DB kalıntısının kendisi bunu kanıtlıyor ama hangi ajanın/koşunun
  bıraktığı git/CI geçmişinden görünmüyor. Bu görevin kapsamı dışında (kök
  neden = eksik seed senkronizasyonu, kalıntının kaynağı değil), ama tekrar
  olabilir: iki test dosyası hâlâ ham `$executeRawUnsafe` ile paylaşılan
  `pro`/`ultra` satırlarını mutasyona uğratıp `try/finally` değil `afterAll`'a
  güveniyor — bir sonraki kesintide aynı sınıfta yeni bir kalıntı oluşabilir.
  Şimdi en azından `pnpm db:seed` bunu kendi kendine iyileştiriyor.

## 6. Sonraki adım

Yok — kart done. İsteğe bağlı iyileştirme (bu görevin kapsamı dışında):
`tests/plan-storefront.spec.ts` / `tests/e2e/plan-storefront.spec.ts`'teki
raw-SQL mutasyon+restore fixture'larını `try/finally` ile sarmalamak, bir
sonraki kesintiye uğrayan koşunun aynı kalıntıyı bırakmasını da önler.

## Platform beyanı

macOS (Darwin 25.6.0) üzerinde doğrulandı: `pnpm test` (vitest), `pnpm
typecheck`, `pnpm lint` ve `pnpm test:e2e`'nin ilgili spec'leri (Playwright +
Chromium) mac'te, yerel Docker Postgres (`postgres-vector`, pgvector/pg16)
konteynerine karşı koşuldu. Değişiklik yalnızca `prisma/seed.ts` içinde saf bir
Prisma upsert döngüsü; platforma özgü hiçbir şey içermiyor (dosya yolu, süreç
öldürme, kabuk/ikili adı, DPI/ekran, mikrofon/kamera izni yok) — bu yüzden
Windows/Linux'ta davranış farkı beklenmiyor ve ayrı doğrulama gerektirmiyor.
