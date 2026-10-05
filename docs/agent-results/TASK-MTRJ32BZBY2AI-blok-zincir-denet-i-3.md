# TASK-MTRJ32BZBY2AI — Faz 1 üçüncü koşu: kalanı ölç, kalanı bitir

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tarih:** 2026-09-08 · **Dalga:** S12-D7 (yeniden koşu)
**Kapsam:** `prisma/migrations/add-plan-versioning/**`, `src/lib/billing/plan-repository.ts`,
`tests/plan-visibility-rls.spec.ts` (yeni), `tests/e2e/admin-plan-editor.spec.ts`, `docs/DATA_MODEL.md`
**Commit:** `b5749bd`

---

## 0. ÖNCE ÖLÇÜM — bu karttan ağaçta ne vardı

Görev "baştan yapma, ne kaldığını ölç" diyordu. Ölçtüm; **ADIM 1 ve ADIM 2 gerçekten
inmişti**, iddia edildiği yerde duruyordu:

```
$ git show --stat 09c385b   # feat(billing): platform plan editor with immutable published versions
 25 files changed, 3474 insertions(+), 1 deletion(-)
   prisma/schema.prisma                             |  60 ++
   prisma/rls.sql                                   |  25 +-
   prisma/migrations/add-plan-versioning.sql        |  99 +++
   src/app/[locale]/admin/billing/plans/{page,client,actions}.{tsx,ts}
   src/lib/billing/plan-repository.ts               | 826 +++
   src/lib/billing/plan-admin.test.ts               | 431 +++
   tests/e2e/admin-plan-editor.spec.ts              | 352 +++
   ... 11 ekran görüntüsü
```

Veritabanı da (mock değil, `information_schema`):

```
TABLES: Plan, PlanAssignment, PlanFeature, PlanVersion, Subscription
COLS  : Plan.visibility, Subscription.planVersionId
PlanVersion: basic v1 published · free v1 published · pro v1 published · ultra v1 published
RLS   : Plan rls=true (4 politika) · PlanVersion rls=true (4) · PlanFeature rls=true (4)
        PlanAssignment rls=true (1: tenant_isolation)
```

Çalışan ağaçta bu karta ait **yarım kod yoktu** (`git status` temizdi). Yani "baştan yap"
gerekmiyordu. Kalan dört şey vardı ve bu koşu onları kapattı:

