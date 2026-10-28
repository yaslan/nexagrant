# TASK-MVRIV9LCDHYKO — FO-186#fix · PR #200 düzeltme turu (be-fb)

**Hüküm: ONAYA HAZIR.** se-fb (B2, B3, D1, D2, D3) ve crw2 (B1, Ö1, Ö2, Ö4, Ö5) bulgularının hepsi kapatıldı. Her bulgunun bir testi var. Tam gate yeşil. Merge yapılmadı.

- Dal: `be-fb/fo186-m17-skeleton` · base `origin/dev` · önceki head `a9a64580`
- Kapsam dışı (kartta yazdığı gibi): se-B1/B4/B5 → FO-195 · crw2-Ö3 → F2

## Ne yapıldı — bulgu → commit → kod → test

| Bulgu | Commit | Kod | Test |
|---|---|---|---|
| **se-B2** gövde akışta sayılıyor, sınırı aşınca 413 | `852c0a4a` | `src/lib/read-capped.ts:9` `readCappedBytes`. `route.ts:65-74`: content-length yalnız dürüst istemci için kısayol, asıl kesim `readCappedBytes(req.body, maxFileBytes + maxFormOverheadBytes)`, sonra `formData()`. `limits.ts:37` `maxFormOverheadBytes` 64 KB. `csp-report.ts:145` aynı yardımcıyı kullanıyor | `tests/m17-interreg-upload-route.test.ts`: "cuts a chunked body without content-length at the cap, never reading on to its end" (başlıksız 25 MB chunked → 413, okunan ≤ sınır + 2 MB), "does not trust a content-length that understates the body, nor one that is not a number" (`100`, `abc`), "refuses an honest oversize content-length before reading the body" (< 1 KB okunur), "accepts a chunked upload under the cap…", "answers bad_form…" |
| **se-B3** DOCX derinlik sınırı, `maxDocxXmlBytes` düşürüldü | `852c0a4a` | `docx-text.ts:84-85, 157, 167`: iç içe tablo/paragraf `maxDocxNesting` (10) değerini geçince `malformed`. `limits.ts:44` 50 → 20 MB, `limits.ts:51` `maxDocxNesting: 10`. DOCX ayrıştırma sıralı kuyrukta | `m17-interreg-extract.test.ts`: "reads tables and paragraphs nested up to maxNesting and refuses one level more as malformed (se-fb B3)", "refuses the deeply nested table bomb fast, at either size (se-fb deeptbl)", "reads one document at a time and answers every caller", "stays linear on a hostile document" |
| **se-D2** NUL ve eşsiz vekil karakterler | `852c0a4a` | `extract.ts:42-45` `tidy`: NUL silinir, eşsiz vekil U+FFFD olur | "drops NUL and replaces lone surrogates a DOCX smuggles in as character references (se-fb D2)" (`&#0;` `&#xD800;`), "tidy keeps a valid surrogate pair and normalises line structure" |
| **crw2-Ö4** limitler ICU argümanı | `852c0a4a` | `limits.ts:61` `INTERREG_ERROR_ARGS {maxMb, maxChars}`. tr/en `too_large` `{maxMb}`, `too_long` `{maxChars, number}` | "takes the limits in the messages from INTERREG_ERROR_ARGS, formatted per locale (crw2 Ö4)": `createTranslator` ile tr "400.000", en "400,000". Mesaj metninde elle yazılmış limit kalmadı |
| **se-D1 + crw2-Ö5** bileşik FK ile kiracı/rubrik tutarlılığı | `ae38dcfc` | `schema.prisma`: Result `(analysisId, tenantId)`; Mark `rubricId` + `(analysisId, tenantId, rubricId)` ve `(criterionId, rubricId)`; hedef unique'ler. Migration: `add-interreg-review.sql:164` backfill + NOT NULL, `:191`, `:209`, `:215` yeni FK'lar, eski tek kolonlu FK'lar DROP | `m17-interreg-analyses.live.test.ts`: "a tenant cannot file a result or a mark under another tenant's analysis", "a mark cannot name a criterion of another rubric, nor claim another rubric for its analysis", "deleting the analysis still cascades to its result and marks" |
| **se-D3** rubrik tablolarında REVOKE | `ae38dcfc` | `add-interreg-review.sql:266`, `rls-app-role.sql:90,93` (adım 3c), `rls.sql:108`. Üç yerde var, çünkü `db:rls-role` her koşuda tüm tablolara DML veriyor | "rubric tables are read-only for fabrika_app at the privilege level (se-fb D3)": INSERT/UPDATE/DELETE/TRUNCATE → permission denied; "SELECT still works, and the seeded grid is intact" |
| **crw2-Ö1** durum kuralı tek kaynakta | `ae38dcfc` | `status.ts:11` yalnız `acceptsUpload` kaldı, `statusAfterUpload` silindi. Kuralın tek kopyası `analyses.ts:232` SQL `CASE` | Gerçek DB: "project alone stays UPLOADING; call then makes it READY…", "the call guide alone is CALL_READY", "DONE and FAILED fall back to the rule and drop the earlier F2 result and marks", "two uploads racing for the two slots end READY, every time" (8 tur), "a colleague's or another tenant's user gets not_found…", "ANALYZING refuses the upload as analysis_busy…" |
| **crw2-B1** seed geri okuyor, aynı id'de puanlama değişirse reddediyor | `596d07b4` | `prisma/seed-interreg-rubrics.ts:55` `seedRubric`: tek transaction. Mevcut kaydın puanlaması farklıysa `:63` reddeder; yazdıktan sonra DB'den okur, `rubricProblems` + puanlama karşılaştırması yapar (`:84`). DATA_MODEL §25 | `m17-interreg-rubric-seed.live.test.ts`: "writes the grid and a second run changes nothing", "a renamed criterion key under the same id is refused, and nothing is written", "passRaw 37 → 36 under the same id is refused", allowedMarks/knockout/düşen kriter (`test.each`), "a text correction under the same id is written", "a value the column rounds is caught on read-back and rolled back", "inconsistent data is refused before the database is touched" |
| **crw2-Ö2** mutant boşlukları + FO-187 altın testi | `a6bf6741` | `tests/fixtures/m17/fo187-bsb-call2-regular.json`: FO-187 §5.2 JSON'u birebir alındı (14 kriter) | `m17-interreg-rubric.test.ts`: "seeded rubric = FO-187 §5.2, field by field" (4 test: id/label/source/scale/totals, knockout + tie-break, 14 kriterin tüm metinleri sırasıyla, programme checks), "refuses an allowed mark above its own criterion maximum (mark_not_allowed)", "a mark equal to the knockout floor is not a knockout; one step below is", "rubricProblems: the boundaries are inclusive where the rule says so" (knockoutBelow == maxMark, passRaw == maxRaw), "rubricProblems: no criteria, no allowed marks, a maximum that is not an allowed mark" |

