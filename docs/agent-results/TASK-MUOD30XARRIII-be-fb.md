# TASK-MUOD30XARRIII — be-fb — FB TEST: İNCELEME-105 Ö-1/Ö-2/Ö-3 (CORDIS düzeltmesini testle kilitleme)

**Durum: TAMAM**

## 1. Ne yapıldı
- Dal: `be-fb/muod30-cordis-tests` (dev `be797148`'den), kendi worktree'mde. İzole DB: `befb-muod30-pg` (pgvector pg16, 127.0.0.1:55130). CI sırasıyla kuruldu: push → rls-role → migrations ×2 → rls → seed (`ekler/db-prep.txt`). Her koşudan önce `DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55130/fabrika` echo ile doğrulandı. Worktree'de `.env` yok; paylaşılan `fabrika` :5433'e hiçbir şey yazılmadı.
- **Ö-1:** fe-fb düzeltmesinin (8ca11f55) her vaadi ve her katmanı için ayrı test yazıldı. Her katmanı tek başına kapatan mutantlar koşuldu (§2.1). Üretim kodu değişmedi.
  - **Katman 1, importer'ın kod seçimi:** `tests/cordis-csv.test.ts` içindeki yeni `runCordisImport — failure code and where the text goes` bloğu. Gerçek importer dört farklı yakalanan değerle koşuluyor: `Error`, `.code` alanlı `Error`, adı `CordisSkipLimitError` olan sahte `Error` ve fırlatılan düz dizgi. Sonucun `errorCode`'u `IMPORT_FAILED` olmalı, anahtarları izinli kümeden çıkmamalı ve metin içermemeli.
  - **Katman 2, eylemdeki whitelist:** yeni `tests/admin-cordis-failure-code.test.ts`. Buradaki importer bir stub ve `errorCode` alanına ham metin koyuyor, ayrıca `error` ve `skippedRecords` ekliyor. Mevcut testler gerçek importer'ı kullandığı için katman 2 hiç kötü bir kod görmüyordu, bu yüzden silinse fark edilmezdi. Artık eylemin dönüşü `toStrictEqual({success:false, errorCode:'IMPORT_FAILED'})` ile kilitli.
  - **Whitelist fonksiyonu tek başına:** `cordisImportFailureCode` testi. Listedeki iki kod olduğu gibi geçiyor. Ham metin, `fetch failed`, çeviri anahtarına benzeyen bir dizgi, küçük harfli kod, `toString`, boş dizgi, `undefined`, `null`, sayı ve `Error` ise `IMPORT_FAILED` oluyor.
  - **Vaat (a), eylem dönüşünde iç metin yok:** katman 1 ve katman 2 testleri birlikte bunu kilitliyor. Mevcut gerçek-importer eylem testleri de duruyor.
  - **Vaat (b), `handleGetK2Status` saklı hata metnini döndürmez:** `lastRun`'ın anahtar kümesi tam olarak 7 kolona eşitlenip test ediliyor. `rowCounts: null` iken `error`'a düşen bir yedekleme olmadığı da kontrol ediliyor.
  - **Ayrıntının kaybolmadığı vaadi** (İNCELEME-105'te B6 ve B7 bu yüzden yaşıyordu): iki durum var, indirme hatası ve atlama sınırının aşılması. İkisinde de `logger.error('[k2-cordis] import failed', <hata>, {runId, dataset, errorCode})` çağrısı, run satırındaki `error` ve alarmın `meta.error` alanı içerikleriyle birlikte kontrol ediliyor.
  - **İstemci** (İNCELEME-105 B11/B12): yeni `tests/admin-cordis-client-import-error.test.tsx` (jsdom). Gerçek `CordisRagAdminClient` tr mesajlarıyla render ediliyor ve "Şimdi Çalıştır" tıklanıyor. Üç durum kontrol ediliyor: fırlatan eylem → IMPORT_FAILED cümlesi; listede olmayan kod → IMPORT_FAILED cümlesi; `SKIP_LIMIT_EXCEEDED` → kendi cümlesi.
- **Ö-2:** Eksik 37. dosya `src/app/[locale]/portal/partner/[token]/page.tsx:161`. Bu dosyada `'use server'` dosyanın başında değil, fonksiyon gövdesinde, satır içi bir form eylemi olarak duruyor. fe-fb'nin B/C kontrolünü burada da yaptım (§2.2). Sonuç: güvenli.
- **Ö-3:** `skippedRecords` hiçbir istemciye ya da eyleme ulaşmıyor ve hassas değil, bu yüzden **kaldırılmadı**. Gerekçe §3'te. Yalnız yanıltıcı olan bir assert düzeltildi (§3).

## 2. Kanıt

### 2.1 Mutant tablosu (`ekler/mut-out.txt`, betik `ekler/mut.py.txt`)
Her mutant tek başına uygulandı. Koşulan dosyalar: `cordis-csv`, `admin-cordis-failure-code`, `admin-cordis-client-import-error`, `api/admin-cordis-import-500`. Her mutanttan sonra kod `git checkout HEAD --` ile geri alındı; son `git status` (src) temiz.

| # | Kapatılan katman / vaat | Mutant | Sonuç | Öldüren test (yeni) |
|---|---|---|---|---|
| M0 | — | değişiklik yok | 35/35 yeşil | — |
| K1 | katman 1 | importer `errorCode` ← yakalanan metin | **öldü (5)** | importer: dört `test.each` + ayrıntı testi |
| K1b | katman 1 | importer hatanın `.code` alanını geçirir | **öldü (1)** | importer: "an Error with a code field" |
| K2 | katman 2 | eylemde `cordisImportFailureCode(...)` çağrısı silinir | **öldü (2)** | action: "a raw text in errorCode…", "a failure without a code…" |
| K2b | katman 2 | eylem `...importRes` yayar | **öldü (5)** | action ×3 + mevcut gerçek-importer eylem testleri ×2 |
| W | whitelist fonksiyonu | her dizgiyi geçirir | **öldü (8)** | whitelist birim testleri ×6, action, istemci |
| K1+W | iki katman birden | K1 + W | **öldü (14)** | — |
| S1 | vaat (b) | `handleGetK2Status` `...lastRun` yayar | **öldü (2)** | status: "lastRun carries only the listed columns" (+ mevcut test) |
| S2 | vaat (b) | `rowCounts: lastRun.rowCounts ?? lastRun.error` | **öldü (2)** | status (+ mevcut test) |
| L | ayrıntı: log | importer `logger.error` satırı silinir | **öldü (2)** | importer ayrıntı testleri ×2 (İNCELEME-105'te B6 yaşıyordu) |
| A | ayrıntı: alarm | alarm `meta.error` silinir | **öldü (2)** | importer ayrıntı testleri ×2 (İNCELEME-105'te B7 yaşıyordu) |
| C1 | istemci catch | catch → `errorCode: String(err)` | yaşadı, **eşdeğer mutant** | — (aşağıda) |
| C2 | istemci whitelist | `t(importErrors.${errorCode})`, whitelist'siz | **öldü (1)** | istemci: "an unlisted code…" |
| C1+C2 | istemci, iki katman birden | C1 + C2 | **öldü (2)** | istemci: "a thrown action…" + "an unlisted code…" |

**C1 neden eşdeğer:** catch'in koyduğu değer yalnız render'da okunuyor ve render hemen önce `cordisImportFailureCode` whitelist'inden geçiyor. Bu yüzden C1 tek başına ekranda gözlenebilir hiçbir şey değiştirmiyor. `console.error` ise tarayıcı konsolu, başka kullanıcıya gitmiyor. İki katman birlikte kapatıldığında (C1+C2) sızıntı görünüyor ve test kırmızı oluyor. Görünür davranışı değişmeyen bir mutantı öldürmek için testi durum iç yapısına bağlamadım.

### 2.2 Ö-2: 37. dosya (`ekler/all-use-server.txt`, `ekler/o2-scan-out.txt`)
```
$ grep -rlE "^\s*['\"]use server['\"]" src | wc -l   → 37
dosya başında değil (INLINE): src/app/[locale]/portal/partner/[token]/page.tsx   (161: 'use server';)
```
fe-fb'nin B/C kontrolü (servis çağrısını doğrudan döndürmek, `.error/.reason/.message` iletmek, `return r | {...r}`) bu dosyada şöyle çıktı:
- Satır içi eylem `addBudgetLineByToken(...)` sonucunu yerel `result`'ta tutuyor. Yalnız `result.success`'e bakıp `revalidatePath` çağırıyor, dönüşü `void`. Sonuç ne döndürülüyor ne de render'a giriyor.
- Servis (`src/modules/m11/server/actions.ts:581`) yalnız `{success:false}` ya da `{success, requestedTotal}` döndürüyor, metin içermiyor. `PilotExpiredError` dışındaki hatalar `throw e` ile fırlatılıyor; prod'da istemciye yalnız digest gider.
- Sayfanın kendi iki catch'i (satır 118 ve 134) metni yalnız sunucudaki `console.warn`'a yazıyor, dönüş olarak `notFound()` ya da `false` veriyor.
- Çapraz kontrol için cs-fb bekçisinin analizcisini dosyaya **salt okunur** biçimde uyguladım, bekçi dosyasına dokunmadım: `hasUseServerDirective`=true (satır içi yönergeyi artık tanıyor), `actionReturnLeaks`=`[]`.
- **Karar:** güvenli. "Tek sızıntı CORDIS" sonucu değişmiyor.

### 2.3 Kapılar (`ekler/gates.txt`), dal HEAD, izole DB
```
DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55130/fabrika
GATE tsc=0
GATE lint=0
GATE i18n=0
 Test Files  301 passed | 2 skipped (303)
      Tests  3920 passed | 50 skipped (3970)
vitest EXIT=0 (CI=true npx vitest run, tam süit)
live-skip gate: 46 live files, 401 live tests passed, 42 allowed skip(s)
live-skip gate EXIT=0
GATE build=0 (env -u NODE_ENV pnpm build)
```
Yeni ve değişen üç dosya birlikte: 35/35 yeşil (M0).

## 3. Ö-3 kararı: `skippedRecords` kalıyor
- **İçerik:** `{file, records, skipped, samples:[{line?, reason}]}`. `file` sabit bir CSV adı. `reason` dört kalıptan biri: `expected N fields, got M`, `unterminated quoted field`, `row has no id`, ya da `unknown project <id>`. Buradaki `<id>` CORDIS'in herkese açık proje kimliği. Ham CSV satırı, SQL, dosya yolu ya da sunucu metni yok. **Hassas değil.**
- **Nereye ulaşıyor:** başarısız sonucu kullanan üç yer var ve hiçbiri bu alanı iletmiyor:
  - Eylem yeni bir nesne kuruyor, yalnız `{success, errorCode}` dönüyor (K2b ile kilitli).
  - Route sabit bir `internalError` gövdesi dönüyor.
  - CLI yalnız `errorCode` ve `runId` basıyor.
  
  Başarılı yolda da eylem ve route alanları tek tek seçiyor. **Ulaşmıyor.** Ayrıca yeni katman 2 testi, stub'ın `skippedRecords`'ına sahte ham metin koyup bunun eylemden çıkmadığını doğruluyor.
- Kaldırmak, sonucu kullanan kimseye bir şey kazandırmayacaktı ama importer sözleşmesini ("okunduysa her zaman var") bozacaktı. Bu yüzden kod değişmedi.
- **Düzeltilen assert:** `tests/cordis-csv.test.ts` içindeki `not.toContain('line 4')` yanıltıcıydı (İNCELEME-105'te not etmiştim). Geçmesinin sebebi JSON biçimiydi (`"line":4`), satır bilgisinin gerçekten olmaması değil. Yerine `not.toContain('CORDIS dump rejected')` kondu, yani artık fırlatılan mesajın kendisi aranıyor. Yorum, `skippedRecords`'ın yapı olarak kaldığını açıkça söylüyor. Bu değişiklik testi gevşetmiyor: fırlatılan metni sonuca koyan B1 tipi mutant yine kırmızı olur, çünkü o metin "CORDIS dump rejected" ile başlıyor.

## 4. Değişen dosyalar
- `tests/cordis-csv.test.ts`: importer katmanı ve ayrıntı testleri eklendi (+88), yanıltıcı assert düzeltildi (1 satır).
- `tests/admin-cordis-failure-code.test.ts` (yeni): whitelist birim testi, katman 2, vaat (b).
- `tests/admin-cordis-client-import-error.test.tsx` (yeni): istemci mesajı.
- `docs/agent-results/TASK-MUOD30XARRIII-be-fb.md` + `-ekler/`.
- Dokunulmayanlar: üretim kodu ve `tests/api/action-leak-scan.ts`. Bekçi yalnız salt okunur olarak çağrıldı.
- Repo dışı: `/Users/macbook/alan/docs/agent-results/TASK-MUOBNYACFPLPF-fe-fb.md`. Görevin kapısı bu yolu istedi, ama bu İNCELENEN görevin rapor adı ve repo dışında. Dosya yoktu. Oraya yalnız bu rapora yönlendiren kısa bir işaretçi yazdım; fe-fb'nin repodaki raporuna dokunmadım.

## 5. Riskler
- İstemci testi, düğmeyi "Şimdi Çalıştır" metniyle buluyor. Düğme metni değişirse (ör. i18n'e taşınırsa) test sızıntı yüzünden değil, düğme bulunamadığı için kırmızı olur. Kırmızının sebebi açık, sessiz bir geçiş olmaz.
- C1 eşdeğer mutant olarak kaldı (§2.1). İstemci whitelist'i silinirse C2 testi kırmızı olur.

## 6. Açık sorular
- Yok.

## 7. Sonraki adım
- Kapılar yeşil. Dal dev'e merge edildi (push YOK).

**Platform beyanı:** Doğrulama **macOS**'ta yapıldı (Darwin 27, arm64; vitest node + jsdom; Docker `pgvector/pgvector:pg16`; prod `next build`). **Windows ve Linux koşulamadı**, çünkü bu makinede yalnız macOS var; Linux'u CI koşuyor. Koda göre fark beklenmez: eklenen testler saf JS ve mock kullanıyor. İmporter testleri zip dosyasını `os.tmpdir()` + `path.join` ile yazıyor, bu yüzden platformdan bağımsız. Süreç, kabuk ya da yol ayırıcısına bağlı bir kod yolu yok. Mutant betiği (`mut.py`) yalnız bir inceleme aracı.
