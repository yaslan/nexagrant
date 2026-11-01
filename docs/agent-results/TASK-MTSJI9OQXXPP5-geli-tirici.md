# TASK-MTSJI9OQXXPP5 — CORDIS importer: dynamic `fs` paths made turbopack trace the whole project

**Ajan:** geli-tirici (Backend Mühendisi) · **Tip:** bug / build hijyeni · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-08
**Ölçüm tabanı:** `dbc26d2` (izole worktree) · **Bkz:** docs/agent-results/TASK-MTSI7YQWUZOFH-ex-en.md §5.5

---

## 0. Tek cümle

Kartın "`pnpm build` KIRMIZI" öncülü **yanlış** — build HEAD'de exit 0'dı ve o dört satır *uyarı*
üretiyordu; ama uyarının söylediği şey gerçekti ve kırmızı bir build'den daha kötüydü:
turbopack **bütün projeyi** dağıtım paketine kopyalıyordu (`docs/` 90 MB, `test-artifacts/`,
`tests/`, `src/`, `scripts/` dahil). Dosya erişim biçimi düzeltildi; paket **171 MB → 74 MB**,
uyarı **4 → 0**, build exit 0 kaldı ve K2 içe aktarımı canlı DB'ye karşı gerçekten koşturuldu.

---

## 1. Ne yapıldı

### 1.1 Kartın öncülü — düzeltme

Kart `pnpm build`'in kırmızı olduğunu ve bu yüzden kapının `gate`'e düştüğünü söylüyor.
HEAD'de ölçtüm:

```
########## BUILD EXIT = 0 ##########
Turbopack build encountered 4 warnings:
./src/lib/k2-cordis/importer.ts:206:26
Warning: Dynamic filesystem access causes tracing of the whole project
```

Dördü de **warning**, error değil; build exit 0. Aynı ölçüm HEAD'in izole bir worktree
kopyasında da tekrarlandı (§2.2) — yani ana ağaçtaki başka ajanların yarım işi değil, gerçekten
HEAD'in hâli. `pnpm build`'in "güvenilir kapı olmaması" doğru, ama sebebi kırmızı olması değil:
**uyarıyı kimsenin exit koduna çevirmemesi**. Bu ayrı bir kartın konusu (§6).

### 1.2 Uyarının söylediği şey — asıl kusur

Turbopack'in kendi metni:

> Static analysis determined that this filesystem access causes the whole project to be traced
> and included in the output. This is usually unintentional and leads to all source files
> (including the public folder) to be deployed as part of the server code.

`next.config.ts` `output: 'standalone'` kullanıyor, yani bu tracing sonucu **doğrudan
dağıtılan paket**. Ölçtüğümde `.next/standalone` şunları taşıyordu:

