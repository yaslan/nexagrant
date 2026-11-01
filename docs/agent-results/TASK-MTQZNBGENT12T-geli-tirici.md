# TASK-MTQZNBGENT12T + TASK-MTQZNO7GMLKE1 — Fırsat arşivleme + efor sekmesi (BE-EN)

**Sprint:** S11 · **Branch:** `dev` · **Tarih:** 2026-09-07

---

## 1. Ne yapıldı

### A) Arşivleme akışı (TASK-MTQZNBGENT12T)

**A.0 — Önce ölçüm: `deletedAt`'i kim filtreliyordu?**

`Opportunity` üzerinde okuma yapan 24 sorgu tarandı. Değişiklikten **önce** yalnız 4'ü
`deletedAt`'i filtreliyordu. Yani `deletedAt` dolu bir kayıt panodan düşse bile KPI'da,
CSV'de, public API'de ve G0 puanlayıcıda görünmeye devam ediyordu.

| Sorgu | Önce | Şimdi |
|---|---|---|
| `pipeline/page.tsx` (pano) | ✅ | ✅ |
| `pipeline/[id]/page.tsx` (detay) | ✅ | ✅ |
| `pipeline/actions.ts` `evaluateOpportunityGate` | ✅ | ✅ |
| `actions/user/export-data.ts` (KVKK dışa aktarım) | ✅ | ✅ |
| `modules/m5/server/queries.ts` `getKpiMetrics` — 5 sorgu | ❌ | ✅ (bu iş) |
| `modules/m5/server/queries.ts` `getKpiTrend` — 3 sorgu | ❌ | ✅ (bu iş) |
| `lib/dashboard/fetch-metrics.ts` (panel KPI'ları) | ❌ | ✅ (bu iş) |
| `dashboard/export-csv.ts` (panel CSV) | ❌ | ✅ (bu iş) |
| `api/v1/opportunities/route.ts` (public API) | ❌ | ✅ (bu iş) |
| `lib/scoring/g0-compute.ts` `computeG0ForOpportunity` | ❌ | ✅ (bu iş) |
| `pipeline/[id]/consortium/**` — 4 sorgu | ❌ | **dokunulmadı** (ex-en'in dosyaları) |
| `lib/gates/evaluate.ts` | ❌ | **dokunulmadı** (blockzincir-pm'in dosyası; çağıran `pipeline/actions.ts` zaten `deletedAt: null` ile sahiplik doğruluyor, yani arşivli kayıt kapıya ulaşamıyor) |
| `opportunities/[id]/{matching,evaluations,evaluations/panel,m2,documents,application,briefs}/page.tsx` — 7 sorgu | ❌ | **dokunulmadı** — açık kalem, §5 |
| `modules/m{2,6,8,10,11}/server/*.ts` — 6 sorgu | ❌ | **dokunulmadı** — açık kalem, §5 |
| `api/dashboard/export-csv/route.ts` | ❌ | ✅ dolaylı (`fetchDashboardMetrics` üzerinden) |
| `concept-notes/[id]/page.tsx` | ❌ | **dokunulmadı** — açık kalem, §5 |

Kapsam kararı: kartın verdiği doğrulama listesi **liste / pano / KPI / G0**. Bunların hepsi
kapatıldı. Kalan 14 sorgu bir fırsatı **id ile** açan detay/modül okumaları — arşivli kayıt
oralarda hâlâ okunabiliyor. Bunlar başka ajanların dosyaları ya da kartın kapsamı dışında;
listelendi, uydurulmadı (§5).

**A.1 — `archiveOpportunity` server action** (`pipeline/actions.ts`)

- `withTenant` içinde tek transaction; `findFirst({ id, tenantId, deletedAt: null })` ile
  sahiplik — `findUnique` ile tahmin edilebilir id üzerinden başka kiracının kaydına
  dokunulamaz.
- Yetki `src/lib/pipeline/archive.ts`'te tek yerde: `TENANT_OWNER` / `TENANT_ADMIN` /
  `PIPELINE_MANAGER` her kaydı, diğer roller yalnız `ownerId === userId` olanı arşivler.
  Sahipsiz kayıt (`ownerId = null`) yalnız bu üç role açık — "kimse sahibi değil",
  "herkes sahibi" demek değil. Kural `'use server'` dosyasından dışa aktarılamayacağı için
  ayrı modülde; hem action hem sayfa aynı fonksiyonu çağırıyor, kopyalamıyor.
- `updateMany` filtresinde `deletedAt: null` var → iki kez arşivlemek ilk damgayı **ezmez**
  (idempotent).
- Aynı transaction içinde `AuditEvent(type='opportunity.archived', actorId, target, data)`.
- `revalidatePath`: pipeline, pipeline/[id], firsatlar, dashboard.
- Hata sözleşmesi kodla döner (`TENANT_SCOPE_REQUIRED` · `OPPORTUNITY_NOT_FOUND` ·
  `ARCHIVE_FORBIDDEN` · `ARCHIVE_FAILED`); sürücü mesajı yalnız sunucu log'unda.

**A.2 — UI** (`pipeline/[id]/client.tsx`): başlıkta "Arşivle" düğmesi → **onay adımı**
(`role="alertdialog"`, "Evet, arşivle" / "Vazgeç"). Dil "silme" değil "arşivleme":
onay metni kaydın **silinmediğini**, geçmişin/kapı kararlarının/efor kayıtlarının kaldığını
ve geri almanın üründe henüz olmadığını açıkça yazıyor. Düğme yalnız yetkili oturuma
çiziliyor; sunucu yine de kendi kontrolünü yapıyor.

### B) Efor sekmesi (TASK-MTQZNO7GMLKE1)

- **`Effort` tablosu şemada VAR** (`prisma/schema.prisma:672`, RLS kapsamında —
  `prisma/rls.sql:9`). Uydurma tablo yaratılmadı.
- `effort.tsx` içindeki `MOCK_EFFORTS` (iki uydurma satır: "Alice 4.5h", "Bob 2.0h") **söküldü**.
  Satırlar artık `page.tsx` içinde `withTenant` ile `Effort` tablosundan okunuyor
  (`deletedAt: null`); kişi adı `Effort.userId` → `User.name` ile çözülüyor, çözülemezse
  uydurulmuyor ("Bilinmiyor").
- **Boş durum**: kayıt yoksa tablo çizilmiyor, "Bu fırsat için henüz efor kaydı yok" paneli
  çıkıyor. Sıfır satır gerçek bir cevap.
- Form artık gerçekten yazıyor: `logEffort` server action (Zod doğrulama, saat > 0 ve ≤ 168,
  tarih `YYYY-MM-DD` → UTC gece yarısı, not ≤ 500 karakter). `userId` **tarayıcıdan
  alınmıyor**, oturumdan geliyor. Kaydettikten sonra `router.refresh()` ile satır sunucudan
  geri okunuyor — istemci tarafında iyimser satır eklenmiyor.
- **T-6 sekmesi**: gerçek görev kaynağı yok → "şablondur" notu **olduğu gibi kaldı**, sahte
  tamamlanma yüzdesi/kutusu üretilmedi.
- Tüm yeni metinler `t('...')`; anahtarlar `Pipeline.detail.archive.*` ve
  `Pipeline.detail.effortTab.*` altında **iki dile de** eklendi.

---

## 2. Kanıt

### 2.1 `pnpm gate` — temiz

```
$ pnpm lint
✖ 194 problems (0 errors, 194 warnings)     ← 0 HATA (uyarılar depoda mevcut olan `catch (e) {}` deseni)

$ tsc --noEmit
(çıktı yok — temiz)

$ vitest run --passWithNoTests
 Test Files  60 passed | 2 skipped (62)
      Tests  590 passed | 8 skipped (598)

$ tsx scripts/check-rls.ts
Found 38 tenant-scoped models requiring RLS policies:
AddOn, AiUsageLog, ..., Effort, ..., Opportunity, ...
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.

$ tsx scripts/check-rls-live.ts
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

DB'yi sıfırlayan/migrate eden bir komut **çalıştırılmadı** (şema değişikliği yok —
`deletedAt` zaten vardı), dolayısıyla `pnpm db:rls` / `pnpm db:rls-role` gerekmedi.
`rls:verify` yine de canlı ölçtü ve temiz.

### 2.2 Gerçek tıklama e2e — `tests/e2e/opportunity-archive.spec.ts`

```
$ npx playwright test tests/e2e/opportunity-archive.spec.ts
Running 1 test using 1 worker
[seed-archive-e2e] ready — tenant=archive-e2e-tenant opportunities=archive-e2e-opportunity,archive-e2e-opportunity-kept clearedEfforts=0 clearedAuditEvents=0
[seed-archive-e2e] rolled back
  ✓  1 [chromium] › tests/e2e/opportunity-archive.spec.ts:46:7 › Opportunity archive + effort log › archiving hides the opportunity everywhere but keeps the record (3.1s)

  1 passed (4.0s)
```

Test gerçek tarayıcıda: giriş yapar → panoyu görür → efor sekmesini açar → **boş durumu**
doğrular → 3.5 saat efor girer → satırın DB'ye yazıldığını `prisma.effort.findMany` ile
doğrular → **Arşivle** → onay panelini görür → **önce Vazgeç'e basar ve hiçbir şeyin
yazılmadığını doğrular** → tekrar arşivler → panoya döner → kartın gittiğini, kontrol
kartının durduğunu doğrular → satırın DB'de `deletedAt` dolu olarak **durduğunu**,
`AuditEvent`in yazıldığını, detay sayfasının 404 verdiğini ve `getKpiMetrics().totalOffers`
değerinin **bir azaldığını** doğrular.

Ekran görüntüleri — `docs/agent-results/TASK-MTQZNBGENT12T-screenshots/`:

| Dosya | Ne gösteriyor |
|---|---|
| `01-board-before-archive.png` | Pano: **G0 sütununda 2 kart** |
| `02-effort-empty-state.png` | Efor sekmesi **boş durum** ("Bu fırsat için henüz efor kaydı yok"), toplam **0.0 AG** |
| `03-effort-logged.png` | Gerçek satır: `7 Eyl 2026 · Archive E2E Owner · 3.5 sa · Archive E2E — real effort row`, toplam **0.4 AG / 3.5 saat** |
| `04-archive-confirmation.png` | Onay adımı: *"…arşivlensin mi?"* + "Kayıt silinmez: geçmişi, kapı kararları ve efor kayıtları veritabanında kalır." |
| `05-board-after-archive.png` | Pano: **G0 sütununda 1 kart** (kontrol kartı duruyor) |
| `06-detail-404-after-archive.png` | Arşivlenen kaydın detay sayfası **404** |

### 2.3 SQL — kayıt DURUYOR, `deletedAt` dolu

`ARCHIVE_E2E_KEEP=1` ile ikinci koşu sonrası (fixture bırakıldı), doğrudan Postgres:

```
### Opportunity rows (archive fixture)
[
  { "id": "archive-e2e-opportunity",      "title": "Archive E2E — opportunity to archive",
    "deletedAt": "2026-09-07T11:35:40.063Z", "deletionReason": "archived_by_user" },
  { "id": "archive-e2e-opportunity-kept", "title": "Archive E2E — opportunity that stays",
    "deletedAt": null, "deletionReason": null }
]

### AuditEvent
[
  { "type": "opportunity.archived", "actorId": "archive-e2e-user",
    "target": "archive-e2e-opportunity",
    "data": { "stage": "G0", "title": "Archive E2E — opportunity to archive",
              "reason": "archived_by_user" } }
]

### Effort rows survive the archive
[
  { "id": "cmtr5zik9002nz5xk6urbmiqt", "opportunityId": "archive-e2e-opportunity",
    "userId": "archive-e2e-user", "hours": 3.5,
    "note": "Archive E2E — real effort row", "date": "2026-09-07T00:00:00.000Z" }
]
```

### 2.4 KPI gerçekten bir azalıyor

Arşivden sonra, aynı kiracı için:

```
{ "kpiTotalOffers": 1,       ← getKpiMetrics() ne sayıyor
  "hasAnyOpportunity": true,
  "rowsInTable": 2 }         ← Opportunity tablosunda kaç satır var
```

Tabloda 2 satır var, KPI 1 sayıyor. Aradaki fark tam olarak arşivlenen kayıt.
(e2e testi de bunu `kpiAfter.totalOffers === kpiBefore.totalOffers - 1` ile bağlıyor.)

### 2.5 Efor satırlarının SQL karşılığı

Ekrandaki tek satır (`03-effort-logged.png`) ile §2.3'teki `Effort` satırı birebir aynı:
`hours=3.5`, `note='Archive E2E — real effort row'`, `userId='archive-e2e-user'`
(→ `User.name = 'Archive E2E Owner'`, ekranda görünen ad). Tabloda satır yoksa ekranda da
satır yok — `02-effort-empty-state.png`.

### 2.6 Birim test

```
$ npx vitest run tests/opportunity-archive-permission.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### 2.7 i18n paritesi

```
$ npx tsx scripts/i18n-check.ts
"totalKeysInTurkish": 726,
"totalKeysInEnglish": 726,
```
İki dosya eşit; `missingIn*` listesindeki kayıtların tamamı `t(\`...${x}\`)` biçimindeki
dinamik anahtarlar — tarayıcının depoda zaten var olan bilinen yanlış pozitifi.

### 2.8 Seed idempotent (iki kez koşuldu)

```
$ npx tsx scripts/seed-archive-e2e.ts
[seed-archive-e2e] ready — ... clearedEfforts=0 clearedAuditEvents=0
$ npx tsx scripts/seed-archive-e2e.ts        # ikinci koşu
[seed-archive-e2e] ready — ... clearedEfforts=0 clearedAuditEvents=0
$ npx tsx scripts/seed-archive-e2e.ts --rollback
[seed-archive-e2e] rolled back
```

---

## 3. Değişen dosyalar

**Yeni**
- `src/lib/pipeline/archive.ts` — arşivleme yetki kuralı (tek kaynak)
- `tests/opportunity-archive-permission.test.ts` — yetki kuralı birim testi
- `tests/e2e/opportunity-archive.spec.ts` — gerçek tıklama e2e
- `scripts/seed-archive-e2e.ts` — e2e fixture (idempotent + `--rollback`)
- `docs/agent-results/TASK-MTQZNBGENT12T-screenshots/*.png` — 6 ekran görüntüsü

**Değişen — arşivleme + efor (bana verilen dosyalar)**
- `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` — `archiveOpportunity`, `logEffort`, Zod şeması
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/client.tsx` — Arşivle düğmesi + onay adımı, efor prop'u
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/effort.tsx` — mock söküldü, gerçek veri + boş durum + i18n
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/page.tsx` — `Effort` okuması, kişi adı çözümü, `canArchive`

**Değişen — `deletedAt` filtresi (liste / KPI / G0; DoD gereği)**
- `src/modules/m5/server/queries.ts` — 8 sorgu
- `src/lib/dashboard/fetch-metrics.ts` — temel filtre
- `src/app/[locale]/(app)/[workspace]/dashboard/export-csv.ts`
- `src/app/api/v1/opportunities/route.ts`
- `src/lib/scoring/g0-compute.ts` — `computeG0ForOpportunity`

**Değişen — ortak**
- `messages/tr.json`, `messages/en.json` — yalnız `Pipeline.detail.archive.*` + `Pipeline.detail.effortTab.*` eklendi
- `docs/DATA_MODEL.md` — §7.2 "Fırsat arşivleme"

**Migration:** yok. `Opportunity.deletedAt` / `deletionReason` şemada zaten vardı, RLS
kapsamındaydı. Bu iş yalnız o sütuna **ürün içinden bir giriş noktası** açtı.

---

## 4. Riskler

1. **Geri alma yok.** Arşivlenen kayıt üründen geri getirilemiyor; yalnız
   `UPDATE "Opportunity" SET "deletedAt" = NULL, "deletionReason" = NULL WHERE id = '<id>'`
   ile. Onay metni bunu kullanıcıya açıkça söylüyor. Geri-alma yolu **yazılı** ve tek satır.
2. **Arşivli kayıt hâlâ 14 sorguda okunabiliyor** (detay/modül sayfaları, §1 A.0 tablosu).
   Kullanıcı doğrudan URL yazarsa örneğin M8 eşleştirme sayfasını açabilir. Pano, liste, KPI,
   CSV, public API ve G0 kapalı; kalanlar §5'te açık kalem.
3. **Bellek içi fallback**: veritabanı reddettiği için yalnız `pipelineStore` buffer'ında duran
   bir fırsat arşivlenemez — action `OPPORTUNITY_NOT_FOUND` döner. Bu bilinçli: buffer'da
   arşivlenecek bir kayıt yok. Sunucu yeniden başlayınca buffer zaten boşalıyor.
4. **KPI filtresi geçmiş raporları değiştirir.** Bir fırsat arşivlendiği anda geçmiş tarih
   aralıklarındaki sayımlardan da düşer (kayıt bazlı filtre, tarih bazlı değil). Bu, "pano ne
   gösteriyorsa KPI onu saysın" kararının sonucu; farklı bir davranış istenirse ürün kararı gerekir.

---

## 5. Açık sorular

1. **Arşivden geri alma** — kartın açıkça kapsam dışı bıraktığı iş. Ayrı görev gerekiyor:
   `unarchiveOpportunity` action + arşiv listesi ekranı + `AuditEvent(type='opportunity.unarchived')`.
   Arşivli kayıtları görecek bir ekran olmadan geri alma da yapılamaz.
2. **Kalan 14 `deletedAt` filtresiz sorgu** — arşivli bir fırsatın detay/modül sayfalarından
   okunmaya devam etmesi. Sahibi belli olmayan/başka ajanlara ait dosyalar:
   `opportunities/[id]/{matching,evaluations,evaluations/panel,m2,documents,application,briefs}/page.tsx`,
   `modules/m{2,6,8,10,11}/server/*.ts`, `concept-notes/[id]/page.tsx`,
   `pipeline/[id]/consortium/**` (ex-en), `lib/gates/evaluate.ts` (blockzincir-pm).
   Tek bir görevde toplanıp tek elden kapatılması daha güvenli — dalga bitince önerilir.
3. **Efor düzenleme/silme yok.** Yanlış girilen bir efor satırı üründen düzeltilemiyor.
   `Effort.deletedAt` de şemada var ve aynı şekilde giriş noktasız.
4. **`deletionReason` sözlüğü.** `docs/DATA_MODEL.md` `subject_request | policy | tenant_cascade`
   diyor; arşivleme `archived_by_user` yazıyor (KVKK silme talebi değil, ürün eylemi olduğu için).
   Sözlüğün resmîleştirilmesi gerekiyorsa veri modeli kararı.
5. **Panodan arşivleme yok.** Eylem yalnız fırsat detayında. Kart menüsüne eklenmesi istenirse
   `board.tsx` gerekir — bu dalgada o dosyaya dokunulmadı.

---

## 6. Sonraki adım

- §5.2'deki 14 sorgu için tek bir "arşivli fırsat her yerden düşsün" görevi açılması.
- Geri alma (§5.1) için ayrı kart.
- Bu iş `dev` branch'ine yalnız kendi yollarıyla commit edildi.
