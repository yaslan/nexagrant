# TASK-MTVR7W9ZXO7M — Tenant-bypass Slice 1: M9 calendar module

**Ajan:** blok-zincir-dse (DSE-EN) · **Tip:** refactor (access layer) + defense-in-depth · **Bağlam:** `docs/agent-results/TASK-MTSZ0AL4QP2CT-blockzincir-pm.md` §3.8, §3.9, §5 Dilim 1

---

## 1. Ne yapıldı

### 1.1 Envanteri kendi ölçümümle tazeledim (önce)

Kart, envanterin birkaç saat eski olduğunu söylüyordu. Satır numaralarını dokunmadan önce doğruladım — beşi de yerindeydi:

```
$ grep -rn "prisma\.calendarConnection\|prisma\.calendar" src/modules/m9 src/app
src/modules/m9/server/calendar-actions.ts:31:  const connection = await prisma.calendarConnection.findUnique({
src/modules/m9/server/calendar-actions.ts:43:  await prisma.calendarConnection.delete({
src/modules/m9/server/calendar-actions.ts:71:  const existing = await prisma.calendarConnection.findUnique({
src/modules/m9/server/calendar-actions.ts:79:  const connection = await prisma.calendarConnection.create({
src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx:33:  const connections = await prisma.calendarConnection.findMany({
```

### 1.2 Beş çağrı da sarmalayıcıya taşındı

`tenantId`'nin nereden geldiği **değişmedi** — her üç yerde de hâlâ `requireTenantAction()`. Bu bir erişim katmanı taşımasıdır, yetki değişikliği değil.

| Dosya | Önce | Sonra |
|---|---|---|
| `calendar-actions.ts` `disconnectCalendar` | `prisma.…findUnique` + `prisma.…delete` | tek `withTenant(tenantId, tx => …)` içinde `tx.…findUnique` + `tx.…deleteMany` |
| `calendar-actions.ts` `connectCalendar` | `prisma.…findUnique` + `prisma.…create` | tek `withTenant(tenantId, tx => …)` içinde `tx.…findUnique` + `tx.…create` |
| `settings/calendar/page.tsx` | `prisma.…findMany` | `withTenant(tenantId, tx => tx.…findMany)` |

Her iki dosyada da `import { prisma }` → `import { withTenant }` oldu; ölçümle doğrulandı:

```
$ grep -c 'prisma\.' src/modules/m9/server/calendar-actions.ts 'src/app/…/settings/calendar/page.tsx'
src/modules/m9/server/calendar-actions.ts:0
src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx:0
```

### 1.3 Savunma-derinliği: `delete({where:{id}})` → `deleteMany({where:{id,tenantId,userId}})`

JS sahiplik kontrolü **yerinde kaldı** — ekrana giden çevrilebilir `CALENDAR_FORBIDDEN` kodunu üreten odur. Değişen, silme yazısının kendisiyle birlikte giden yüklem.

**Davranış ve i18n anahtarı korundu (kartın açık şartı).** Bugün `delete({where:{id}})` satırı bulamazsa Prisma P2025 fırlatıyor; bu hatanın mesajı hiçbir `CALENDAR_*` kodu içermediği için `calendarErrorCode()` `null` dönüyor ve ekran `t('errors.unknown')` gösteriyor (`client.tsx:43-46`). `count === 0` dalında fırlattığım `Error('Calendar connection delete matched no row')` mesajı da hiçbir kod içermiyor → `calendarErrorCode()` yine `null` → **aynı** `errors.unknown` anahtarı. Bu, tahmin değil, teste bağlandı (§2.2, "keeps the generic message the P2025 throw produced").

---

## 2. Kanıt

### 2.1 Asıl kanıt — mutasyon: yeşil test, kusur geri konunca KIRMIZI

Kart, testin `deleteMany`'nin dönüş sayısına değil **DB'de satırın hâlâ var olduğuna** bağlanmasını istedi, çünkü sayıya bağlanan bir test guard'sız kodda da geçer. `tests/m9-calendar-tenant-scope.live.test.ts` satır varlığını `$queryRaw` ile, Prisma model katmanının altından soruyor.

Bir yeşil test kanıt değildir. Kusuru geri koydum:

