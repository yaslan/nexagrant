# TASK-MUMH7CVD8P2J0: K2 CORDIS gerçek döküm (se-fb)

**Tarih:** 29.09.2026 · **Dal:** `dev` · **Commit'ler:** `b7a4992e`, `7feb745e` (push yok) · **Önceki ölçüm:** TASK-MULQMFVLJYZ5V B-2

**Platform beyanı:** yalnız **macOS** (Darwin 27, arm64, Node 26.5) üzerinde doğrulandı. Değişen kod saf JS dize işleme ve Prisma çağrısı; platforma bağlı yol yok (dosya yolu yine `path.join`, kabuk ve süreç yok). Ayrıştırıcı `\r\n` satır sonunu da okuyor, test de var, yani Windows'ta üretilmiş bir CSV de sorun çıkarmaz. Testteki zip yardımcısı `zlib.crc32` kullanıyor, bu yüzden Node ≥ 22.2 gerekiyor (CI `node-version: 22`). Windows/Linux **koşulamadı**: bu makinede yalnız macOS var.

## Özet

| Kabul | Sonuç | Kanıt |
|---|---|---|
| 23.613 proje yazıldı | **GEÇTİ** | `CordisProject` = 23.613 (izole DB) |
| Koşu SUCCESS | **GEÇTİ** | `CordisImportRun.status = SUCCESS`, `fileHash 1496a16e…` |
| Süre < 30 dk | **GEÇTİ**: içe aktarım **272 sn** (4 dk 32 sn) | `startedAt 10:21:13` → `finishedAt 10:25:45` |
| Eşik aşılırsa açıkça FAILED | **GEÇTİ** | Gerçek dökümde 30 kayıt bozuldu → FAILED + error alarmı, yazma yok |
| Ek bulgu | M1 ortak profil işi (`generatePartnerProfiles`) gerçek hacimde **OOM** | Ayrı kart açıldı: **TASK-MUMJ7W0GUI6N1** |

## 1) Ne yapıldı

**Kök neden:** CORDIS dökümü RFC 4180'e uymuyor. Değeri tırnakla başlayan metinlerde dış tırnağı yazmıyor. İç tırnakların ikilenip ikilenmediği de dosyaya göre değişiyor. Gerçek dökümde görülen biçimler:
- `project.csv`, satır 24: `…;"";""Non-CO2 … the ""Fit for 55"" plan … impact."";"2026-04-20 …`
- `topics.csv`: `""Combining … the "Fit for 55" package … Partnership)"";"101192661"`. İç tırnaklar ikilenmemiş.
- `project.csv`, satır 1896: `""music as emotional practice"" and ""emotions as embodied practices"";-to generate`. Tırnaktan hemen sonra `;` geliyor.
- `project.csv`, satır 1649 (keywords): `""""X-Ray imaging""; ""battery fires in WEEE""; …""""`

csv-parse bunları kapanış tırnağı hatası sayıyor. `skip_records_with_error` de 831 projeyi sessizce atlıyordu.

> **Python `csv` modülü de yanlış okuyor.** 192 projede kolonlar kayıyor: rcn, contentUpdateDate, grantDoi ve legalBasis yanlış kolona düşüyor. MVP raporundaki "Python 23.613 satır" sayısı doğruydu ama değerleri doğrulamıyordu.

**Düzeltme:**
1. `src/lib/k2-cordis/csv.ts` → `parseCordisCsv()`. Tırnaklı bir alan, ardından şunlardan biri gelen ilk `"` ile kapanıyor:
   - `;"` (sonraki alanın açılışı),
   - satır sonu ve ardından sonraki kaydın `"` karakteri,
   - dosya sonu.

   Alan içindeki `""` tek `"` olarak okunuyor. Başlıktaki alan sayısını tutmayan kayıt satır numarasıyla **`malformed`** listesine düşüyor, sessizce atlanmıyor. RFC'ye uygun alanlar (`"""X"""`, `""`, `"x;y"`, BOM, CRLF) eskisi gibi okunuyor.