| # | Kalan iş | Nereden çıktı |
|---|---|---|
| 1 | Migration `prisma migrate deploy`'un GÖRMEDİĞİ düz `.sql` dosyasıydı | ölçüm (aşağıda) |
| 2 | `docs/DATA_MODEL.md`'de üç tablonun **hiç** izi yoktu | CLAUDE.md "her yeni tablo … aynı PR'da" |
| 3 | `plansVisibleToTenant` kiracıya özel tabloyu `withTenant` DIŞINDA okuyordu | görev metni: "Erişim `withTenant` üzerinden" |
| 4 | "Oluştur → yenile → duruyor" hiç ölçülmemişti (12 e2e'nin hepsi tek sayfa ömrü içinde) | görev metnindeki doğrulama |

---

## 1. Ne yapıldı

### 1.1 Migration artık gerçekten uygulanan bir migration

`prisma/migrations/add-plan-versioning.sql` **düz bir dosyaydı**. Bu depoda
`prisma migrate deploy` yalnız **klasörlü** migration'ları okur; düz `*.sql` dosyaları
görünmez. Yani tablolar bu makinede sadece ADIM 2'nin elle koşturduğu tek seferlik
script yüzünden vardı — temiz bir klonda `prisma migrate deploy` onları **kurmuyordu**.

Ölçüm, düzeltmeden önce:

```
$ node -e "... select migration_name from _prisma_migrations"
add-calendar-connections            2026-09-07 15:27
add-m9-meeting-schedule             2026-09-07 15:27
add-m10-dual-approval-persistence   2026-09-08 06:37
   ← add-plan-versioning YOK
```

Klasöre taşındı (`add-plan-versioning/migration.sql` + `down.sql`) ve RLS politikaları
dosyanın içine yazıldı (mevcut `add-m10-dual-approval-persistence` deseni: `rls.sql`
tek doğruluk kaynağı, migration kendi kopyasını taşır ki migration'dan kurulan DB
kısa süre bile kiracılar arası okunur olmasın).

Düzeltmeden sonra:

```
$ npx prisma migrate deploy
4 migrations found in prisma/migrations
Applying migration `add-plan-versioning`
All migrations have been successfully applied.
```

### 1.2 `plansVisibleToTenant` kiracı tablosunu `withTenant` dışında okuyordu — GERÇEK HATA

Kartın "özel paket başka kiracıya görünmüyor" iddiasını **çürütmeye** çalıştım. Bugünkü
bağlantıda iddia doğru görünüyor. Ama bugünkü bağlantı `DATABASE_URL` = `fabrika` rolü ve
o rol **SUPERUSER**, yani hiçbir politikaya tabi değil. Üretimin koştuğu rol
`fabrika_app` (NOBYPASSRLS). Aynı fonksiyonu o rolle koşturdum:

```
--- as fabrika (superuser, bugünkü DATABASE_URL) ---
connected as role: fabrika
plansVisibleToTenant('demo-tenant') -> 5 plans
  ids: free, basic, pro, ultra, qa-private-probe
  private probe: VISIBLE

--- as fabrika_app (NOBYPASSRLS, üretim şekli) ---
connected as role: fabrika_app
plansVisibleToTenant('demo-tenant') -> 4 plans
  ids: free, basic, pro, ultra
  private probe: HIDDEN (assignment lost)
```

**Kök neden:** fonksiyon `PlanAssignment`'ı çıplak tekil (`prisma.planAssignment`) ile
okuyordu. `tenant_isolation` politikası `"tenantId" = current_setting('app.tenant_id')`
karşılaştırıyor; `app.tenant_id` set edilmemişse bu her satır için NULL, tablo **boş
okunuyor**. `where: { tenantId }` filtresi daraltmayı yapıyor gibi görünür ama politika
önce cevap verir. Sonuç: özel paket, **kendisine atanmış olan kiracıdan** kayboluyordu.
Atanmamış kiracının (doğru) boş sonucu, özelliği çalışıyormuş gibi gösteriyordu.

Düzeltme: okuma `withTenant(tenantId, …)` içine alındı (CLAUDE.md §1).

### 1.3 Regresyon paketi: `tests/plan-visibility-rls.spec.ts` (5 test, YENİ)

Depodaki mevcut testler bu hatayı **göremez**, çünkü hepsi superuser bağlantısında koşar.
Yeni paket gerçek repository fonksiyonunu `fabrika_app` rolüne bağlı bir client'a karşı
import eder (`vi.doMock('@/lib/db')` → `prisma: rls`, `withTenant → withTenantOn(rls,…)`).
Sahte veri yok, gerçek Postgres, gerçek politikalar.

### 1.4 `docs/DATA_MODEL.md` §13 (YENİ)

Üç tablo, sütun tabloları, değişmezlik kuralının **neden kod kuralı olduğu**, platform
vs kiracı RLS ayrımı, migration/rollback yolu ve **bugünkü sınırın dürüst kaydı**
(fiyat sayfası / ayarlar / checkout hâlâ statik `catalog.ts`'ten okuyor).

### 1.5 e2e: "oluştur → yenile → duruyor"

Mevcut 12 e2e'nin **hepsi tek sayfa ömrü içinde** koşuyordu; state'ini yalnız React'te
tutan bir ekran hepsini geçerdi. Yeni test taslağı oluşturur, kaydeder, **tarayıcıyı
sıfırdan yeniler** ve değerin hâlâ orada olduğunu doğrular.

---

## 2. Kanıt

### 2.1 Migration temiz bir veritabanında tabloları KURUYOR (sıfırdan)

Scratch DB açıldı, yalnız üç ön koşul tablo kuruldu, sonra migration dosyası koşuldu:

```
prerequisites only: Plan, Subscription, Tenant
after migration.sql : Plan, PlanAssignment, PlanFeature, PlanVersion, Subscription, Tenant
Plan.visibility     : YES
Subscription.planVersionId: YES
backfilled versions : [{"planId":"pro","version":1,"status":"published"}]
policies from the migration alone:
   Plan           rls=true platform_no_delete,platform_no_insert,platform_no_update,platform_read
   PlanAssignment rls=true tenant_isolation
   PlanFeature    rls=true platform_no_delete,platform_no_insert,platform_no_update,platform_read
   PlanVersion    rls=true platform_no_delete,platform_no_insert,platform_no_update,platform_read
re-run idempotent   : OK, PlanVersion rows = 1
```

### 2.2 Özel paket ölçümü — iki seviyede, iki yönde

```
=== 1. plansVisibleToTenant() ===
  A (demo-tenant, assigned)      sees 5 plans; private probe: VISIBLE
  B (esr-calibration, not assigned) sees 4 plans; private probe: hidden
  A plan ids: free:public, basic:public, pro:public, ultra:public, qa-private-probe:private
  B plan ids: free:public, basic:public, pro:public, ultra:public

=== 2. PlanAssignment under fabrika_app (NOBYPASSRLS) ===
  no app.tenant_id set          -> 0 row(s)      ← 1.2'deki hatanın mekanizması
  withTenant('demo-tenant')     -> 1 row(s)
  withTenant('esr-calibration') -> 0 row(s)

=== 3. Plan/PlanVersion write refused to the tenant role ===
  INSERT Plan       : refused -> Code: `42501`. Message: `new row violates row-level
                      security policy for table "Plan"`
  UPDATE PlanVersion: NOT refused, rows affected = 0
```

Üçüncü satırın dürüst okunuşu: `platform_no_update` `USING (false)` olduğu için satır
UPDATE'e **görünmez**; komut hata vermez, **sıfır satır** günceller. Yazma yine
gerçekleşmiyor (test bunu ayrıca `seats` değerini geri okuyarak doğruluyor), ama
"reddedildi" ile "hiçbir satır bulamadı" aynı şey değil — raporda ayırıyorum.

### 2.3 Regresyon testi gerçekten kırmızı (test gevşetilmedi)

Düzeltmeyi geri alıp aynı paketi koştum:

```
 ❯ tests/plan-visibility-rls.spec.ts (5 tests | 1 failed) 178ms
     × the assigned tenant still sees its private plan 23ms
AssertionError: expected [ 'free', 'basic', 'pro', 'ultra' ] to include 'rls-private-plan-fixture'
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

Düzeltme geri konunca:

```
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### 2.4 Gerçek tarayıcı — 13 e2e, gerçek tıklama/yazma

```
Running 13 tests using 1 worker
  ✓   1 lists plans with their versions and a live-tenant count (760ms)
  ✓   2 a published version is marked immutable and offers no edit control (459ms)
  ✓   3 editing a published plan creates a NEW draft version, leaving the live one alone (867ms)
  ✓   4 the publish button does not exist until the impact has been computed (1.3s)
  ✓   5 a card bullet cannot be set to a module the draft does not grant (984ms)
  ✓   6 a plan with live subscriptions cannot be deleted, only archived (737ms)
  ✓   7 a private plan shows the tenant assignment panel; a public one does not (1.3s)
  ✓   8 the screen is refused to a session that is not a platform admin (339ms)
  ✓   9 publishing through the screen flips the version and writes an audit record (1.2s)
  ✓  10 creating a draft seeds the editor with the live version, not zeros (882ms)
  ✓  11 the impact headline never contradicts the fields it lists as lowered (951ms)
  ✓  12 a saved draft version survives a full page reload (1.3s)   ← YENİ
  ✓  13 the English locale renders English labels, not Turkish (534ms)
  13 passed (12.6s)
```

### 2.5 Tıklamanın Postgres'e ULAŞTIĞI — tarayıcının DIŞINDAN ölçüm

"Yenileyince duruyor" React state'iyle de taklit edilebilir. Bu yüzden aynı akış bir kez
de tarayıcının dışından, ayrı bir `pg` bağlantısıyla ölçüldü:

```
DB before  : basic drafts = 0
DB after   : [{"version":2,"status":"draft","seats":7,"workspaces":3}]
screen after reload: v2 = Taslak, seats/workspaces read back from the row above
DB cleaned : basic drafts = 0
```

Kareler: `docs/agent-results/TASK-MTRJ32BZBY2AI-screenshots/`
`12-draft-saved.png` · `13-draft-after-reload.png` · `14-persisted-after-reload-db-checked.png`
(+ ADIM 2'nin 01–11 kareleri bu koşuda yeniden üretildi).

### 2.6 Kapı — `pnpm gate` UÇTAN UCA YEŞİL

İlk koşuda kapı, başka bir ajanın o sırada yazdığı `scripts/_tmp-csv7/HEAD-consortium-page.tsx`
dosyasında kırmızıydı (§5.1). O dosyaya dokunmadım; sahibi işini bitirip temizleyince kapı
kendiliğinden yeşile döndü ve tam koşu tekrarlandı:

```
$ pnpm gate
$ pnpm lint && pnpm typecheck && pnpm test && pnpm rls:check && pnpm rls:verify

$ eslint
(çıktı yok — 0 problem)

$ tsc --noEmit
(çıktı yok — temiz)

$ vitest run --passWithNoTests
 Test Files  101 passed | 2 skipped (103)
      Tests  1187 passed | 8 skipped (1195)

$ tsx scripts/check-rls.ts
Found 42 tenant-scoped models requiring RLS policies:
... PlanAssignment ...
✅ SUCCESS: All 42 tenant-scoped models have RLS policies registered.

$ tsx scripts/check-rls-live.ts
Kiracıya özel model: 42 · RLS açık tablo: 48 · tenant_isolation politikası: 42
✅ Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

Yabancı dosya HÂLÂ ORADAYKEN yapılmış ölçüm (kayıt için — kapının benim değişikliğim
yüzünden kırmızı OLMADIĞININ kanıtı):

```
$ npx tsc --noEmit
scripts/_tmp-csv7/HEAD-consortium-page.tsx(5,90): error TS2307: Cannot find module './manager'

$ npx tsc --noEmit -p (aynı tsconfig, yalnız scripts/_tmp-csv7 hariç)
tsc exit code: 0

$ pnpm test
 Test Files  101 passed | 2 skipped (103)
      Tests  1186 passed | 8 skipped (1194)

$ pnpm rls:check
Found 42 tenant-scoped models requiring RLS policies:
... PlanAssignment ...
✅ SUCCESS: All 42 tenant-scoped models have RLS policies registered.

$ pnpm rls:verify
Kiracıya özel model: 42 · RLS açık tablo: 48 · tenant_isolation politikası: 42
✅ Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

pre-commit kancası da bağımsız olarak aynı şeyi söyledi:

```
✓ Kapı temiz (staged kapsamı).
⚠ Ağaçta senin OLMAYAN typecheck hataları var (başka bir ajan yazıyor olabilir):
scripts/_tmp-csv7/HEAD-consortium-page.tsx(5,90): error TS2307: ...
```

---

## 3. Değişen dosyalar

**Yeni**
- `tests/plan-visibility-rls.spec.ts` — 5 test, NOBYPASSRLS rolüne karşı
- `docs/agent-results/TASK-MTRJ32BZBY2AI-screenshots/12-draft-saved.png`
- `docs/agent-results/TASK-MTRJ32BZBY2AI-screenshots/13-draft-after-reload.png`
- `docs/agent-results/TASK-MTRJ32BZBY2AI-screenshots/14-persisted-after-reload-db-checked.png`

**Değişen**
- `prisma/migrations/add-plan-versioning.sql` → `add-plan-versioning/migration.sql`
  (klasöre taşındı + RLS bloğu eklendi); `.down.sql` → `add-plan-versioning/down.sql`
- `src/lib/billing/plan-repository.ts` — `plansVisibleToTenant` `withTenant` üzerinden
- `tests/e2e/admin-plan-editor.spec.ts` — +1 test (yenileme sonrası kalıcılık)
- `docs/DATA_MODEL.md` — §13 (90 satır)
- 01–11 ekran görüntüleri (e2e koşusunda yeniden üretildi)

**Dokunulmayanlar:** `src/lib/billing/catalog.ts`, `messages/*.json`,
`src/app/[locale]/admin/billing/plans/**`, `prisma/schema.prisma`, `prisma/rls.sql`.

**Temizlik:** koşu sırasında yazılan `qa-private-probe` fixture'ı ve geçici probe
script'leri silindi; `PlanVersion` tablosu koşu sonunda tam olarak dört yayınlanmış
sürümle (basic/free/pro/ultra v1) kaldı, taslak sızıntısı yok.

---

## 4. Riskler

1. **§1.2'nin sınıfı bu dosyayla sınırlı değil.** Kiracıya özel bir tabloyu `withTenant`
   dışında okuyan her çağrı, yerelde SUPERUSER yüzünden **doğru görünür** ve üretimde
   sessizce boş döner. Depoda başka örnekler olabilir; bu kartın kapsamı değil, ama
   `prisma.<tenantScopedModel>` desenini tarayan bir kapı kuralı bunu bir defada kapatır.
2. **`Plan` projeksiyonu hâlâ çift yazılıyor** (yayında `Plan` satırı da güncelleniyor).
   Bilinçli; üç yüzey `PlanVersion`'dan render edilene kadar sürecek.
3. **Etki ölçümü aktif abonelik sayısına dayanır**, kiracı başına gerçek kullanıma değil
   (ADIM 2'den devreden risk, değişmedi).

---

## 5. Açık sorular (kapsam dışı — DÜZELTİLMEDİ, adıyla bildiriliyor)

### 5.1 `scripts/_tmp-csv7/HEAD-consortium-page.tsx` repo genelinde typecheck'i kırıyor

Başka bir ajanın **şu an canlı** çalışma dosyası (12:48'de yazılmış, `.gitignore`'da
değil, takip edilmiyor). `tsc` onu projeye dahil ediyor ve `TS2307: Cannot find module
'./manager'` veriyor — yani `pnpm gate` şu anda **repo genelinde** kırmızı, benim
değişikliğimden bağımsız olarak. Dosyaya DOKUNMADIM (sahibi üzerinde çalışıyor).
Kalıcı çözüm sahibinde ya da `.gitignore` + tsconfig `exclude`'a `scripts/_tmp-*`
eklenmesinde.

**Güncelleme (12:55):** sahibi işini bitirip dizini temizledi; `pnpm gate` artık uçtan uca
yeşil (§2.6). Bulgu yine de duruyor — bir sonraki geçici dosya aynı şeyi tekrar yapacak,
çünkü sorun dosyada değil, `tsconfig.include`'un `**/*.tsx` olmasında.

### 5.2 `.tmp-qa-en/measure1.ts` — kendi eski koşumun kalıntısı, lint'i kırıyordu

`pnpm gate`'in ilk koşusu bu dosyada `@typescript-eslint/no-explicit-any` ile
patlıyordu. `.gitignore`'da olması eslint'i durdurmuyor. Bu dosya bu kartın ÖNCEKİ bir
QA-EN koşusundan kalmıştı (09:56, aynı plan tablolarını sorguluyor); repodan çıkarıldı.
Genel ders: `.gitignore` bir dosyayı kapıdan gizlemez.

### 5.3 Paket stüdyosu hiçbir müşteri yüzeyine bağlı değil

`plansVisibleToTenant` ve `listPublicPlans`'ın **üretimde tek bir çağıranı yok** —
yalnız testler çağırıyor:

```
$ grep -rn "plansVisibleToTenant\|listPublicPlans" src tests | grep -v plan-repository
src/lib/billing/plan-repository.test.ts:  (yalnız testler)
```

Fiyat sayfası, ayarlar faturalama paneli ve `POST /api/billing/checkout` hâlâ statik
`src/lib/billing/catalog.ts`'ten okuyor (checkout yalnız katalogdaki 3 sku'yu kabul
ediyor). Pratik sonuç: **stüdyoda açılan bir paket — herkese açık olsun, özel olsun —
bugün satın alınamaz**; `visibility` yalnız yönetim ekranında anlamlı. Bu ADIM 3 olarak
ADIM 2 raporunda zaten kapsam dışı bırakılmıştı; kartın "herkese açık/özel paket"
kriterinin **veri + yönetim** tarafı bitti, **vitrin** tarafı bitmedi. Kararı lidere
bırakıyorum: kart bu hâliyle kapanır mı, yoksa ADIM 3 aynı karta mı yazılır.

### 5.4 `src/types/prisma-override.d.ts` hâlâ delegate'leri `any` yapıyor

ADIM 2 raporunun 5.1'i duruyor, bu koşuda tekrar çarptım: `withTenant(...)` çağrısının
dönüşü `unknown` oluyor ve tip parametresini elle vermek gerekiyor. Şemada olmayan bir
tabloya çağrı hâlâ typecheck'ten geçer. Karar alınmadı, kapsamım değil.

---

## 6. Definition of Done

- [x] Bu karttan ağaçta/commit'te ne kaldığı ÖNCE ölçüldü ve raporun başına yazıldı
- [x] Yeni tablolar migration + RLS + `docs/DATA_MODEL.md` — üçü de aynı işte
- [x] Migration `prisma migrate deploy`'un GÖRDÜĞÜ klasör biçiminde; boş DB'de kurduğu ölçüldü
- [x] RLS politikaları hem `prisma/rls.sql`'de hem migration'ın içinde; `rls:check` 42/42, `rls:verify` 42/42
- [x] Erişim `withTenant` üzerinden — hata bulundu, düzeltildi, regresyon testi kırmızı→yeşil kanıtlandı
- [x] Gerçek tarayıcıda paket sürümü oluşturuldu → yenilendi → duruyor (kare + tarayıcı dışı DB ölçümü)
- [x] Özel paket başka kiracıya görünmüyor — iki seviyede, iki yönde ölçüldü (boş sonuç vacuous değil)
- [x] Test gevşetilerek geçilmedi
- [x] `pnpm gate` uçtan uca YEŞİL (lint 0 · tsc temiz · 1187 test · rls:check 42/42 · rls:verify 42/42)
- [x] Kapsam dışı bulgular düzeltilmedi, dosya adıyla bildirildi (§5)