**Mutasyon 1 — JS guard SİLİNDİ + `delete({where:{id}})` geri kondu (kart öncesi şekil):**
```
× leaves another tenant's connection row in the database 50ms
× leaves a sibling user's connection row in the same tenant 9ms
AssertionError: promise resolved "{ success: true }" instead of rejecting
Tests  2 failed | 1 passed (3)
```

**Mutasyon 2 — JS guard yine SİLİNDİ, ama `deleteMany({where:{id,tenantId,userId}})` KALDI:**
```
(guard confirmed absent from the file)
Tests  3 passed (3)
```

İki koşu arasındaki **tek fark silme yüklemi**. Guard yokken eski şekil başka kiracının satırını siliyor, yeni şekil silmiyor. Savunma-derinliği maddesinin değeri tam olarak budur ve ölçüldü. Her iki mutasyondan sonra dosya yedekten geri alındı (`diff` ile pre-mutation durumla birebir aynı olduğu doğrulandı).

Karşı-olgusal kol da testin içinde: `still deletes the row when the caller does own it` — bu olmadan, hiçbir şeyi silmeyen bozuk bir eylem de yukarıdaki iki iddiayı sağlardı.

### 2.2 `pnpm vitest run` — birim + canlı DB

```
$ pnpm vitest run tests/m9-calendar-connect.test.ts tests/m9-calendar-tenant-scope.live.test.ts tests/calendar-token-db.live.test.ts
 Test Files  3 passed (3)
      Tests  20 passed (20)
```

Sarmalayıcı taşımasının kendi kırmızısı da kayıtlı: mock'u güncellemeden önce dosya
```
Tests  5 failed | 6 passed (11)
AssertionError: expected [Function] to throw error including 'CALENDAR_CONNECTION_NOT_FOUND'
  but got '[vitest] No "withTenant" export is defined on the "@/lib/db" mock.'
```
veriyordu — yani birim testleri artık `withTenant`'tan geçmeyen bir çağrıyı yapısal olarak göremez.

### 2.3 Tüm birim suite'i — regresyon yok

```
$ pnpm vitest run
 Test Files  154 passed | 2 skipped (156)
      Tests  1841 passed | 8 skipped (1849)
```

### 2.4 `pnpm test:e2e` — gerçek tarayıcı, gerçek tıklama

```
$ pnpm test:e2e tests/e2e/m9-calendar-connect.spec.ts
  ✓  1 … an unconfigured provider is refused in Turkish, not silently swallowed (1.9s)
  ✓  2 … the browser tab title follows the locale (896ms)
  ✓  3 … .ics connects for real and the screen reflects the stored row (957ms)
  ✓  4 … .ics disconnects for real and the row leaves the database (859ms)

  4 passed (8.1s)
```

Kareler: `test-artifacts/TASK-MTQUTBH8Q9VMK-screenshots/` — yeni olan `disconnect-ics-removed.png` (111 KB, 19:53), yanında `connect-ics-connected.png` ve `connect-google-refused.png`.

`confirm()` diyaloğu açıkça kabul ediliyor (`page.on('dialog', d => d.accept())`); Playwright varsayılanı diyaloğu **reddetmek** olduğu için bu satır olmadan test hiç bağlantı kesmeden yeşil geçerdi.

### 2.5 `pnpm typecheck`

Ana ağaçta 3 hata var, **üçü de bana ait değil** — başka bir ajanın commit edilmemiş devam eden işinden (`EvidenceForm.tsx` ve `pipeline/board.tsx` `M`, `tests/evidence-form-file-clear.test.tsx` ve `tests/pipeline-note-input-shape.test.ts` `??`); ikisi de kartın "DOKUNMA" listesinde. Bunu iddia olarak bırakmamak için HEAD üzerinde izole bir worktree kurup **yalnız benim 4 dosyamı** kopyaladım:

```
$ git -C /tmp/fabrika-head-probe status --porcelain
 M src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx
 M src/modules/m9/server/calendar-actions.ts
 M tests/m9-calendar-connect.test.ts
?? tests/m9-calendar-tenant-scope.live.test.ts

$ tsc --noEmit
TSC EXIT CODE: 0
```

(probe worktree sonrasında `git worktree remove --force` ile kaldırıldı.)

### 2.6 `pnpm rls:verify`

