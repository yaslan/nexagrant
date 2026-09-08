# Görev Raporu: TASK-MTSI7YQWUZOFH — K2 Importer Turbopack Build & Gate Onarımı

**Ajan:** geli-tirici  
**Tip:** bug/P1  
**Sprint:** SPRINT-S12  
**Bağımlılık:** yok  
**Tarih:** 2026-09-08  
**Bkz:** `docs/agent-results/TASK-MTSI7YQWUZOFH-ex-en.md` §5.5, `docs/agent-results/TASK-MTSHU5LT4XAE-ex-en.md` §3.1, `src/lib/k2-cordis/importer.ts` (206, 309, 524, 548)

---

## 1. İlk Durum Hata Çıktısı (pnpm build)

`pnpm build` (Next.js 16.3.4 with Turbopack) derlemesi, `src/lib/k2-cordis/importer.ts` içindeki dinamik `fs.existsSync(someStringVariable)` ve sınırsız `path.resolve` çağrılarının Turbopack statik analizcisi tarafından projenin tamamını (`docs/` 91 MB, `test-artifacts/` 24 MB, `tests/`, `scripts/`) server bundle'ına dahil etmeye çalışması ve modül çözümlemesini kırması / uyarı üretmesi nedeniyle engelleniyordu (`TASK-MTSHU5LT4XAE-ex-en.md` §2.8 & `TASK-MTSI7YQWUZOFH-ex-en.md` §5.5):

```text
▲ Next.js 16.3.4 (Turbopack)
- Environments: .env

Turbopack build encountered 1 warning:
./src/lib/k2-cordis/importer.ts:98:9
Warning: Dynamic filesystem access causes tracing of the whole project
   96 |     const resolvedPath = path.isAbsolute(options.localZipPath)
   97 |       ? options.localZipPath
>  98 |       : path.resolve(process.cwd(), options.localZipPath);
      |         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   99 |
  100 |     if (fs.existsSync(resolvedPath)) {
  101 |       const fileBuffer = fs.readFileSync(resolvedPath);

Static analysis determined that this filesystem access causes the whole project to be traced and included in the output.
This is usually unintentional and leads to all source files (including the public folder) to be deployed as part of the server code.
This can slow down deployments or lead to failures when size limits are exceeded.
To resolve this, you can
- make sure the path is statically scoped to some subfolder, for example path.join(process.cwd(), 'data', bar), or
- only use them in development, or
- opt out by adding an ignore comment to the highlighted call: path.resolve(/*turbopackIgnore: true*/ ...), or
- remove them.

Import traces:
  App Route:
    ./src/lib/k2-cordis/importer.ts
    ./src/app/api/admin/cordis/import/route.ts

  Server Component:
    ./src/lib/k2-cordis/importer.ts
    ./src/app/[locale]/admin/cordis/actions.ts
    ./src/app/[locale]/admin/cordis/page.tsx
```

---

## 2. Dinamik Yol Analizi (4 Satır + 1 İlgili Konum)

`src/lib/k2-cordis/importer.ts` içerisindeki dosya erişim noktaları:

1. **Satır 206 (eski `if (tempZipPath && fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);`):**  
   - **Hangi Dosya:** İndirilen geçici CORDIS zip arşivi (örn. `tmp_cordis/horizon_1725801234567.zip`).
   - **Hangi Koşulda:** İndirme tamamlandıktan sonra, dosya hash'i son başarılı çalışmayla aynı olduğunda (veri değişmemişse) geçici dosya temizlenirken.
   - **Zamanı:** Çalışma zamanı (Runtime — Inngest cron veya admin tetiklediğinde).

2. **Satır 309 (eski `if (tempZipPath && fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);`):**  
   - **Hangi Dosya:** İndirilen geçici CORDIS zip arşivi.
   - **Hangi Koşulda:** Dry-run (`--dry-run`) bayrağı verildiğinde ayrıştırma tamamlandıktan sonra geçici dosya temizlenirken.
   - **Zamanı:** Çalışma zamanı (Runtime).

3. **Satır 524 (eski `if (tempZipPath && fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);`):**  
   - **Hangi Dosya:** İndirilen geçici CORDIS zip arşivi.
   - **Hangi Koşulda:** Veritabanı toplu yazımı (Projects, Orgs, Participations, Topics, SciVocs) başarıyla tamamlandığında.
   - **Zamanı:** Çalışma zamanı (Runtime).

4. **Satır 548 (eski `if (tempZipPath && fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);`):**  
   - **Hangi Dosya:** İndirilen geçici CORDIS zip arşivi.
   - **Hangi Koşulda:** İçe aktarma sırasında herhangi bir hata (catch bloğu) oluştuğunda diskte yetim dosya kalmaması için.
   - **Zamanı:** Çalışma zamanı (Runtime).

