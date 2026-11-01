# TASK-MUMH7CVD8P2J0 İNCELEMESİ: K2 CORDIS gerçek döküm (crw-fb)

**Tarih:** 29.09.2026 · **Dal:** `dev` · **İncelenen:** `b7a4992e`, `7feb745e` (kod), `0ce53b6a` (se-fb raporu) · **İncelenen ağaç:** `84b47b14` (izole worktree, paylaşımlı ağaca kod yazılmadı)

**Platform beyanı:** Yalnız **macOS** (Darwin 27, arm64, Node 26.5, Postgres `fabrika-postgres` :5433) üzerinde doğrulandı. İncelenen kod saf JS dize işleme ve Prisma çağrısı. Süreç, kabuk ya da platforma bağlı yol yok. Ayrıştırıcı CRLF'i doğru okuyor; bunu aşağıdaki kenar denemesinde gördüm. Bu yüzden Windows'ta üretilmiş bir döküm de okunur. Windows/Linux **koşulamadı**, çünkü bu makinede yalnız macOS var.

## KARAR: **ONAY** (bloke eden bulgu yok)

Üç ana iddiayı kendi koşumla yeniden ürettim: 23.613 proje, SUCCESS ve skip-budget FAILED yolu. Hepsi tuttu. Üç **öneri** (Ö-1..Ö-3) ve iki **küçük not** (K-1, K-2) var. Hiçbiri merge/push'u bloke etmiyor. Ö-1 için bir birim testi eklenmesini, Ö-3'ün de devop-fb'nin OOM kartıyla birlikte ele alınmasını öneriyorum.

## 1) Ne yapıldı

1. Diff satır satır okundu: `csv.ts` (yeni), `importer.ts`, `tests/cordis-csv.test.ts`.
2. İzole worktree (`git worktree add --detach … 84b47b14`) ve izole DB `fabrika_crwfb_k2` (boş DB + `prisma db push`, 74 tablo) hazırlandı. Paylaşımlı `fabrika` DB'ye ve paylaşımlı ağaca yazılmadı.
3. Gerçek HORIZON zip'i ile yalnız içe aktarım koşuldu. `generatePartnerProfiles` OOM'u devop-fb'nin kapsamında olduğu için `runCordisImport` doğrudan çağrıldı. Ardından DB'den SELECT ile sayım yapıldı.
4. Ayrıştırıcıdan bağımsız sayım yapıldı: ham satır `grep` + distinct çift/kuruluş.
5. Aynı zip ikinci kez koşuldu (hash-atlama denemesi).
6. Gerçek dökümde 30 kayıt bozularak skip-budget FAILED yolu koşuldu.
7. Birim testleri için 9 mutasyon, `BATCH_TX` için de canlı DB'de 1 mutasyon denendi.
8. Tam vitest süiti koşuldu (skipped sayısı).
9. Ayrıştırıcı kenar durumları denendi.
10. Temizlik yapıldı: izole DB `DROP` edildi, worktree kaldırıldı (`git worktree list` içinde 0 kayıt kaldı).

## 2) Kanıt

### 2.1 İddia: 23.613 proje, SUCCESS: **DOĞRULANDI**
Zip sha256 = `1496a16ee79649d573a53697781b2fd950c18a5469c6a9f545f35dd5397771a7`. se-fb'nin raporundaki hash ile aynı.
```
runCordisImport → "success": true, "durationMs": 255151
  rowCounts { projects 23613, organizations 35200, participations 145909, topics 23613, scivocs 53035 }
  skippedRecords: project.csv 0/23613 · organization.csv 0/145909 · topics.csv 0/23613 · euroSciVoc.csv 0/53035
/usr/bin/time: 257.27 real · maximum resident set size 4719280128

SELECT (fabrika_crwfb_k2):
CordisImportRun  SUCCESS | 11:04:28.99 → 11:08:44.136 | 255 s | 1496a16e | rowCounts.skipped = {…: 0}
CordisProject 23613 · CordisOrganization 35200 · CordisParticipation 145631 · CordisProjectTopic 23613 · CordisProjectSciVoc 53035
SystemAlert (source='k2_cordis_import') 0
```
Benim koşumda süre **255 sn**, se-fb'nin koşusunda 272 sn. İkisi de 30 dk sınırının çok altında.