2. `importer.ts`:
   - csv-parse akışı kaldırıldı.
   - Her dosya için atlanan kayıt sayılıyor: okunamayan kayıt, id'si olmayan kayıt ve **bilinmeyen projeye bağlı** katılım/konu/scivoc satırı. Önceden bu sonuncusu FK hatasıyla bütün koşuyu düşürüyordu; artık süzülüp sayılıyor.
   - Atlanan kayıt oranı `MAX_SKIPPED_RATIO` (%0,1) üstündeyse koşu **ilk yazmadan önce** FAILED oluyor. Hata metni dosyayı, sayıyı ve ilk 5 satır/nedeni veriyor.
   - Her koşuda sayımlar `CordisImportRun.rowCounts.skipped` alanına yazılıyor.
   - FAILED durumunda `SystemAlert` açılıyor (`error`, `k2_cordis_import`, dedupeKey `k2:cordis-import-failed:<dataset>`). Atlanan kayıt var ama eşik altındaysa `warn` alarmı açılıyor.
   - Eşik `maxSkippedRatio` seçeneğiyle değiştirilebiliyor.
3. İlk tam koşu 257 sn sonra **ikinci bir hatayla** düştü: 1000 satırlık bir katılım partisi 5,7 sn sürdü ve Prisma'nın varsayılan 5 sn transaction süresini aştı. Beş parti transaction'ına `BATCH_TX = { maxWait: 30 s, timeout: 120 s }` verildi (`7feb745e`).
4. `tests/cordis-csv.test.ts`: gerçek dökümden kısaltılmış kayıtlar fikstür olarak eklendi (satır 2, 24, 1649, 1896, topics). Ayrıca importer'ın FAILED yolu test ediliyor: eşik aşımı, bilinmeyen proje, eşik gevşetilince SUCCESS + `warn`. Zip dosyası bağımlılık eklemeden testte elle yazılıyor.

## 2) Kanıt

**Ayrıştırıcı, gerçek dökümün 4 dosyası** (zip sha256 `1496a16ee79649d573a53697781b2fd950c18a5469c6a9f545f35dd5397771a7`, 28.08.2026 dökümü):
```
project      rows 23613  malformed 0   194 ms
organization rows 145909 malformed 0   652 ms
topics       rows 23613  malformed 0     9 ms
euroSciVoc   rows 53035  malformed 0    40 ms
orphan participations 0
```
Kolon biçimi denetimi (yanlış biçimli satır sayısı):
```
yeni   { rcn: 0,   contentUpdateDate: 0,   grantDoi: 0,   legalBasis≠HORIZON*: 61  (hepsi 'EURATOM2027', gerçek) }
python { rcn: 192, contentUpdateDate: 192, grantDoi: 192, legalBasis≠HORIZON*: 252 }
```

**Gerçek koşu, izole `fabrika_sefb_k2`** (boş DB + `prisma db push`, `scripts/cordis-import.ts --local-zip=<gerçek zip>`):
```
✅ [CORDIS Import] Completed successfully in 271864ms
   Projects: 23613  Organizations: 35200  Participations: 145909  Topics: 23613  SciVocs: 53035

CordisImportRun: SUCCESS | 10:21:13.371 → 10:25:45.23 | 272 s | 1496a16e… |
  {"skipped": {"project.csv":0,"organization.csv":0,"topics.csv":0,"euroSciVoc.csv":0}, "projects":23613, ...}
DB: CordisProject 23613 · CordisOrganization 35200 · CordisParticipation 145631 · Topic 23613 · SciVoc 53035 · SystemAlert 0
```
`145.909` katılım satırı DB'de `145.631` satır oldu. Bu bir kayıp değil: dökümdeki farklı (projectId, organisationId) çifti sayısı tam **145.631**, geri kalan 278 satır aynı çiftin tekrarı ve upsert ile birleşiyor. Bozuk alan içeren projeler de doğru yazıldı:
```
101069905 | "Non-CO2 greenhouse gases are responsible for 28% … | …create socio-economic impact." | HORIZON.2.5
101040297 | "Within day of Covid-19 reaching Europe in early 2… | …andemics, including Covid-19." | HORIZON.1.1
```
Aynı zip ile ikinci koşu: `Zaten güncel (File hash unchanged for HORIZON). Skipped.`, exit 0.

**Başarısız koşular (FAILED yolları gerçekte çalışıyor):**
- Transaction düzeltmesinden önceki koşu: `FAILED` + `SystemAlert error|k2_cordis_import`, 257 sn.
- Negatif deneme: gerçek `project.csv` içinde 30 kayıt bozuldu (bir ayraç silindi), yeniden zip'lendi:
```
❌ CORDIS dump rejected: skipped records over the 0.1% limit — project.csv: 30/23613 skipped
   (line 501: expected 22 fields, got 21; line 1001: …) | organization.csv: 158/145909 skipped (unknown project 101045661; …)
exit=1 · CordisImportRun FAILED · SystemAlert error|k2_cordis_import · CordisProject 23613 (önceki başarılı veri değişmedi)
```