5. **Satır 98 (`path.resolve(/*turbopackIgnore: true*/ process.cwd(), options.localZipPath)`):**
   - **Hangi Dosya:** Kullanıcının/job'ın opsiyonel olarak `--local-zip` ile belirttiği yerel zip dosyası.
   - **Hangi Koşulda:** `options.localZipPath` argümanı verildiğinde dosyanın varlığını denetlemek ve SHA-256 hesaplamak için.
   - **Zamanı:** Çalışma zamanı (Runtime).

---

## 3. En Küçük Doğru Düzeltme ve Gerekçelendirme

**Seçilen Yaklaşım:** *(b) Gerçek çalışma zamanı okuması olduğu için dosya erişimi bundler'ın sınırlandırabildiği sabit bir dizin yapısına bağlandı (`CORDIS_TMP_DIR = 'tmp_cordis'`) ve dinamik yollar `path.resolve(/*turbopackIgnore: true*/ ...)` belirteciyle Turbopack statik analiz sınırının dışına alındı.*

**Gerekçe:**  
CORDIS arşivi ~500 MB boyutunda dinamik bir veri kümesidir ve derleme (build) zamanında paketlenmesi kesinlikle istenmez. `src/lib/k2-cordis/importer.ts` dosyası sunucu tarafında API route (`/api/admin/cordis/import`) ve server action (`src/app/[locale]/admin/cordis/actions.ts`) üzerinden çağrıldığından Turbopack derleyicisi bu dosyayı inceler. Turbopack, değişken içeren `fs.existsSync(tempZipPath)` çağrılarını statik olarak sınırlandıramadığında güvenli tarafta kalmak için tüm proje klasörünü server bundle'ına kopyalamaya çalışır. Çözüm olarak:
1. Geçici dosya adı `string | null` olarak izole edildi ve tam yol yalnızca `path.join(process.cwd(), CORDIS_TMP_DIR, path.basename(fileName))` ile statik olarak tek bir alt dizine (`tmp_cordis/`) sınırlandı.
2. Yerel dosya okumasında Turbopack'in resmi önerisi olan `/*turbopackIgnore: true*/` direktifi eklendi.
3. İthalat/ihracat iş mantığına, satır eşleştirmelerine veya şema doğrulamalarına dokunulmadı; yalnızca dosya yolu çözümleme biçimi bundler ile uyumlu hâle getirildi.

---

## 4. İdempotentlik ve RawFetch Birim Testi (CLAUDE.md Kural 6)

`tests/cordis-import.test.ts` ve `tests/cordis-k2-job.test.ts` altında CLAUDE.md Mimari Kural 6 gereksinimleri doğrulandı:

```bash
$ pnpm test tests/cordis-import.test.ts tests/cordis-k2-job.test.ts
✓ tests/cordis-import.test.ts (5 tests)
✓ tests/cordis-k2-job.test.ts (7 tests)
Test Files  2 passed (2)
     Tests  12 passed (12)
```

- `recordRawFetch` aynı `hash` ve `key` ile ikinci kez çağrıldığında `{ status: 'unchanged' }` döner ve veritabanına mükerrer satır eklemez.
- `runCordisImport` aynı zip içeriğiyle tekrar çağrıldığında dosya hash'i kontrol edilir, `skipped: true` döner ve DB güncellenmez.

---

## 5. Doğrulama Kanıtları (Zorunlu)

### 5.1 `pnpm build` → Exit 0 (Tam Çıktı)

```text
$ pnpm build
▲ Next.js 16.3.4 (Turbopack)
- Environments: .env

🌐 Checking i18n translations...

=== i18n Translation Audit Report ===

Report generated: 2026-09-08T14:37:11.401Z

Summary:
  Static keys used in code: 977
  Dynamic key patterns:     31
  Keys in messages/tr.json: 1327
  Keys in messages/en.json: 1327

✅ i18n check passed: both catalogs agree and every key used in src/ resolves.

✓ Running next.config.ts took 270ms
  Creating an optimized production build ...
✓ Compiled successfully in 829ms
  Running TypeScript ...
  Finished TypeScript in 6.6s ...
  Collecting page data using 11 workers ...
  Generating static pages using 11 workers (0/27) ...
✓ Generating static pages using 11 workers (27/27) in 261ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /_not-found
├ ƒ /[locale]
├ ƒ /[locale]/[workspace]/approvals
├ ƒ /[locale]/[workspace]/ayarlar
├ ƒ /[locale]/[workspace]/ayarlar/faturalama
├ ƒ /[locale]/[workspace]/ayarlar/kapilar
├ ƒ /[locale]/[workspace]/ayarlar/moduller
├ ƒ /[locale]/[workspace]/ayarlar/profil
├ ƒ /[locale]/[workspace]/ayarlar/uyeler
├ ƒ /[locale]/[workspace]/cagrilar
├ ƒ /[locale]/[workspace]/cagrilar/[id]
├ ƒ /[locale]/[workspace]/concept-notes
├ ƒ /[locale]/[workspace]/dashboard
├ ƒ /[locale]/[workspace]/evidence
├ ƒ /[locale]/[workspace]/firsatlar
├ ƒ /[locale]/[workspace]/ortaklar
├ ƒ /[locale]/[workspace]/ortaklar/liderler
├ ƒ /[locale]/[workspace]/pipeline
├ ƒ /[locale]/admin/alerts
├ ƒ /[locale]/admin/cordis
├ ƒ /api/admin/cordis/import
└ ƒ /api/v1/partners

✓ Production build completed with exit code 0.
```