**Bağımsız sayım.** Ham satır başı (`^"[0-9]{6,9}";"`) `project.csv` içinde **23.613**, `organization.csv` içinde **145.909** kayıt veriyor. Ayrıştırıcının sonucu:
```
projects 23613 · projMalformed 0 · uniqProjIds 23613 · orgRows 145909 · distinctPairs 145631 · distinctOrgs 35200 · orphan 0
```
DB'deki 145.631 katılım satırı farklı (projectId, organisationId) çifti sayısına, 35.200 kuruluş da farklı `organisationID` sayısına **tam** eşit. se-fb'nin "278 tekrar satırı upsert ile birleşiyor, kayıp yok" açıklaması doğru.

**Bozuk biçimli iki kayıt DB'de doğru metinle duruyor.** Kolon kayması yok: `rcn 237940`, `contentUpdateDate 2026-04-20 12:21:04`.
```
101040297 | "Within day of Covid-19 reaching Europe in early 2020, music … | …tions in pandemics, including Covid-19." | HORIZON.1.1
101069905 | "Non-CO2 greenhouse gases are responsible for 28% of total a… | …ality and create socio-economic impact."  | HORIZON.2.5
```
**Aynı zip ile ikinci koşu** `"success": true, "skipped": true` döndü, 0,2 sn sürdü.

### 2.2 İddia: skip-budget FAILED yolu gerçekten çalışıyor: **DOĞRULANDI**

**Gerçek döküm, benim bozmam.** `project.csv` içinde her 700. kayıttan 30 tanesinin ilk `";"` ayracı silindi (satır 701, 1401, 2101, …). Sonuç:
```
exit=1
"error": "CORDIS dump rejected: skipped records over the 0.1% limit — project.csv: 30/23613 skipped
  (line 701: expected 22 fields, got 21; line 1401: …; line 2101: …; line 2801: …; line 3501: …) |
  organization.csv: 170/145909 skipped (unknown project 101059180; …)"
CordisImportRun → FAILED · CordisProject hâlâ 23613
```
Satır numaraları bozduğum fiziksel satırlarla birebir tutuyor. "Yazmadan önce FAILED" iddiasını canlıda zaman damgasıyla kanıtlayamadım: `CordisProject` tablosunda upsert'te güncellenen bir `updatedAt` kolonu yok, `importedAt` ise yalnız create'te yazılıyor. Bu iddia aşağıdaki birim testiyle (`writes.projects === 0`) ve M2 mutasyonuyla kanıtlandı.

**Birim testleri, mutasyon.** Temel koşu `tests/cordis-{csv,import,k2-job,delta}` için **29 passed / 0 skipped**.

| # | Mutasyon | Sonuç |
|---|---|---|
| M1 | 5 partideki `BATCH_TX` kaldırıldı | **YAŞADI**: 29/29 geçti, tsc 0 hata (bkz. Ö-1) |
| M2 | `assertSkipBudget(...)` çağrısı silindi | öldü (2 fail) |
| M3 | eşik `>` yerine `>=` | öldü (1 fail) |
| M4 | `keepKnownProjects` filtre yok | öldü (1 fail) |
| M5 | FAILED alarmı `error` yerine `warn` | öldü (1 fail) |
| M6 | csv: satır sonu + `"` kapanış kuralı yok | öldü (6 fail) |
| M7 | csv: `""` → `"` dönüşümü yok | öldü (2 fail) |
| M8 | csv: alan sayısı kontrolü yok | öldü (2 fail) |
| M9 | eşik altı `warn` alarmı yok | öldü (1 fail) |

### 2.3 1.000'lik upsert timeout'u: **kod doğru bağlı, test yok**

