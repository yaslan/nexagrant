# TASK-MUMJ7W0GUI6N1: M1 ortak profil işi, gerçek CORDIS hacminde OOM (devop-fb)

**Tarih:** 29.09.2026 · **Dal:** `dev` · **Commit:** `e46d9798` (push yok) · **Önceki:** TASK-MUMH7CVD8P2J0 (se-fb)

**Platform beyanı:** yalnız **macOS** üzerinde doğrulandı (Darwin 27, arm64, Node 26.5, Postgres docker `fabrika-postgres`). Değişen kod iki parçadan oluşuyor: saf JS hesap ve Prisma/SQL çağrısı. Dosya yolu, kabuk, süreç ya da ikili çağrısı yok, yani platforma bağlı bir yol yok. Yıl hesabı eskiden sürecin saat dilimine bağlıydı (`getFullYear()`); artık Postgres `EXTRACT(YEAR)` ile UTC'de yapılıyor ve her platformda aynı sonucu veriyor. Windows/Linux **koşulamadı**: bu makinede yalnız macOS var. CI (Linux) aynı canlı testi docker Postgres'e karşı koşar.

## Özet

| Kabul | Sonuç | Kanıt |
|---|---|---|
| Gerçek hacimde (23.613 proje) koşu | **GEÇTİ** | 35.200 profil, 1.061.382 eş-katılım, exit 0 |
| En yüksek bellek önce/sonra | **4,6 GB OOM → 602 MB** | `/usr/bin/time -l` maximum resident set size |
| Süre önce/sonra | **778 sn'de OOM → 22 sn** | Eski iş 12 GB heap ile 1145 sn'de bitiyor |
| Bellek gerçekten sınırlı mı | **GEÇTİ**: 256 MB heap sınırında exit 0 | Eski kodla aynı sınırda OOM |
| Eskiyle birebir aynı sonuç (küçük veri) | **GEÇTİ**: canlı test + 4/4 mutant yakalandı | `tests/cordis-partner-profile.live.test.ts` |
| Eskiyle birebir aynı sonuç (**gerçek veri**) | **GEÇTİ**: 0 fark | 1.061.382 çift + 35.200 profil `EXCEPT` = 0 |
| typecheck + lint + testler | **GEÇTİ** | `tsc` 0 · `eslint` 0 · vitest 216 dosya / 2485 test |

## 1) Ne yapıldı

**Kök neden: iki ayrı birikim var.**
1. **Bütün grafın belleğe alınması** (kartta tarif edilen sorun):
   - Eski iş bütün katılımları çekiyordu.
   - Ardından her kuruluşu katılımlarıyla birlikte `include` ile çekiyordu. Bu `include` her katılıma projenin tam kopyasını getiriyordu (`rawJson` ve `objective` dahil).
   - 1.061.382 çiftin tamamı bir JS `Map` içinde tutuluyordu.
   - Her kuruluş için bütün çiftler üzerinde `filter` çalışıyordu: 35.200 × 1,06 M.
   - Sonuç: varsayılan 4 GB heap'te exit 134.
2. **Sayfalamadan sonra ortaya çıkan ikinci sızıntı:** Prisma 7'nin sorgu planı önbelleği.
   - İlk sayfalı sürüm varsayılan heap ile geçti, ama 256 MB sınırında yine OOM verdi. Heap her sayfada ~10 MB büyüyordu.
   - Ayrıştırma adım adım yapıldı:
     - yazma kapatılınca heap düz kaldı;
     - `queryPlanCacheMaxSize: 0` ile açılan bir istemcide de düz kaldı (~85 MB) ve iş bitti.
   - Kök neden: her sayfanın `$transaction([500 × upsert])` partisi değişen JSON değerleri yüzünden önbellekte yeni bir plan olarak kalıyor. Önbellek varsayılan olarak 1000 kayıtlık bir LRU.

**Düzeltme** (`src/lib/k2-cordis/partnerProfileJob.ts`, dışa açık imza aynı; opsiyonel `{ pageSize }` eklendi):
- **Eş-katılımlar:**
  - `organisationId` imleciyle 500'lük sayfalar hâlinde işleniyor.
  - Her sayfa için Postgres'te tek bir `INSERT … SELECT … GROUP BY … ON CONFLICT DO UPDATE` çalışıyor. Çift yalnız küçük id'li (`orgA`) tarafın sayfasında üretiliyor, böylece her çift tam bir kez yazılıyor.
  - `COLLATE "C"`, JS `<` sırasını koruyor.
  - Tarihli projesi olmayan bir çift için saklı yıl korunuyor (`COALESCE`). Prisma'nın `undefined` davranışı da buydu.