## Kanıt (ham çıktı)

### deeptbl (se-fb'nin saldırı dosyası, yeniden üretildi)
| | önce (se-fb ölçümü) | sonra |
|---|---|---|
| 49 MB document.xml (zip 122 KB) | ~564 MB RSS, ~1 s, ayrıştırıldı | 27 ms, RSS +23 MB, `too_large` (20 MB sınırı) |
| 19 MB document.xml (zip 47 KB) | — | 26 ms, RSS +38 MB, `malformed` (derinlik 10) |

### Mutasyon kanıtı (D1/D3)
Eski FK ve GRANT duran bir DB'de `m17-interreg-analyses.live.test.ts` koşuldu: **7 test kırmızı** (yabancı kiracıya sonuç/puan yazılabildi, başka rubriğin kriteri bağlanabildi, rubrik tablosuna INSERT/UPDATE/DELETE/TRUNCATE geçti). Migration uygulanınca 14/14 yeşil oldu, grid'deki 14 kriter yerinde kaldı.

### Migration iki kez + taze kurulum
- Eski sürüm DB üzerinde migration iki kez koşuldu, ikisi de başarılı. `rubricId` backfill doğrulandı.
- Boş DB'de `pnpm db:setup` iki kez koşuldu: `run1 exit 0`, `run2 exit 0`.
- Taze DB'de sorgu sonucu (ham):
```
"InterregAnalysisResult" | InterregAnalysisResult_analysisId_tenantId_fkey | FOREIGN KEY ("analysisId", "tenantId") REFERENCES "InterregAnalysis"(id, "tenantId") ON UPDATE CASCADE ON DELETE CASCADE
"InterregCriterionMark" | InterregCriterionMark_analysisId_tenantId_rubricId_fkey | FOREIGN KEY ("analysisId", "tenantId", "rubricId") REFERENCES "InterregAnalysis"(id, "tenantId", "rubricId") ON UPDATE CASCADE ON DELETE CASCADE
"InterregCriterionMark" | InterregCriterionMark_criterionId_rubricId_fkey | FOREIGN KEY ("criterionId", "rubricId") REFERENCES "InterregRubricCriterion"(id, "rubricId") ON UPDATE CASCADE ON DELETE RESTRICT
grant InterregRubric SELECT
grant InterregRubricCriterion SELECT
rubrics 1
criteria 14
mark.rubricId nullable=NO
```
`prisma db push` ile migration aynı FK adlarını üretiyor; çift FK kalmıyor.