```
Kiracıya özel model: 45 · RLS açık tablo: 52 · tenant_isolation politikası: 45
⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 20 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif): app.tenant_id yokken INSERT reddedildi
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi
✅ 45 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

Script'in kendi uyarısı kartın gerekçesini doğruluyor: ana `DATABASE_URL` bugün BYPASSRLS bir rolle bağlanıyor, yani bu beş çağrı bugün *sadece bu yüzden* çalışıyordu.

### 2.7 `pnpm lint`

`0 errors, 1 warning` — tek uyarı `src/lib/inngest/jobs/__tests__/cron-tenant-scope.test.ts` içinde, blok-zincir-dev'in kapsamında. Benim dosyalarım temiz.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/modules/m9/server/calendar-actions.ts` | 4 çağrı `withTenant`'a; `delete`→`deleteMany({id,tenantId,userId})`; `count===0` dalı |
| `src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx` | `findMany` `withTenant`'a |
| `tests/m9-calendar-connect.test.ts` | mock `prisma`→`withTenant`; 4 yeni test (delete yüklemi, `errors.unknown` korunumu, iki `withTenant` çağrı-yeri) |
| `tests/m9-calendar-tenant-scope.live.test.ts` | **YENİ** — canlı DB, satır-varlığı testi (3 test) |
| `tests/e2e/m9-calendar-connect.spec.ts` | **YENİ test** — bağlantı kesme mutlu yolu, gerçek tarayıcı |

`tsconfig.json`, `package.json`, `prisma/schema.prisma` değişmedi. Başka ajanların dosyalarına dokunulmadı.

---

## 4. Sonraki dilimler için DESEN (kartın asıl istediği çıktı)

Dilim 2-4 bunu kopyalayacak. Adıyla:

**D1 — İmza: `withTenant` çağrı yerini sarmalar, fonksiyonu bölmez.**
`tenantId`'yi zaten elde etmiş olan fonksiyonun gövdesi `return withTenant(tenantId, async (tx) => { … })` içine alınır; `prisma.` → `tx.`. `tenantId`'nin **kaynağı asla değişmez** — `requireTenantAction()` neredeyse orada kalır. Sarmalayıcı `tx`'i verir, `prisma`'yı değil, ve `TenantTx` markalı olduğundan çıplak `prisma` bu callback'e tip düzeyinde giremez (`src/lib/db.ts:105`).

**D2 — Transaction sınırı: oku-ve-yaz TEK sarmalayıcıya girer, iki taneye değil.**
`disconnectCalendar`'da `findUnique` + `deleteMany` aynı `withTenant`'ta. İkiye bölmek iki ayrı transaction demektir: `app.tenant_id` iki kez kurulur ve okuma ile yazma arasında atomiklik kaybolur. Fırlatılan hata callback'ten çıkarken transaction geri alınır — `CalendarActionError` yolları hiçbir şey yazmadığı için bu ücretsizdir, ama yazma yapan bir dilimde bu bilinçli bir kazançtır.

**D3 — Sarmalayıcı ≠ satır sahipliği. İkisi ayrı işlerdir.**
`withTenant` `app.tenant_id`'yi kurar; bu, RLS **açık bir rolde** kiracı sınırını verir. `userId` sınırını vermez ve BYPASSRLS rolde hiçbir şey vermez. Bu yüzden sahiplik yüklemi yazının `where`'inde de durmalıdır: `deleteMany({where:{id,tenantId,userId}})`. `delete({where:{id}})` + önceden JS kontrolü, tek bir katman — ve §2.1 o katmanın tek başına kaldırıldığında satırın gittiğini ölçtü.

**D4 — Test kurulumu: mock'u `withTenant` üzerinden yap, yok sayma.**
`vi.mock('@/lib/db', () => ({ withTenant: withTenantMock }))` ve `withTenantMock` callback'e sahte bir `tx` verir. İki kazanç: (a) sarmalayıcıya hangi `tenantId` ile girildiği gözlenebilir hâle gelir, (b) `prisma` mock'tan hiç export edilmediği için çıplak `prisma`'ya dönen bir regresyon test dosyasını **import anında** düşürür, sessizce geçmez.