- **Profiller:**
  - Sayfa başına yalnız okunan kolonlar yükleniyor: kuruluş alanları, katılım rol/katkı, proje framework/tarih, konu kod/başlık.
  - Hesap eski JS mantığının aynısı.
  - İlk 20 ortak SQL'de `ROW_NUMBER() OVER (PARTITION BY org …) <= 20` ile seçiliyor.
  - Yazma sayfa başına **tek parametreli SQL** ile yapılıyor (`jsonb_to_recordset` + `ON CONFLICT`). Metni sabit olduğu için plan önbelleğini büyütmüyor.
  - `topCountries` eskisi gibi yalnız ilk insert'te `[]` oluyor. `updatedAt` UTC damgalanıyor.
- **Çağıranlar değişmedi:** `scripts/cordis-import.ts` ve `src/app/api/admin/cordis/import/route.ts` argümansız çağırıyor. `src/app/[locale]/admin/cordis/actions.ts` dosyasına **dokunulmadı** (be-fb'nin alanı).
- **Test:**
  - Eski iş, test kâhini (oracle) olarak `tests/helpers/partnerProfileJob.legacy.ts` içinde birebir saklandı. Yalnız adı `…Legacy` oldu.
  - `tests/cordis-partner-profile.live.test.ts` 41 kuruluş ve 60 projelik deterministik bir fikstür kuruyor. Fikstürde şunlar var:
    - 20'den fazla ortağı ve 20'den fazla konusu olan bir merkez kuruluş,
    - yalnız endDate'li ve hiç tarihsiz projeler,
    - H2020 projeleri,
    - net katkısı null olan katılımlar,
    - katılımsız bir kuruluş.
  - Önce eski iş, sonra yeni iş `pageSize: 7` ile (sayfa sınırlarını geçerek) koşuluyor. Bütün profil ve çift satırları alan alan karşılaştırılıyor.

**Bilinçli fark (ürün etkisi var, karar notu):** Top-20 listelerinde eşit sayılı kayıtların sırası eskiden satırların DB'den geliş sırasına bağlıydı, yani tanımsızdı. Artık sayı azalan, sonra kod/id artan sırada. Gerçek veride 20. sırada eşitlik olan listelerde listeye giren üyeler bu yüzden değişebiliyor:
- topPartners'ta 19.432 kuruluş,
- topTopics'te 811 kuruluş.

Bu listelerde sayı dizisi birebir aynı. Örnek: 1 ortak projeli 50 ortaktan hangi 20'sinin gösterileceği. Eski seçim de keyfiydi. İstenirse eşitlik kuralı ürün kararıyla değiştirilebilir (bkz. §5).

## 2) Kanıt

**Veri:** gerçek HORIZON dökümü, sha256 `1496a16ee79649d573a53697781b2fd950c18a5469c6a9f545f35dd5397771a7` (se-fb ile aynı zip). İzole bir DB kuruldu (`fabrika_devopfb_k2`, `prisma db push`) ve içe aktarıldı:
```
{"success":true,"durationMs":277308,"rowCounts":{"projects":23613,"organizations":35200,"participations":145909,"topics":23613,"scivocs":53035}}
```

**ÖNCE: eski iş, varsayılan heap** (`heap_size_limit MB 4192`):
```
exit=134
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
      778.19 real       692.45 user        34.17 sys
          4607574016  maximum resident set size
```

**Ara: ilk sayfalı sürüm (Prisma batch upsert ile).** Varsayılan heap'te geçti: `durationMs 55784, peakHeapMB 1646, RSS 2065252352`. 256 MB sınırında ise `exit=134 … heap out of memory`. Sayfa başına heap logu:
```
p2 parts 635 61 → p2 parts 556 82 → 90 → 103 → 114 → 135 …  (MB, sayfa başına ~+10)
```
Sızıntı ayrıştırması:
- yazma kapalıyken `peakHeapMB 101`, düz;
- `queryPlanCacheMaxSize: 0` ile `p2 partners 83…89…63`, `success true`, `peakHeapMB 130`, 256 MB sınırında.

**SONRA: son sürüm, gerçek hacim, boş tablolardan:**
```
{"which":"new","success":true,"updatedProfiles":35200,"updatedCoParticipations":1061382,"durationMs":21628,"peakHeapMB":285,"peakRssMB":550}
       22.15 real         4.54 user         0.37 sys
           601980928  maximum resident set size
```
**SONRA: 256 MB heap sınırı**, ikinci koşu, var olan satırların üstüne (idempotent):
```
NODE_OPTIONS=--max-old-space-size=256 → exit=0
{"which":"new","success":true,"updatedProfiles":35200,"updatedCoParticipations":1061382,"durationMs":30477,"peakHeapMB":136,"peakRssMB":417}
           446267392  maximum resident set size
DB: CordisCoParticipation 1061382 · CordisPartnerProfile 35200
```

**Gerçek veride birebir karşılaştırma.** Yeni işin çıktısı gölge tablolara alındı, tablolar boşaltıldı ve eski iş 12 GB heap ile koşuldu:
```
{"which":"old","success":true,"updatedProfiles":35200,"updatedCoParticipations":1061382,"durationMs":1144896,"peakHeapMB":4808,"peakRssMB":4735}
     1145.68 real  ·  4965482496  maximum resident set size
```
```
coParticipation         { new_only: 0, old_only: 0, n: 1061382, o: 1061382 }      (tüm kolonlar, EXCEPT iki yönde)
profile scalar columns  { new_only: 0, old_only: 0, n: 35200,   o: 35200   }      (updatedAt hariç tüm skaler kolonlar + topCountries)
top lists { orgs: 35200, topicsExact: 27528, topicsTieOnly: 7672, topicsDiff: 0,
            partnersExact: 1417, partnersTieOnly: 33783, partnersDiff: 0 }
tie ayrımı: topTopics { orderOnly: 6861, boundaryMembers: 811 } · topPartners { orderOnly: 14351, boundaryMembers: 19432 }
```
`TieOnly`: sayı dizisi aynı, son sayının üstündeki üyeler aynı. Fark yalnız eşitlik grubunun içinde. `Diff` = 0.

**Küçük veride karşılaştırma testi ve mutantlar:**
```
npx vitest run tests/cordis-partner-profile.live.test.ts → 1 passed
== M1 TOP_N 19                → FAIL  TESTPP-ORG-000 topTopics: counts … (9) vs (10)
== M2 year from endDate first → FAIL  expected [ …(369) ] to deeply equal [ …(369) ]
== M3 cursor gte              → FAIL  expected 109 to be 94
== M4 contrib ec first        → FAIL  TESTPP-ORG-000: expected { …(15) } to deeply equal { …(15) }
restored
```

**Kapılar:**
```
pnpm typecheck → tsc --noEmit, exit 0
pnpm lint      → eslint, exit 0
pnpm test      → Test Files 216 passed | 2 skipped (218) · Tests 2485 passed | 8 skipped (2493)
cordis grubu   → 5 files, 30 passed
```

## 3) Değişen dosyalar
- `src/lib/k2-cordis/partnerProfileJob.ts`: yeniden yazıldı.
- `tests/cordis-partner-profile.live.test.ts`: yeni.
- `tests/helpers/partnerProfileJob.legacy.ts`: yeni, eski iş test kâhini olarak.
- `docs/agent-results/TASK-MUMJ7W0GUI6N1-devop-fb.md`: bu rapor.
- İzole DB `fabrika_devopfb_k2` iş bitince **silindi**. Paylaşımlı `fabrika` DB'de yalnız testin `TESTPP-` fikstürü koşu süresince yazılıp silindi (sonrasında 0 satır doğrulandı).

## 4) Riskler
- **Top-20 eşitlik kuralı değişti.** Bkz. §1. Sayılar aynı, eşit sayılılar arasındaki seçim artık id sırasına göre. Eskisi tanımsızdı, yeniden koşunca bile değişebilirdi.
- **Canlı test paylaşımlı DB'deki bütün CORDIS kuruluşlarını yeniden hesaplıyor.** Her iki iş global çalışıyor. Yazılan değerler içe aktarımın yazacaklarıyla aynı. Yerel DB'de 53 kuruluş var, test 1,1 sn sürüyor. Büyük bir CORDIS verisi yüklü bir DB'de bu test uzar; eski iş gerçek hacimde OOM verir. CI'daki DB boş olduğu için orada sorun yok.
- **`tests/cordis-import.test.ts`** mock bir `prisma` ile `generatePartnerProfiles()` çağıran bir adım içeriyor. Bu adım `scripts/tmp_cordis/horizon.zip` yoksa atlanıyor, bugün de atlanıyor. Zip eklenirse mock'ta `$executeRaw`/`$queryRaw` olmadığı için düşer. O dosyaya dokunmadım.
- **Aynı plan önbelleği kalıbı importer'da da var:** 1000'lik upsert partileri, her partide farklı `rawJson`. Bugün 272 sn'de geçiyor. Hacim büyürse aynı sızıntı çıkabilir; bu makinede ölçülmedi.
- Eş-katılım aşaması sayfa başına ayrı bir statement. Yarıda bir DB hatası olursa önceki sayfalar yazılmış kalır. Eski davranış da aynıydı (500'lük ayrı transaction'lar). Upsert olduğu için yeniden koşmak güvenli.

## 5) Açık sorular
- Top-20'de eşitlik kuralı: id sırası mı kalsın, yoksa ürün başka bir ölçüt mü istiyor (ör. son ortak yıl, TR önceliği)? Ürün/patron kararı. Değişiklik SQL'deki `ORDER BY` satırında tek satır.

## 6) Sonraki adım
1. MVP §8 madde 3b (M1 ekranları dolu) artık yeniden ölçülebilir. Gerçek içe aktarım + profil işi toplamı ≈ 277 sn + 22 sn.
2. İsteğe bağlı: importer partilerini aynı `jsonb_to_recordset` kalıbına taşımak.
3. Push 1 Ekim'de, patron onayıyla (TASK-MUMACETT8NSI4).

**Geri alma:** `git revert e46d9798`. Şema değişikliği yok, geri alma yalnız kod.
