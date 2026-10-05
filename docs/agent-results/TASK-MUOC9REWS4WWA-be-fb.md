# TASK-MUOC9REWS4WWA — be-fb — FB İNCELEME-105: CORDIS sızıntı düzeltmesi (TASK-MUOBNYACFPLPF, fe-fb, kod 8ca11f55)

**Durum:** TAMAM
**Karar:** **ONAY.** Engelleyici bulgu yok; 3 düşük/bilgi notu var (Ö-1..Ö-3).
- İNCELEME-100 Y-1'i canlıda **10 gerçek hata türüyle** tekrarladım (ağ, zaman aşımı, HTTP 503, bozuk zip, CSV'siz zip, CSV bütçe aşımı, Prisma tablo yok, Prisma kilit zaman aşımı 55P03, try öncesi Prisma, istemcide fırlayan eylem).
  - **Taban** (`238d9dd9`, düzeltmesiz): 9/9 sızıntı. İç metin, eylem yanıtında, `handleGetK2Status`'ta, SSR HTML'de ve RSC yükünde görünüyor.
  - **Yeni** (dev `6754ef1b`): 9/9 temiz. Eylem yalnız `IMPORT_FAILED` ya da `SKIP_LIMIT_EXCEEDED` döndürüyor.
  - Ayrıntı nerede kalıyor: DB'deki run satırında, alarm `meta.error`'unda ve sunucu log'unda (9 satır `[k2-cordis] import failed … {errorCode}`).
- UI mesajları: tr/en × 2 kod, ayrıca fırlayan eylem. Hepsi gerçek tıklamayla ekran görüntüsüne alındı.
- fe-fb'nin §2.3 taramasını iki yoldan doğruladım:
  - Taramada eksik kalan 37. eylem `portal/partner/[token]/page.tsx:161` satırındaki satır içi `'use server'` form eylemi. Dönüşü `void` olduğu için güvenli.
  - Farklı bir yöntemle (tip tabanlı) bağımsız tarama yaptım: 36 dosya ve 127 export'ta istemciye serbest hata metni taşıyan bir yol yok.
- Kendi 13 mutantımın 8'i öldü. Yaşayan 5'i yalnız test boşluğu (Ö-1); canlıda davranış doğru.
- Kapılar: tam `CI=true npx vitest run` 3832 geçti, 0 kırmızı. tsc, lint, i18n ve build 0.