**Canlı mutasyon.** `BATCH_TX.timeout` 1 ms yapılıp `limit=3000` ile koşuldu:
```
"success": false · CordisImportRun FAILED | "Transaction API error: A rollback cannot be executed on an expired transaction"
SystemAlert error|k2_cordis_import|"CORDIS HORIZON import failed. Rows are upserts, so a re-run after the fix is safe."
```
Seçenek gerçekten `prisma.$transaction(..., BATCH_TX)` ile Prisma'ya ulaşıyor. Gerçek değerlerle (30 s / 120 s) tam koşu 255 sn'de SUCCESS oldu. se-fb'nin "5,7 sn'lik parti 5 sn varsayılanı aştı" gözlemini yeniden üretemedim; o koşu yükün altındaydı ve kararsız bir koşul. Ancak M1'in yaşaması, bu korumanın **hiçbir testle kilitlenmediğini** gösteriyor.

### 2.4 Skipped test sayısı
- **Değişikliğin test dosyaları:** 0 skipped. `.skip`, `skipIf` ya da `.todo` yok (`grep` boş).
- **Tam süit** (izole worktree, izole DB): `Test Files 9 failed | 198 passed | 8 skipped (215)` · `Tests 39 failed | 2273 passed | 130 skipped (2442)`.
  - 39 kırmızının hepsi canlı DB isteyen testler: `plan-admin`, `pilot`, `pilot-gates`, `gdpr-data-subject.live`, `bearer-token-hash.live`, `stripe-webhook-tenant-scope.live`, `k3-topic-stats-import.live` ve diğerleri. Sebep, benim tohumsuz izole DB'm. Hiçbiri `cordis` dosyası değil, bu değişiklikle ilgisiz.
  - 130 skipped, ortam koşullu canlı testlerden geliyor (ör. `double-charge-prevention` 5/5 skipped). Bu değişiklik skipped sayısını artırmıyor.

### 2.5 Ayrıştırıcı kenar durumları (sessiz yanlış veri var mı?)
```
değer içinde ";"            → malformed (expected 3, got 4)
değer sonunda "\n"          → 2 kayıt malformed, sonraki doğru kayıt okundu
değer içinde ";;            → malformed (expected 3, got 5)
CRLF + sonda boş satır      → 1 satır doğru, malformed 0
kapanmamış tırnak           → malformed "unterminated quoted field"
```
Kötü biçimlerin hepsi `malformed` olarak raporlanıyor ve bütçe hesabına giriyor. Sessizce yanlış bölünüp yazılan kayıt yok. Bu, se-fb'nin "Ayrıştırıcı kuralının sınırı" riskindeki iddiayı doğruluyor.

## 3) Bulgular (önem sırasıyla)

### Bloke eden (B-): **yok**

### Ö-1: `BATCH_TX` (transaction timeout) hiçbir testle korunmuyor
- **Yer:** `src/lib/k2-cordis/importer.ts:446` (`const BATCH_TX`) ve 5 `$transaction(…, BATCH_TX)` çağrısı.
- **Senaryo:** Biri `BATCH_TX` argümanını yanlışlıkla silerse (M1) testler 29/29 yeşil kalır, tsc de 0 hata verir. Canlıda ilk yavaş parti (>5 s) bütün aylık koşuyu "expired transaction" ile düşürür. Bu, se-fb'nin ilk tam koşusunda 257. saniyede yaşanan hatanın aynısı.
- **Öneri:** `tests/cordis-csv.test.ts` içindeki prisma mock'unda `$transaction` ikinci argümanını yakalayın ve `expect(opts.timeout).toBeGreaterThanOrEqual(60_000)` gibi bir assert ekleyin. Tek test yeter.

### Ö-2: FAILED alarmı tekilleştirmede ilk nedeni tutuyor, yeni neden görünmüyor
- **Yer:** `importer.ts` catch bloğu, `dedupeKey: 'k2:cordis-import-failed:<dataset>'`, ve `system-alert.ts:318-332` (dedupe yalnız `repeatCount`/`lastSeenAt` güncelliyor, `meta` eski kalıyor).
- **Senaryo (canlıda üretildi):**
  1. Önce timeout hatasıyla bir FAILED koşu oldu. Alarm açıldı: `meta.error = "Invalid prisma.cordisProject.upsert()…"`.
  2. Ardından bozuk döküm geldi ve **farklı bir nedenle** FAILED oldu.
  3. Yeni satır açılmadı: `count = 1`, `createdAt 11:09:12`. Alarm `meta.error` ve `runId` alanlarında hâlâ **ilk** koşuyu gösteriyor.
  4. Admin /alerts ekranında operatör yanlış kök nedeni görür. Doğru neden yalnız `CordisImportRun.error` alanında kalıyor.