**Kapılar:**
```
vitest tests/cordis-csv + cordis-import + cordis-k2-job + cordis-delta → 4 files, 29 passed
tsc --noEmit → 0 hata · eslint src/lib/k2-cordis tests/cordis-csv.test.ts → temiz
```
İlk test turunda bir test benim beklentimde hata buldu: `ROW_PLAIN` iki satır sürüyor, bu yüzden bozuk kayıt 3. değil 4. satırda. Ayrıştırıcının verdiği satır numarası doğruydu, testin beklentisi düzeltildi.

## 3) Değişen dosyalar
- `src/lib/k2-cordis/csv.ts` (yeni)
- `src/lib/k2-cordis/importer.ts`
- `tests/cordis-csv.test.ts` (yeni)
- `docs/agent-results/TASK-MUMH7CVD8P2J0-se-fb.md` (bu rapor)
- İzole DB `fabrika_sefb_k2` iş bitince **silindi**. Paylaşımlı `fabrika` DB'ye dokunulmadı.

## 4) Riskler
- **M1 ortak profil işi OOM (yeni, yüksek):** `scripts/cordis-import.ts` içe aktarım bittikten sonra `generatePartnerProfiles()` çağırıyor. Bu iş gerçek hacimde 4 GB heap'i doldurup süreci öldürüyor (exit 134). Nedeni 1.343.373 eş-katılım çiftini tek `Map` içinde tutması; ayrıca her kuruluş için `coPartItems.filter` çalıştırıyor, bu da O(n·m). İçe aktarım bundan etkilenmiyor, SUCCESS olarak kalıyor. Ama `CordisPartnerProfile` = 0, yani M1 ekranları boş kalır. Kart: **TASK-MUMJ7W0GUI6N1** (be-fb, backlog).
- **Kısmi yazım:** Veriler 1000'lik partiler halinde ayrı transaction'larla yazılıyor. Eşik kontrolü yazmadan önce yapılıyor, ama yazma sırasında bir DB hatası olursa önceki partiler kalıyor. Bu mevcut tasarım: upsert olduğu için yeniden koşmak güvenli. Alarm metni de artık bunu söylüyor, "önceki veri korunur" diye yanlış bir şey iddia etmiyor.
- **İndirme yolu değişmedi:** `fetch(url)` çağrısında zaman aşımı ve yeniden deneme yok. MVP ölçümünde CORDIS sunucusu 135 sn'de bağlantıyı kesmişti. Bu koşuda gerçek zip yerel dosyadan okundu (`localZipPath`, sha256 aynı). Aylık cron'un indirmesi hâlâ kırılgan. Ayrı bir iyileştirme olarak önerilir.
- **Ayrıştırıcı kuralının sınırı:** Bir metnin içinde tam olarak `";"` dizisi geçerse o kayıt yanlış bölünür. Böyle bir kayıt alan sayısı tutmadığı için `malformed` olarak raporlanır ve eşik hesabına girer. Sessizce yanlış veri yazılmaz.
- Bellek: her CSV bir kerede dizeye okunuyor (en büyüğü 60 MB). Önceki kod da bütün kayıtları dizide topluyordu, yani bellek davranışı aynı sınıfta.

## 5) Açık sorular
- %0,1 eşiği benim seçimim (HORIZON'da ≈ 23 proje). Daha katı (0) ya da daha gevşek bir değer istenirse `MAX_SKIPPED_RATIO` tek satırlık bir değişiklik. Ürün/patron kararı.
- `workers/cordis/main.py` (Python worker, aylık Inngest yolu) şu an mock veriyle çalışıyor. Gerçek CSV okumaya geçerse aynı tırnak sorunu orada da çıkar: pandas ve `csv` modülü Python'un yanlış okumasını tekrarlar.

## 6) Sonraki adım
1. TASK-MUMJ7W0GUI6N1 (M1 profil işinin OOM'u) tamamlanınca MVP §8 madde 3b yeniden ölçülmeli.
2. İsteğe bağlı: importer `fetch` çağrısına zaman aşımı + yeniden deneme (ya da `curl -C -` benzeri devam ettirme).
3. Push 1 Ekim'de, patron onayıyla.