**İncelenen:** fe-fb `8ca11f55` (TASK-MUOBNYACFPLPF).
**Ortam:**
- İnceleme dev HEAD `6754ef1b` üzerinde yapıldı; taban `238d9dd9` (dev, düzeltmeden hemen önce).
- Üç ayrı worktree kullanıldı: yeni, taban ve mutant.
- İzole DB: `befb105-pg` (pgvector pg16, 127.0.0.1:55105). CI sırasıyla kuruldu: push → rls-role → migrations ×2 → rls → seed (`ekler/db-prep.txt`).
- Her koşudan önce `DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55105/fabrika` echo ile doğrulandı. Paylaşılan `fabrika` :5433'e hiçbir şey yazılmadı.
- **Kod değiştirilmedi.**
- İş bitince iki `next start` sürecimi (kendi PID'lerim) durdurdum. Worktree'ler ve konteyner silindi.

**Ekler:** `docs/agent-results/TASK-MUOC9REWS4WWA-be-fb-ekler/`

## 1. Ne yapıldı
1. Diff'i satır satır okudum (importer, failure-codes, eylem, client, route, CLI, i18n, testler). Importer'ın bütün `return` yollarını ve `cordisImportRun` okuyan her yeri kontrol ettim (`actions.ts`, `cordis-delta.ts getCordisLiveStreamLogs`, `cordis-sync.ts aggregateCordisMetrics`). `error` sütununu `select` eden başka bir okuyucu yok.
2. **Canlı (gerçek server-action POST + SSR + RSC):**
   - Taban ve yeni için iki ayrı prod `next build` + `next start` koşuldu (:47716 / :47715), ikisi de izole DB'ye bağlı.
   - Hata türlerini **gerçekten** tetiklemek için yalnız bir test aracı kullandım: `NODE_OPTIONS=--import fetch-hook.mjs`. Bu kanca sadece `cordis.europa.eu` isteğini yönlendiriyor. Ürün kodunda karşılığı yok.
     - Ağ reddi: gerçek `fetch('http://127.0.0.1:9')`.
     - Zaman aşımı: gerçek `AbortSignal.timeout`.
     - HTTP 503, zip olmayan dosya, CSV'siz zip, bozuk CSV: `mkzips.mjs` ile üretilen dosyalar.
   - Prisma hataları gerçek DB işlemleriyle üretildi:
     - tablo yeniden adlandırma;
     - `ALTER ROLE … SET lock_timeout='3s'` ile `ACCESS EXCLUSIVE` kilidi;
     - try bloğundan önce çalışan `cordisImportRun.create` için tablo adı değişikliği.
   - Çerez, `next-auth/jwt encode()` ile `demo-user-superadmin` için üretildi.
   - Her senaryodan sonra dört şey okundu: `handleGetK2Status`, `GET /tr/admin/cordis` HTML, `RSC: 1` yükü ve DB'deki run ile alarm satırı.
3. **Tarayıcı:** Kendi headless Chrome sürecimi kullandım (paylaşılan iç tarayıcıyı değil). Çerez diyaloğunu kapatıp "Şimdi Çalıştır"a gerçekten tıkladım, `role=alert` metnini okuyup ekran görüntüsü aldım.
4. **Tarama doğrulaması:** fe-fb'nin ret/scan çıktısını okudum, eksik dosyayı buldum. Ardından farklı yöntemle bağımsız bir tip taraması koştum (`typescan.mts`).
5. **Mutantlar:** 13 mutant koştum, fe-fb'nin M1–M4'ünden farklı noktalarda (§2.4). Her mutant kaydedilmiş orijinalden geri yazıldı; `git checkout` kullanılmadı. Son `git status`: temiz.
6. **Kapılar:** tam vitest (`CI=true`, izole DB), tsc, lint, i18n, build.

## 2. Kanıt

### 2.1 Canlı önce/sonra: `ekler/canli-taban.txt`, `ekler/canli-yeni.txt`, `ekler/canli-s9b-lock-timeout.txt`
Aranan iç metin işaretçileri şunlar: `fetch failed|ECONNREFUSED|TimeoutError|aborted due to timeout|Failed to download|cordis.europa.eu/data|FILE_ENDED|Required CORDIS CSV|skipped records over|SIRCSVSATIRI|CordisOrganization|CordisImportRun|does not exist|Invalid \`prisma|/srv/secret|tmp_cordis`. Bunlara ek olarak DB'de saklanan metnin ilk 24 karakteri de arandı.

Kalibrasyonda hatasız bir sayfada (yeni) işaretçi çıkmadı. İlk denemede işaretçi listesindeki "Service Unavailable" bir i18n metniyle çakıştığı için listeden çıkarıldı.

| # | Hata türü (gerçek) | TABAN eylem yanıtı | YENİ eylem yanıtı | YENİ: `handleGetK2Status` / HTML / RSC | YENİ: DB run.error, alarm meta.error |
|---|---|---|---|---|---|
| S1 | fetch ECONNREFUSED | `{"error":"fetch failed"}` | `{"errorCode":"IMPORT_FAILED"}` | YOK / YOK / YOK | `fetch failed` / var |
| S2 | fetch zaman aşımı (AbortSignal) | `"The operation was aborted due to timeout"` | `IMPORT_FAILED` | YOK ×3 | var / var |
| S3 | HTTP 503 | `"Failed to download CORDIS zip from https://cordis.europa.eu/…: Service Unavailable"` | `IMPORT_FAILED` | YOK ×3 | var / var |
| S4 | zip değil | `"FILE_ENDED"` | `IMPORT_FAILED` | YOK ×3 | var / var |
| S5 | zip'te CSV yok | `"Required CORDIS CSV files (…) not found in archive"` | `IMPORT_FAILED` | YOK ×3 | var / var |
| S6 | CSV bozuk → bütçe aşımı | `"CORDIS dump rejected: … project.csv: 1/2 skipped (line 3: expected 22 fields, got 3)"` | `SKIP_LIMIT_EXCEEDED` | YOK ×3 | var / var |
| S8 | Prisma: tablo yok | ``"\nInvalid `prisma.cordisOrganization.upsert()` invocation: … The table `public.CordisOrganization` does not exist…"`` | `IMPORT_FAILED` | YOK ×3 | var / var |
| S9b | Prisma: kilit zaman aşımı | ``"Invalid `prisma.cordisProject.upsert()` … Code: `55P03` … lock timeout"`` | `IMPORT_FAILED` | YOK ×3 | var / var |
| S10 | Prisma: try öncesi (`cordisImportRun.create`) | HTTP 500 `E{"digest":"180312433"}` | HTTP 500 `E{"digest":"4077086484"}` | YOK ×3 | (satır yazılamıyor) |
| S7 | başarı (kontrol) | `success:true` | `success:true` | YOK ×3 | — |

Tabloya ek olarak TABAN'da `handleGetK2Status`, HTML ve RSC; S1–S6, S8 ve S9b'nin her birinde iç metni taşıyor (`canli-taban.txt`). Bu, fe-fb'nin kapattığı ikinci yolun (DB → durum okuma) gerçekte açık olduğunu gösteriyor.

- **S9 (kilit, `lock_timeout` yok):** 133 sn bekledi, sonra başarılı oldu. Prisma'nın işlem `timeout: 120_000` ayarı kilitte bekleyen sorguyu kesmiyor. Sızıntıyla ilgisi yok. Gerçek bir zaman aşımı hatası için S9b'yi `lock_timeout` ile koştum.
- **S10:** Hata try bloğunun dışında olduğu için eylem fırlatıyor. Prod'da yalnız digest dönüyor, iki sürümde de metin yok. Bu yol düzeltmenin kapsamı dışında ve zaten güvenli.
- **Log'da ayrıntı var** (`ekler/sunucu-log-yeni-ayrinti.txt`): 9 satır, örneğin `[ERROR] [k2-cordis] import failed [TypeError: fetch failed] … {"runId":"cmuoch346…","dataset":"HORIZON","errorCode":"IMPORT_FAILED"}`. Aynı dosyada `Error [PrismaClientKnownRequestError]` ve `CORDIS dump rejected … line 3` satırları da var.

### 2.2 UI mesajı tr/en (fe-fb bunu alamamıştı): gerçek tıklama + ekran görüntüsü, `ekler/tarayici-out.txt` + `*.png`
| Kare | `role=alert` metni |
|---|---|
| `yeni-tr-IMPORT_FAILED.png` | "İçe aktarım hatası: içe aktarım tamamlanamadı. Ayrıntı son çalıştırma kaydında ve sistem uyarılarında." |
| `yeni-en-IMPORT_FAILED.png` | "Import failed: the import could not finish. Details are in the run record and in system alerts." |
| `yeni-tr-SKIP_LIMIT_EXCEEDED.png` | "İçe aktarım hatası: CORDIS dökümünde okunamayan kayıt sayısı sınırı aştı. Ayrıntı son çalıştırma kaydında ve sistem uyarılarında." |
| `yeni-en-SKIP_LIMIT_EXCEEDED.png` | "Import failed: the CORDIS dump has more unreadable records than the limit allows. Details are in the run record and in system alerts." |
| `yeni-tr-eylem-firlatir.png` (tıklamadan hemen önce `CordisImportRun` yeniden adlandırıldı → eylem fırlatır → istemci `catch`) | "İçe aktarım hatası: içe aktarım tamamlanamadı. …" |
| `taban-tr-sizinti.png` | "İçe Aktarım Hatası: **fetch failed**" |
| `taban-tr-eylem-firlatir.png` | "İçe Aktarım Hatası: **Minified React error #441; visit https://react.dev/errors/441 …**" |

Ekran görüntülerinde kutu yerleşimi ve renkleri tabanla aynı. /en sayfasında panelin geri kalanı hâlâ Türkçe; bu biliniyor ve kart kapsamının dışında (fe-fb §5).

### 2.3 fe-fb §2.3 taramasının bağımsız doğrulaması
- **Eksik olan 37. eylem:** `src/app/[locale]/portal/partner/[token]/page.tsx:161`. Repoda fonksiyon gövdesinde `'use server'` bulunan tek yer burası; satır içi bir form eylemi. fe-fb'nin B/C geçişleri yalnız dosya başında `'use server'` olan 36 dosyayı saydı.
  - Neden atlandı: dosya bir `page.tsx`, dosya başında yönerge yok. Bekçinin `hasUseServerDirective` fonksiyonu ise onu sayıyor (37).
  - Güvenlik: eylem `addBudgetLineByToken(...)` çağırıyor, sonuç yalnız `revalidatePath` kararı için okunuyor ve dönüş `void`. Sayfanın iki catch'i (`:117`, `:133`) metni yalnız `console.warn`'a yazıyor, sonra `notFound()` ya da sessiz devam geliyor.
  - `addBudgetLineByToken` tarafında `PilotExpiredError` → `{success:false}`, diğer hatalar `throw` ediliyor (prod'da digest).
  - Sonuç: fe-fb'nin "tek sızıntı CORDIS" hükmü değişmiyor.
- **Bağımsız, tip tabanlı tarama** (`ekler/typescan.mts.txt`, çıktı `typescan-out.txt`):
  - Yöntem: TS type-checker ile dosya başında `'use server'` olan 36 dosyadaki 127 export fonksiyonun dönüş tipini (Promise ve dizi içi dahil, 6 seviye) gezdim. Adı `error|reason|message|detail|cause|stack|description…` olan ve tipi **serbest `string`** olan alanları listeledim (literal birliği sayılmadı).
  - fe-fb'nin taint yönteminden farkı: değerin kaynağına değil, **tip sözleşmesine** bakıyor.
  - Sonuç: 17 alan çıktı; hepsi elle izlendi. `admin/cordis` artık listede değil, çünkü `errorCode` bir literal birliği.

| Alan | Kaynak | Hüküm |
|---|---|---|
| approvals `approve/reject/cancel … .reason` | kullanıcının girdiği ret notu (`dual-approval.ts:388`) | kullanıcı verisi |
| evidence/approvals `…description` ×4 | kayıt açıklaması | kullanıcı verisi |
| dashboard `exportDashboardCSV.error` | `'Unauthorized'\|'Forbidden'\|'ExportFailed'` sabit | güvenli |
| accept-invite `error` ×2 | `t('errors.*')` | i18n |
| admin/alerts, admin/feedback `error` | `'validation_failed'\|'update_failed'` sabit, ayrıntı logger'da | güvenli |
| admin/settings `sendSmtpTestEmail.error` | `mailFailureCode` → `smtp:<nodemailer e.code>[:<responseCode>]` (`mailer.ts:43,128`) | kod (admin) |
| lib/actions/auth `error` ×2 | sabit tr/en cümleler + `t(...)` | güvenli |
| m11 `acquireSectionLock.message` | "Bölüm … tarafından kilitli" + kilitleyen üyenin adı | tasarım gereği (aynı kiracı) |
| m9 `generateMeetingBrief.error` | `'BRIEF_NOT_PERSISTED'` | güvenli |

### 2.4 Mutantlar (`ekler/mut.py.txt`, `ekler/mut-out.txt`)
Mutantlar dev HEAD `6754ef1b` üzerinde koşuldu. Koşulan testler: `cordis-csv`, `admin-cordis-import-500`, `cordis-import`, `admin-actions-authz`, `api-error-body-guard` (71 test). İstemci ve whitelist mutantlarında ayrıca tsc, i18n ve eslint koşuldu.

| Mutant | Sonuç |
|---|---|
| B0 değişiklik yok | 71/71 yeşil |
| B1 importer başarısız sonuca `detail: errorMsg` ekler | **öldü** (1) |
| B2 eylem `...importRes` yayar | **öldü** (2) |
| B3 eylem `skippedRecords` örneklerini döndürür | **öldü** (2) |
| B4 `handleGetK2Status` `...lastRun` yayar | **öldü** (1) |
| B5 `rowCounts: lastRun.rowCounts ?? lastRun.error` | **öldü** (1) |
| B6 importer `logger.error('[k2-cordis] import failed', …)` satırı silinir | **yaşadı** (Ö-1) |
| B7 alarm `meta.error` silinir | **yaşadı** (Ö-1) |
| B8 run satırına metin yerine kod yazılır | **öldü** (4) |
| B9 `cordisImportFailureCode` her dizgiyi geçirir (tek başına) | **yaşadı**, tsc/i18n/eslint 0 (Ö-1; fe-fb M2b bunu importer mutantıyla birlikte öldürüyor) |
| B10 sınıflandırma: her `Error` → `SKIP_LIMIT_EXCEEDED` | **öldü** (1) |
| B11 istemci catch → `errorCode: String(err)` | **yaşadı**, tsc/i18n/eslint 0 (Ö-1; canlıda UI whitelist'i bunu yine de `IMPORT_FAILED`'e çevirir) |
| B12 istemci whitelist'siz `t(importErrors.${code})` + ham kodu basar | **yaşadı**, tsc/i18n/eslint 0 (Ö-1) |
| B13 `CordisSkipLimitError` yerine düz `Error` | **öldü** (3) |

### 2.5 Kapılar (`ekler/gates.txt`), dev HEAD `6754ef1b`, izole DB
```
DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55105/fabrika
 Test Files  297 passed | 2 skipped (299)
      Tests  3832 passed | 50 skipped (3882)
EXIT=0                (CI=true npx vitest run, tam süit)
GATE tsc=0
GATE lint=0
GATE i18n=0
GATE build=0          (env -u NODE_ENV pnpm build)
taban build (238d9dd9)=0
```

## 3. Bulgular

### Ö-1 (DÜŞÜK, test boşluğu): düzeltmenin iki vaadi ve iki savunma katmanı testle kilitli değil
- **"Ayrıntı log'da ve alarmda kalır"** vaadi: B6 (log satırı silinir) ve B7 (alarm `meta.error` silinir) yaşıyor. Testler alarm için yalnız `{level, source}` eşleşmesine bakıyor. Log satırı silinse ayrıntı yalnız run satırında kalır ve kimse fark etmez. Öneri: importer testlerine `expect(logger.error).toHaveBeenCalledWith('[k2-cordis] import failed', expect.anything(), expect.objectContaining({ errorCode }))` ve `writes.alerts[0].meta.error` içerik kontrolü ekle.
- **Whitelist (B9)** tek başına test edilmiyor; yalnız fe-fb'nin M2a/M2b bileşik mutantı onu dolaylı kanıtlıyor. `cordisImportFailureCode('fetch failed') === 'IMPORT_FAILED'` gibi bir satırlık bir birim testi yeter.
- **İstemci (B11/B12):** `client.tsx`'nin hiç testi yok. Doğru davranışı canlıda ekran görüntüsüyle kanıtladım (§2.2); ama catch'teki sabit kodu ya da `t()` öncesi whitelist'i silen bir değişikliği hiçbir kapı yakalamaz. Bugün sunucu yalnız kod döndürdüğü için gerçek etki çok küçük.

### Ö-2 (BİLGİ): fe-fb §2.3 tablosu 36/37 dosyayı kapsıyor
Eksik olan `portal/partner/[token]/page.tsx:161` satırındaki satır içi form eylemi. Dönüşü `void`, catch metinleri `console.warn`'da kalıyor; güvenli (§2.3). "Tek sızıntı CORDIS" sonucu değişmiyor. Rapor için bir dipnot yeter.

### Ö-3 (BİLGİ): importer'ın başarısız sonucu hâlâ `skippedRecords` taşıyor
- İçerik: `{file, records, skipped, samples:[{line, reason}]}`. Nedenler yapısal (`expected 22 fields, got 3`, `unterminated quoted field`, `unknown project <id>`); ham CSV içeriği ya da sunucu metni yok.
- Bugün hiçbir tüketici bu alanı istemciye geçirmiyor: eylem yalnız `errorCode` döndürüyor (B3 bunu kilitliyor), route sabit gövde dönüyor, CLI yalnız kodu basıyor.
- Testte yanıltıcı bir nokta var: `tests/cordis-csv.test.ts:228` içindeki `expect(JSON.stringify(res)).not.toContain('line 4')` importer sonucu için geçiyor, ama sebebi satır bilgisinin yokluğu değil, JSON biçimi (`"line":4`). Bu assert yalnız ham metnin (`errorMsg`) başka bir alana konmasını yakalıyor (B1 öyle öldü). Bu durum yorumda belirtilebilir.

(Kapsam dışı bir gözlem: S9, `lock_timeout` olmadan kilitte bekleyen bir import'un 120 sn'lik Prisma işlem zaman aşımına rağmen 133 sn beklediğini gösterdi. Sızıntıyla ilgisi yok, yalnız bilgi için.)

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUOC9REWS4WWA-be-fb.md` (bu rapor) + `-ekler/` (canlı çıktılar, 7 ekran görüntüsü, betikler, mutant ve tip taraması çıktıları, kapılar).
- `/Users/macbook/alan/docs/agent-results/TASK-MUOAW0UAXVG1M-be-fb.md`: kapının istediği işaretçi dosyası. Bu rapora yönlendiriyor.
- Kod dosyası değişmedi.

## 5. Riskler
- `fetch-hook.mjs` yalnız bir test aracı. Hatalar gerçek (gerçek soket reddi, gerçek `AbortSignal.timeout`, gerçek unzipper/Prisma/PG hataları). Yalnız CORDIS'in gerçek sunucusu kullanılmadı; yanıtlar yerel dosyalardan geldi.
- Tarayıcı olarak Google Chrome, headless modda kendi sürecimde koştu. Safari ve Firefox denenmedi. Değişiklik yalnız metin ve `role` olduğu için risk düşük.

## 6. Açık sorular
- Ö-1'in testleri fe-fb'ye mi verilsin, yoksa cs-fb'nin bekçi genişletme kartına (TASK-MUOBO31H8EPR5) mı eklensin?

## 7. Sonraki adım
- Merge'ü geri almak gerekmiyor. İsteğe bağlı küçük bir takip kartı açılabilir. Kapsamı: Ö-1'in üç test satırı (log çağrısı, alarm `meta.error`, `cordisImportFailureCode` birim testi) ve istemci için bir render testi. Ö-2 ile Ö-3 yalnız dipnot.
- Push YOK. Rapor commit'i yalnız dev'de.

**Platform beyanı:** Doğrulama **macOS**'ta yapıldı (Darwin 27, arm64; Node 26.5; prod `next build` + `next start`; Docker `pgvector/pgvector:pg16`; headless Google Chrome). **Windows ve Linux koşulamadı**, çünkü bu makinede yalnız macOS var; Linux'u yalnız CI koşuyor. Koda göre:
- İncelenen değişiklik platformdan bağımsız: sabit kod dizgileri, bir `instanceof` sınıflandırması, i18n anahtarları ve `role="alert"`.
- Importer'ın platforma bağlı kısımları (`path.join(process.cwd(), 'tmp_cordis', basename)`, `fs`) bu commit'te değişmedi.
- Canlı testteki `NODE_OPTIONS=--import`, `docker exec` ve `ALTER ROLE` adımları yalnız inceleme aracıydı.