**D5 — Kritik iddiayı DB'ye sor, dönüş değerine değil.**
Satır-varlığı `$queryRaw` ile ölçülür (`.live.test.ts`, DB'ye ulaşılamıyorsa `describe.skipIf` ile atlanır). Yanına karşı-olgusal kol konur (sahibi olan çağıran gerçekten silebiliyor mu), yoksa hiçbir şey silmeyen bir eylem de yeşil geçer.

**D6 — Kullanıcıya giden davranış ve i18n anahtarı sabit kalır.**
`delete`→`deleteMany` dönüşümü yeni bir "0 satır" dalı yaratır. O dalın hangi i18n anahtarına düştüğü, eski Prisma hatasının düştüğü anahtarla aynı olmalı ve bu bir testle sabitlenmeli — yoksa erişim katmanı taşıması sessizce bir UX değişikliği taşır.

---

## 5. Riskler

1. **`disconnectCalendar` artık bir transaction açıyor.** Tek bir kullanıcı eylemi başına bir bağlantı, ihmal edilebilir; ama Dilim 2-4'te sıcak yollara (dashboard metrikleri, pipeline) aynı desen uygulanırken transaction başına maliyet düşünülmeli.
2. **Yeni `count === 0` dalı çıplak `Error` fırlatıyor.** Kasıtlı (§1.3), ama bir gün ekip bu duruma özel bir mesaj isterse yapılacak şey `CalendarActionCode`'a yeni bir kod eklemektir — mevcut kodlardan birini yeniden kullanmak değil, çünkü o anda kullanıcıya giden metin değişir.
3. **`.live.test.ts` DB yoksa kendini atlar.** Sessiz bir yeşil üretebilir. `pnpm gate` bir CI'da DB'siz koşarsa bu üç test hiç çalışmaz; `pnpm rls:verify` zaten DB istediği için kapının tamamı DB'siz zaten geçmiyor, ama bu bağımlılık farkındalıkla taşınmalı.
4. **Kartın ana gerekçesi hâlâ açık.** `fabrika_app` rolüne geçiş yapılmadı; bu dilim 79 çağrıdan 5'ini kapatıyor. Kalan 74'ü Dilim 2-5.

---

## 6. Açık sorular

1. `settings/calendar/page.tsx` bir Server Component; her sayfa görüntüsü artık bir transaction açıyor. Salt-okuma sayfa yüklemeleri için `withTenant` yerine daha ucuz bir "sadece `app.tenant_id` kur" yardımcısı istenir mi, yoksa tek desen (tek yol, tek gerçek) tercih edilir mi? Ben tek deseni seçtim — CLAUDE.md kural 1 sorguların sarmalayıcıdan geçmesini istiyor ve ikinci bir yol açmak tam da §5'in engellemeye çalıştığı şey.
2. Dilim 5'in allowlist'i bu 5 satırı listeden çıkarmalı; bu kart `done` olunca Dilim 5 kartının gövdesi güncellenmeli mi, yoksa allowlist yazılırken ağaç yeniden mi ölçülecek? (Ölçüm önerim: yeniden ölç — envanterin kendisi birkaç saatte eskiyor.)

---

## 7. Sonraki adım

Dilim 2 (`pipeline/actions.ts` 5, `approvals/page.tsx` 1, `dashboard/fetch-metrics.ts` 2, `lib/modules/access.ts` 1, `lib/feedback/submit.ts` 2, `api/v1/opportunities/route.ts` 1, `api/concept-notes/[id]/export/route.ts` 2 — toplam 14) açılabilir; §4'teki D1-D6 desenini alsın. Dosya kümesi bu kartla kesişmiyor. Dilim 5 (statik kapı) hâlâ Dilim 2-4'e bağımlı.

---

## 8. Platform beyanı

**Doğrulandığı platform: macOS (darwin 25.6.0, Apple Silicon).** Birim + canlı DB testleri, Playwright/Chromium e2e, `typecheck`, `lint`, `rls:verify` — hepsi macOS'ta koşuldu.

**Windows / Linux koşulamadı** — bu ofiste yalnız macOS host var. Koddan beyan: bu kartta dokunulan hiçbir yol platforma bağlı değil — süreç öldürme, dosya yolu birleştirme, kabuk/ikili adı, kısayol metni, ekran/DPI ya da mikrofon-kamera izni yok. Değişiklikler Prisma sorgu şekli (`withTenant`, `deleteMany`) ve React/Next server component kodu; ikisi de platformdan bağımsız. Testlerin tek harici bağımlılığı `docker-compose` Postgres'i (`localhost:5432`) ve Chromium — her ikisi de üç platformda aynı şekilde çalışır. E2E'deki `confirm()` diyaloğu Playwright'ın kendi diyalog API'siyle karşılanıyor, işletim sistemi diyaloğuyla değil.