### Yerel gate (taze DB'ye karşı)
```
pnpm lint       ✖ 4 problems (0 errors, 4 warnings)   # 4 uyarı da bu PR dışındaki dosyalarda
pnpm typecheck  tsc --noEmit  (hata yok)
pnpm test       Test Files  434 passed | 3 skipped (437)
                Tests  5771 passed | 57 skipped (5828)
M17 dosyaları   5 passed (5), 77 passed (77): live testler atlanmadan koştu
pnpm rls:check  ✅ SUCCESS
pnpm rls:verify ✅ 51 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

### İzole tam gate + push
`bash scripts/gate-isolated.sh git push origin be-fb/fo186-m17-skeleton` → exit 0. Taze pgvector/pg16 konteyner, `--no-verify` kullanılmadı. Ham özet:
```
→ veritabanı: localhost:55402/fabrika_gate
✅ Kilit alındı (4 dk 20 sn beklendi).
✖ 4 problems (0 errors, 4 warnings)
 Test Files  435 passed | 2 skipped (437)
      Tests  5774 passed | 54 skipped (5828)
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
✅ SUCCESS: All 51 tenant-scoped models have RLS policies registered.
✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
✅ SUCCESS: no new tenant bypass. 0 call site(s) allowed with a recorded reason, 50 on the sanctioned cross-tenant path, 0 still owed.
✅ 51 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü: okuma ve yazma, kiracı sınırında reddedildi.
  4 skipped
  443 passed (9.4m)
✅ Öksüz alarm yok: her açık alarm ya bir tenant adı taşımıyor ya da yaşayan bir tenant’ı gösteriyor.
   a9a64580..a6bf6741  be-fb/fo186-m17-skeleton -> be-fb/fo186-m17-skeleton
```
e2e sırasında WebServer, `src/instrumentation.ts`'teki `process.exit` için "Node.js API … not supported in the Edge Runtime" uyarısı basıyor. Dosya dev'den geliyor (`9b63111d`), bu PR'da değişmedi.

## Değişen dosyalar
`src/lib/read-capped.ts` (yeni), `src/lib/csp-report.ts`, `src/app/api/interreg-review/analyses/[id]/documents/route.ts`, `src/modules/m17/{limits.ts, server/docx-text.ts, server/extract.ts, server/status.ts, server/analyses.ts, server/rubrics.ts}`, `prisma/{schema.prisma, migrations/add-interreg-review.sql, rls-app-role.sql, rls.sql, seed-interreg-rubrics.ts}`, `messages/{tr,en}.json`, `docs/DATA_MODEL.md` §25, testler: `tests/m17-interreg-{upload-route, analyses.live, rubric-seed.live}.test.ts` (yeni), `tests/m17-interreg-{extract, rubric}.test.ts`, `tests/fixtures/m17/fo187-bsb-call2-regular.json` (yeni).

## Riskler
- **Worker'a taşımadım (B3):** DOCX ayrıştırması hâlâ istek sürecinde yapılıyor. Derinlik sınırı, 20 MB XML sınırı ve sıralı kuyruk birlikte en kötü durumu ölçülen ~40 MB / ~30 ms'ye indiriyor. Ayrı bir süreç yalnız bunun için yeni bir işletim yüzeyi açardı. Gerekirse FO-195 ile birlikte ele alınabilir.
- `maxDocxNesting` 10: gerçek belgeler 2-3 seviyede kalıyor. Daha derin ama meşru bir belge `malformed` alır ve kullanıcıya "bozuk ya da desteklenmeyen yapı" mesajı gösterilir.
- Canlı DB'de migration'ın yükseltme bloğu `InterregCriterionMark`'ı backfill ediyor. F1'de bu tabloya yazan yok, yani tablo boş olmalı. Yine de blok analizden kopyalıyor ve ardından NOT NULL koyuyor.
- Commit'ler bulgu gruplarına göre ayrıldı. `limits.ts` ve extract testi B2/B3/D2/Ö4'ü birlikte taşıdığı için bu dört bulgu tek commit'te (`852c0a4a`).

## Açık sorular
Yok.

## Sonraki adım
se-fb ve crw2 delta incelemesi (PR #200, `a9a64580..a6bf6741`). Merge lider kararı.

**Platform kapsamı:** hepsi (mac/Windows/Linux). Sunucu tarafı Node + Postgres kodu, işletim sistemine özgü yol yok. Doğrulama macOS (darwin) + Docker pgvector/pg16 üzerinde yapıldı.