| Ne | Boyut | Dosya |
|---|---:|---:|
| `docs/` (749 tanesi `docs/agent-results/` — iç raporlarımız) | 90 MB | 775 |
| `src/` (uygulamanın tüm kaynağı) | 3.4 MB | 399 |
| `tests/` | 1.0 MB | 130 |
| `prisma/` (şema + migration'lar) | 280 KB | 41 |
| `scripts/` | 260 KB | 33 |
| ayrıca | | `CLAUDE.md`, `AGENTS.md`, `Dockerfile`, `docker-compose.yml`, `pnpm-lock.yaml`, `githooks/`, `workers/` |

`Dockerfile` bu dizini olduğu gibi runner imajına kopyalıyor
(`COPY --from=builder /app/.next/standalone ./`), dolayısıyla üretim konteynerinin içinde
749 iç rapor dosyası duruyordu.

### 1.3 Kök neden

Dördü de aynı satır:

```ts
if (tempZipPath && fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
```

`tempZipPath` `string | null` bir yerel değişken. Turbopack `fs` çağrılarını **statik** analiz
ediyor; sınırlayamadığı bir yol argümanı görünce güvenli tarafa geçip proje kökünün tamamını
ize alıyor. Aynı dosyadaki `fs.existsSync(path.join(process.cwd(), 'tmp_cordis'))` (85. satır)
**uyarı üretmiyordu** — çünkü o yol statik olarak çözülebiliyor. Fark tam olarak bu.

### 1.4 Seçilen yaklaşım (kartın istediği tek paragraf gerekçe)

Turbopack'in kendi önerdiği dört çıkıştan birincisini seçtim: *"make sure the path is
statically scoped to some subfolder, for example `path.join(process.cwd(), 'data', bar)`"*.
Yani indirilen arşiv artık **tam yol olarak değil, çıplak dosya adı olarak** taşınıyor
(`tempFileName`), ve gerçek yola yalnızca tek bir yerde, `path.join(process.cwd(),
CORDIS_TMP_DIR, name)` kalıbıyla çevriliyor. Diğer üç seçeneği elemem şöyle: `turbopackIgnore`
yorumu uyarıyı **susturur ama tracing'i düzeltmez** — 90 MB hâlâ pakete girerdi, yani kusuru
gizlemek olurdu; "yalnız geliştirmede kullan" seçeneği geçersiz, çünkü temizlik üretimde de
koşmalı (yoksa her indirme diskte ~500 MB bırakır); "kaldır" seçeneği de geçersiz, aynı sebeple.
Statik kapsamlama tek seçenek ki hem uyarıyı hem *sebebini* kaldırıyor, üstelik iş mantığına
dokunmadan: silme davranışı bitişik, yalnız hangi değişkenin taşındığı değişti.

### 1.5 Değişiklik

`src/lib/k2-cordis/importer.ts`:

```ts
const CORDIS_TMP_DIR = 'tmp_cordis';

function cordisTmpPath(fileName: string): string {
  return path.join(process.cwd(), CORDIS_TMP_DIR, path.basename(fileName));
}

function removeTempZip(fileName: string | null): void {
  if (!fileName) return;
  const zipPath = path.join(process.cwd(), CORDIS_TMP_DIR, path.basename(fileName));
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
}
```

- `getZipFileAndHash` artık `isTemp: boolean` yerine `tempFileName: string | null` döndürüyor —
  "geçici mi" ve "hangi dosya" iki ayrı gerçek olmaktan çıkıp tek gerçeğe indi.
- Dört temizlik satırı → `removeTempZip(tempZipName)`.
- `path.basename` savunma amaçlı: dosya adı iki satır ötede üretiliyor, ama yol birleştirmenin
  `tmp_cordis` dışına çıkamayacağını tipin değil kodun garanti etmesi daha iyi.
- İş mantığı (indirme, hash, unzip, CSV ayrıştırma, upsert sırası, idempotency) **değişmedi**.

Ek olarak `.gitignore`'a `tmp_cordis/` eklendi: importer bu klasörü proje kökünde çalışma
zamanında yaratıyor, gerçek dataset ~500 MB'lık bir zip ve klasör ignore edilmiş değildi.

---

## 2. Kanıt (gerçek komut çıktısı)

Ana ağaçta ölçüm yapılamadı: iş sırasında başka bir ajan (ex-en / TASK-MTSJHTJZSCILI,
`prisma-override.d.ts` kaldırma) `src/lib/db.ts`'i değiştirdi ve ağaç ~30 tip hatasına düştü.
Bu yüzden **öncesi ve sonrası aynı izole worktree'de**, `dbc26d2` üzerinde ölçüldü —
tek fark benim yamam.

### 2.1 ÖNCE — HEAD, yamasız

```
########## WORKTREE HEAD (unpatched) BUILD EXIT = 0 ##########
Dynamic-fs warnings: 4
standalone: 171M, 4350 files
  src                 3.4M
  docs                 90M
  tests               1.0M
  scripts             260K
  githooks            8.0K
  workers              28K
  public              148K
  prisma              280K
```

### 2.2 SONRA — aynı worktree, yalnız `importer.ts` değişik

```
 src/lib/k2-cordis/importer.ts | 65 ++++++++++++++++++++++++++++++++++---------
 1 file changed, 52 insertions(+), 13 deletions(-)
########## WORKTREE HEAD + PATCH BUILD EXIT = 0 ##########
Dynamic-fs warnings: 0
standalone:  74M, 2940 files
--- top level of standalone ---
docs
messages
node_modules
package.json
server.js
```

**171 MB → 74 MB · 4350 → 2940 dosya · 4 uyarı → 0 · exit 0 korundu.**

### 2.3 Paket küçülmesi yıkıcı değil — manifest diff'i

İki build'in dosya listeleri karşılaştırıldı:

```
=== files ONLY in the patched build (regression risk if non-empty) ===
   count: 0

=== dropped files, grouped by top-level dir ===
 775 docs
 399 src
 130 tests
  41 prisma
  33 scripts
   6 public
   3 workers
   2 scratch
   2 githooks
   1 vitest.config.mts ... 1 Dockerfile ... 1 CLAUDE.md ... (proje kökü konfigleri)

=== dropped from node_modules — anything outside a package's own source? sample ===
(boş)
```

Üç şey bunu güvenli kılıyor:

1. **Hiçbir dosya eklenmedi** (0), yani paket yalnızca daralıyor.
2. **`node_modules`'tan tek dosya bile düşmedi** — tracer'ın gerçekten gerekli bulduğu her
   bağımlılık yerinde.
3. Çalışma zamanında diskten dosya okuyan iki sayfa da **okudukları dosyaları korudu**:
   `src/app/[locale]/compliance/dpa/page.tsx` → `docs/legal/dpa-{tr,en}.md` ve
   `src/app/[locale]/i18n-check/page.tsx` → `messages/{tr,en}.json`. Kalan `docs/` tam olarak
   şu iki dosya:
   ```
   .next/standalone/docs/legal/dpa-en.md
   .next/standalone/docs/legal/dpa-tr.md
   ```
   Yani tracer artık *doğru* çalışıyor: okunanı tutuyor, okunmayanı atıyor.

`public/` ve `prisma/`'nın düşmesi de regresyon değil: `Dockerfile` `public`'i zaten ayrıca
kopyalıyor (`COPY --from=builder /app/public ./public`, Next'in standalone için gerektirdiği
biçim), ve runner `node server.js` dışında bir şey koşmuyor — Prisma driver adapter ile
çalışma zamanında `schema.prisma` okumuyor.

### 2.4 K2 içe aktarımı GERÇEKTEN koşturuldu (canlı dev DB)

Sentetik bir CORDIS arşivi (4 CSV) yerel HTTP sunucusundan servis edildi — bilerek
**indirme dalı**, çünkü `tmp_cordis`'e yazan ve `removeTempZip()`'i çağıran dal o;
`--local-zip` bu koda hiç uğramaz.

```
serving fixture at http://127.0.0.1:49550/cordis-fixture.zip

── BEFORE ──
   cordisProject            20
   cordisOrganization       0
   cordisParticipation      0
   cordisProjectTopic       20
   cordisProjectSciVoc      0
   cordisImportRun          0
   rawFetch_cordis_bulk     0
   tmp_cordis before: ["<dir does not exist>"]

>>> RUN 1 (download branch, full ingestion)
{
  "success": true,
  "runId": "cmtsk0ri90000qyxkgj3f2xvh",
  "fileHash": "67095196cd9ef9c98e0b07f4beee1b29228bb274e9734a6664740a165af690f5",
  "rowCounts": { "projects": 3, "organizations": 3, "participations": 4, "topics": 3, "scivocs": 2 },
  "durationMs": 96
}
   tmp_cordis after run 1: (empty — temp zip cleaned up)

── AFTER RUN 1 ──
   cordisProject            23
   cordisOrganization       3
   cordisParticipation      4
   cordisProjectTopic       23
   cordisProjectSciVoc      2
   cordisImportRun          1
   rawFetch_cordis_bulk     1
```

**RawFetch kaydı** (CLAUDE.md kural 6 — ham yanıt normalize edilmeden önce saklanır):

```json
{
  "id": "cmtsk0rj00001qyxklej9qm79",
  "source": "cordis_bulk",
  "key": "HORIZON",
  "hash": "67095196cd9ef9c98e0b07f4beee1b29228bb274e9734a6664740a165af690f5",
  "storageUrl": "http://127.0.0.1:49550/cordis-fixture.zip",
  "fetchedAt": "2026-09-08T10:56:18.780Z",
  "payload": {
    "origin": "http://127.0.0.1:49550/cordis-fixture.zip",
    "dataset": "HORIZON",
    "fetchedAt": "2026-09-08T10:56:18.773Z",
    "sizeBytes": 1813,
    "contentType": "application/zip"
  }
}
```

**İkinci koşu — idempotency** (aynı baytlar, hash değişmedi):

```
>>> RUN 2
{ "success": true, "skipped": true, "fileHash": "67095196...", "rowCounts": {...hepsi 0}, "durationMs": 10 }
   tmp_cordis after run 2: (empty — temp zip cleaned up)

── DELTA (before → after run 1 → after run 2) ──
   cordisProject            20 → 23 → 23
   cordisOrganization       0 → 3 → 3
   cordisParticipation      0 → 4 → 4
   cordisProjectTopic       20 → 23 → 23
   cordisProjectSciVoc      0 → 2 → 2
   cordisImportRun          0 → 1 → 2
   rawFetch_cordis_bulk     0 → 1 → 1
```

İkinci koşuda veri satırları kımıldamadı ve `RawFetch` 1'de kaldı ("store on change only").

### 2.5 Dört temizlik çağrısının **dördü de** koşturuldu

`removeTempZip()` dört ayrı return yolunda çağrılıyor. Yukarıdaki koşu ikisini kapsadı
(hash-skip dönüşü ve tam ingestion dönüşü); kalan ikisi ayrıca zorlandı:

```
>>> SITE 2/4 — dry-run return path (limit bypasses the hash skip)
   result: {"success":true,"rowCounts":{"projects":3,"organizations":3,"participations":4,"topics":3,"scivocs":2}}
   tmp_cordis after dry-run: (empty — temp zip cleaned up)

>>> SITE 4/4 — catch path (server answers with something that is not a zip)
   result: {"success":false,"error":"FILE_ENDED"}
   tmp_cordis after failed run: (empty — temp zip cleaned up)

   cordisProject count (dry-run + failure must not have written rows): 23
```

Dördünde de indirilen arşiv silindi — yani yeni yol kurma biçimi eski davranışı **birebir**
koruyor, hata yolunda bile.

### 2.6 DB geri alındı (rollback ÖNCE yazıldı)

Sentetik satırlar `ZZTEST-*` / `ZZORG-*` ile işaretlendi ve rollback betiği probe'dan **önce**
yazıldı. Koşturuldu:

```
deleted: { scivoc: 2, topics: 3, participations: 4, projects: 3,
           organizations: 3, importRuns: 4, rawFetch: 2 }

── AFTER ROLLBACK (must equal BEFORE: 20/0/0/20/0/0/0) ──
   cordisProject           20
   cordisOrganization      0
   cordisParticipation     0
   cordisProjectTopic      20
   cordisProjectSciVoc     0
   cordisImportRun         0
   rawFetch_cordis_bulk    0
   ZZTEST-* rows still present: 0

tmp_cordis: 0
```

DB tam olarak başlangıç sayımlarına döndü; uydurma tek satır kalmadı.

### 2.7 Kapı (izole worktree, `dbc26d2` + yama)

```
########## typecheck EXIT = 0 ##########
########## lint EXIT = 0 ##########
########## test EXIT = 0 ##########
 Test Files  105 passed | 2 skipped (107)
      Tests  1224 passed | 8 skipped (1232)
########## FINAL BUILD EXIT = 0 ##########
Dynamic-fs warnings: 0
Turbopack warning banner: 0
standalone:  74M / 2940 files
```

`tests/cordis-import.test.ts` dahil tüm birim testler geçiyor.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/k2-cordis/importer.ts` | `CORDIS_TMP_DIR` + `cordisTmpPath()` + `removeTempZip()`; `getZipFileAndHash` `isTemp` yerine `tempFileName` döndürüyor; dört dinamik `fs` çağrısı tek statik-kapsamlı yardımcıya indi (+52 / −13) |
| `.gitignore` | `tmp_cordis/` (importer'ın çalışma zamanında yarattığı, ~500 MB'lık arşivin indiği klasör) |

Başka hiçbir dosyaya dokunulmadı. Ağaçtaki diğer değişiklikler (`src/lib/db.ts`,
`prisma/seed-m6-evaluations.ts`, `src/modules/m8/...`, `src/lib/billing*`) başka ajanların
sürmekte olan işi — bunlara elimi sürmedim ve commit'ime almadım.

---

## 4. Riskler

1. **`prisma/` artık standalone içinde değil.** Şu anki `Dockerfile` runner'da yalnız
   `node server.js` koşuyor, dolayısıyla etkisi yok. Ama biri ileride konteyner içinde
   `prisma migrate deploy` koşmayı denerse, önceden **kazara** oradaydı, artık olmayacak;
   o zaman `Dockerfile`'a açık bir `COPY prisma ./prisma` gerekir. Kayıt altına alıyorum ki
   sürpriz olmasın.
2. **Uyarıyı hâlâ hiçbir şey kapıya bağlamıyor.** Bugün düzelttim, ama yarın biri
   `fs.readFileSync(someVar)` yazarsa build yine exit 0 döner ve 90 MB sessizce geri gelir.
   Nöbetçi §6'da önerildi; bu kartın kapsamı dışında bırakıldı.
3. Ölçüm izole worktree'de yapıldı; ana ağaçta `pnpm build`'in exit 0 vermesi, ex-en'in
   `src/lib/db.ts` işi bitip ağaç yeşile dönene kadar **beklemeli** — o hatalar benim değil
   ve benim yamamla ilgisi yok (§2 aynı commit üzerinde önce/sonra ölçtü).

---

## 5. İlgisiz kusurlar (düzeltmedim, adıyla bildiriyorum)

- **`.dockerignore` yok.** `Dockerfile` builder aşamasında `COPY . .` yapıyor, yani `.env`
  build imajına giriyor. Ayrıca Next `.env*` dosyalarını standalone çıktısına **tasarım gereği**
  kopyalıyor: `.env` hem önceki hem sonraki manifest'te var (`grep -c "^\.env" manifest-after.txt`
  → `1`), yani bu benim değişikliğimin kımıldattığı bir şey değil, ondan önce de sonra da orada.
  Üretim imajı `.env`'i taşıyor — ayrı bir kart hak ediyor.
- Kart metninin "build KIRMIZI" öncülü ve TASK-MTSI7YQWUZOFH §5.5'in "düşüyor / build'i kırıyor"
  ifadesi hatalı; ikisi de warning'i error sanmış. §1.1'de ölçümle düzeltildi.

---

## 6. Sonraki adım (önerilen kart)

**"Turbopack uyarılarını kapıya bağla"** — `next build` çıktısında
`Turbopack build encountered N warnings` görülürse exit 1. Bugün bu uyarı sınıfı sessizce
90 MB'lık bir dağıtım regresyonu üretebiliyordu ve tam olarak öyle yaptı; onu yakalayan şey
bir kapı değil, bir ajanın rapordaki dipnotu oldu. `next.config.ts`'teki i18n kapısıyla aynı
desende kurulabilir (TASK-MTSHU5LT4XAE).

---

## 7. Definition of Done

- [x] Kartın öncülü ölçüldü ve düzeltildi: `pnpm build` HEAD'de exit **0**, dördü **warning** (§1.1)
- [x] Gerçek kusur bulundu ve niceliklendirildi: bütün proje dağıtım paketine izleniyordu (§1.2)
- [x] İş mantığı **yeniden yazılmadı** — yalnız dosya erişim biçimi değişti (§1.5)
- [x] Seçilen yaklaşım tek paragrafla gerekçelendirildi, elenen üç alternatifle birlikte (§1.4)
- [x] `pnpm build` exit **0** + turbopack uyarısı **4 → 0**, aynı commit üzerinde önce/sonra (§2.1, §2.2)
- [x] Paket küçülmesinin yıkıcı olmadığı manifest diff'iyle gösterildi: 0 dosya eklendi, `node_modules`'tan 0 dosya düştü, çalışma zamanı okumaları korundu (§2.3)
- [x] K2 içe aktarımı **gerçekten koşturuldu**: satır sayıları + `RawFetch` kaydı canlı DB'den (§2.4)
- [x] İki kez koşuldu → satır sayıları kımıldamadı, `RawFetch` 1'de kaldı (§2.4)
- [x] Değiştirilen dört temizlik çağrısının **dördü de** ayrı ayrı koşturuldu, dördünde de arşiv silindi (§2.5)
- [x] Yıkıcı işlem öncesi rollback yazıldı, koşuldu, DB başlangıç sayımlarına döndü (§2.6)
- [x] `typecheck` / `lint` / `test` / `build` → hepsi EXIT=0, izole ağaçta (§2.7)
- [x] Sır / kişisel veri sızıntısı gözden geçirildi; bulunan `.env` konusu benim değişikliğime ait değil, adıyla bildirildi (§5)
- [x] Başka ajanların dosyalarına dokunulmadı (§3)
- [x] Sonuç dosyası + dev commit