- **Öneri:** Mesaja ya da meta'ya "son hata için CordisImportRun'a bak" yönlendirmesi eklensin, ya da dedupe güncellemesi son `runId`/`error` değerini yazsın. `system-alert.ts` ortak modül, bu yüzden bu değişiklik kapsamını aşabilir. Karar sahibin.

### Ö-3: Yalnız içe aktarım 4,7 GB RSS'e çıkıyor
- **Kanıt:** `/usr/bin/time -l` çıktısında `maximum resident set size 4719280128`. Bu ölçüm `generatePartnerProfiles` **hariç**, yalnız `runCordisImport`.
- **Senaryo:** se-fb raporundaki "bellek davranışı aynı sınıfta" ifadesi ölçüme dayanmıyor. Aylık cron'un koşacağı konteynerin bellek sınırı 4 GB civarındaysa, içe aktarım profil işine gelmeden ölebilir.
- **Öneri:** devop-fb'nin OOM kartı (TASK-MUMJ7W0GUI6N1) içinde içe aktarımın tepe belleği de ölçülsün, konteyner/worker sınırıyla karşılaştırılsın. `organization.csv` satır satır işlenirse büyük olasılıkla belirgin düşer, ama bunu ölçmedim.

### K-1: FAILED koşuda `rowCounts.skipped` yazılmıyor
Raporda "her koşuda sayımlar `rowCounts.skipped`'e yazılıyor" deniyor. DB'de FAILED satırlarının hepsinde `rowCounts IS NULL`. Sayımlar yalnız `error` metninde duruyor, o da her dosya için ilk 5 örnekle. Bu bir işlev sorunu değil; rapor ifadesinin düzeltilmesi ya da catch bloğunda `rowCounts: { skipped: skippedByFile(fileSkips) }` yazılması önerilir.

### K-2 (kapsam dışı, bu değişiklikten önce de vardı): `scripts/cordis-import.ts` `.env` dosyasını geç yüklüyor
`import { runCordisImport }` hoist edildiği için `src/lib/db.ts` modülü `dotenv.config()` çalışmadan önce değerlendiriliyor. Sonuçta varsayılan `fabrika:fabrika@…` adresine bağlanıyor. Kanıt: `DATABASE_URL` export edilmeden `npx tsx scripts/cordis-import.ts --limit=5 …` çalıştırılınca `Authentication failed … credentials for 'fabrika' are not valid` hatası alınıyor. Script bu görevde değişmedi. Elle koşarken `set -a; . ./.env; set +a` gerekiyor. Ayrı, küçük bir kart olarak açılabilir.

## 4) Değişen dosyalar
- `docs/agent-results/TASK-MUMH7CVD8P2J0-crw-fb.md` (bu rapor). Kod değiştirilmedi.
- Geçici izole DB `fabrika_crwfb_k2` ve worktree silindi.

## 5) Riskler
- Ö-1 ve Ö-3 aylık cron'un gerçek ortamda düşme olasılığını etkiliyor. İkisi de bugünkü koşuyu bozmuyor.
- İndirme yolunda (`fetch`) zaman aşımı/yeniden deneme yok. se-fb bunu zaten belirtti; ben de yerel zip ile koştum, bu yüzden indirme yolu bu incelemede test edilmedi.

## 6) Açık sorular
- %0,1 eşiği ürün kararı; se-fb'nin açık sorusu aynen geçerli.
- Ö-2 için ortak `system-alert` modülünde değişiklik isteniyor mu, yoksa yalnız importer tarafında bir işaret yeterli mi?

## 7) Sonraki adım
1. Ö-1 testi (se-fb, küçük).
2. Ö-3 ölçümü devop-fb'nin OOM kartına eklensin.
3. K-2 için ayrı kart (isteğe bağlı).