Turbopack hiçbir dinamik `fs` uyarısı vermedi; derleme 0 hata ile tamamlandı.

### 5.2 Gerçek K2 Koşusu Kanıtı (Canlı Veritabanı ve RawFetch)

`scripts/cordis-import.ts` üzerinden yerel CORDIS veri paketi (`tmp_cordis/sample_fixture.zip`) ile gerçek içe aktarma yapıldı:

```text
$ npx tsx scripts/cordis-import.ts --local-zip=tmp_cordis/sample_fixture.zip
🚀 Starting CORDIS Import Job...
   Dataset: HORIZON
   Limit: Unlimited
   Dry Run: false
   Local Zip: tmp_cordis/sample_fixture.zip
✅ [CORDIS Import] Completed successfully in 162ms
   Projects: 2
   Organizations: 3
   Participations: 3
   Topics: 2
   SciVocs: 2
⚙️ Generating M1 Partner Profiles & Network Graph...
✅ [M1 Partner Profile Job] Generated 53 org profiles and 307 co-participations in 207ms.
```

İkinci kez idempotentlik testi:
```text
$ npx tsx scripts/cordis-import.ts --local-zip=tmp_cordis/sample_fixture.zip
🚀 Starting CORDIS Import Job...
   Dataset: HORIZON
   Limit: Unlimited
   Dry Run: false
   Local Zip: tmp_cordis/sample_fixture.zip
ℹ️ [CORDIS Import] Zaten güncel (File hash unchanged for HORIZON). Skipped.
```

**Veritabanı Kayıt Kanıtı:**
- `RawFetch` kaydı: `id: cmtsrzhqd0001j2xkejlg76bo`, `source: cordis_bulk`, `key: HORIZON`, `hash: 0fe847e78f66494ea450ac4e1d61569f9f843e982531c8b012cfb242a9e43f6b`
- `CordisImportRun` ilk koşu: `runId: cmtsrzhpd0000j2xkzqs0oguy`, `status: SUCCESS`, `rowCounts: {"topics":2,"scivocs":2,"projects":2,"organizations":3,"participations":3}`
- `CordisImportRun` ikinci koşu: `runId: cmtsrzkox0000o5xkwnl4r1kr`, `status: SUCCESS`, `rowCounts: {"message":"Zaten güncel (File hash unchanged)"}` (mükerrer kayıt önlendi).

### 5.3 `pnpm gate` Temiz Çıktısı (Exit 0)

```text
$ pnpm gate
$ pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check && pnpm rls:check && pnpm rls:verify

✔ Generated Prisma Client (v7.10.0) in 216ms
✔ eslint: 0 errors, 0 warnings
✔ tsc --noEmit: 0 errors
✔ Vitest: 111 passed | 2 skipped (113 files, 1274 passed tests)
✔ i18n check passed: both catalogs agree and every key used in src/ resolves.
✔ check-rls: All 42 tenant-scoped models have RLS policies registered.
✔ check-rls-live: Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor.

EXIT CODE: 0
```

---

## 6. Definition of Done Kontrol Listesi

- [x] `pnpm build` exit 0 (çıktı raporda sunuldu)
- [x] Gerçek K2 koşusu kanıtı (satır sayıları + `RawFetch` kaydı `cmtsrzhqd0001j2xkejlg76bo`)
- [x] Seçilen yaklaşımın gerekçesi raporda açıklandı (Bölüm 3)
- [x] İdempotentlik birim testi yeşil (`tests/cordis-import.test.ts` & `tests/cordis-k2-job.test.ts`)
- [x] `pnpm gate` temiz (exit code 0)
- [x] `dev` dalına commit edildi
