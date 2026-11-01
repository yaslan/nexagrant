# TASK-MUM0M211WDIW5 — FB İNCELEME-9 (crw-fb)

Repo `/Users/macbook/alan/FONBRIDGE`, dal `dev`, HEAD `d4152d3a` (ağaç temiz; yalnız izlenmeyen `FON_BRIDGE.md`). Kod değiştirilmedi. Push yok.

| Kart | Görev                                              | Commit'ler                                | Karar                                                          |
| ---- | -------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| 1    | TASK-MULZATEX4G92H pano sızıntı-2 (PİLOT KAPISI)   | `8f4048db` `d4152d3a`                     | **DÜZELTME GEREKLİ** (B-1). Funnel çekirdeği kendi saldırganıma dayanıyor. |
| 2    | TASK-MULQKV3BJT6VM K3 Horizon Dashboard xlsx → TopicStat | `f626b2cf` `72c824db` `75bba15b` `672c973e` | **ONAY** (Ö-1, Ö-2 bloke etmiyor, yalnız platform_admin)      |

Bloke eden tek bulgu Kart 1 B-1. Sebep funnel değil, aynı sayfadaki davet kodu paneli. Paneldeki kesin `usedCount`, funnel'ın yuvarlanmış toplamıyla birleşince "<5" diye maskelenen bir kodun 1..4 aralığını geri veriyor. Aynı kesin sayı yuvarlanmış toplamı da kesin hale getiriyor.

## 1. Ne yapıldı

1. Kapıları kendim koştum (`set -a; source .env; set +a`): typecheck, lint, test, rls:check/verify/bypass-check, i18n:check. İlgili dosyaları ayrıca verbose koştum; canlı testler atlanmadı.
2. **Kart 1, kendi saldırganım.** scipy HiGHS ile **tam sayılı** program (MILP) yazdım. Bu, LP'den ve repodaki aralık yayılımından güçlü.
   - Bilinmeyenler: her adım × 9 tür × (il | ilsiz) taban hücresi.
   - Kısıtlar: her yayımlanan sayı `[max(5, v−2), v+2]` aralığında; taban hücrede tüm alt küme ilişkileri; tamsayı ve ≥0.
   - Saldırgan hangi illerde kurum olduğunu biliyor.
   - Hedefler: gerçek değeri 1..4 olan her gizli nicelik. Bunlar gizli hücreler, yayımlanmayan tür × il hücreleri, ilsiz kütle ve her seviyede "üst − alt" farkları.
   - Önce LP sınırı alınıyor, sonra MILP ile kesin min/max hesaplanıyor. Sızıntı ölçütü: 1 ≤ min ve max ≤ 4.
   - Veri `buildAgencyFunnel`'ın gerçek çıktısıyla üretildi: üç görünüm (none, orgType, her il).
   - İki üreteç kullandım: kurum düzeyinde gerçekçi üreteç (5–80 kurum, ağırlıklı il/tür, alt kümeler kurum bazında tutarlı) ve fe-fb'nin hücre düzeyi üreteci.
3. **Pozitif kontrol.** Aynı MILP'i eski koda (`672c973e`, ayrı worktree) karşı koştum. Saldırganın kör olmadığını gösteriyor.
4. **Tehdit modelini genişlettim:** aynı sayfadaki davet kodu `usedCount` kanalı. Bunu hem saf fonksiyonla hem :3000'de canlı ölçtüm.
5. **Kart 2:** kodu satır satır okudum. xlsx okuyucusuna düşmanca dosyalar verdim: kapanmayan etiket ve aynı parçaya işaret eden çok sayfa. :3000'de admin ve üye oturumlarıyla sayfa ve API yetkisini denedim. Bağımlılık, lisans ve şema kontrolü yaptım.

## 2. Kanıt

### Kapılar (HEAD `d4152d3a`)

| Kapı                    | Sonuç                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm typecheck`        | rc=0                                                                                        |
| `pnpm lint`             | rc=0                                                                                        |
| `pnpm test`             | rc=0 — `Test Files 190 passed \| 2 skipped (192)` · `Tests 2181 passed \| 8 skipped (2189)` |
| `pnpm rls:check`        | rc=0 — "every one of them carries ENABLE + FORCE + tenant_isolation"                        |
| `pnpm rls:verify`       | rc=0 — "47 kiracıya özel tabloda … izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü"         |
| `pnpm rls:bypass-check` | rc=0 — "no new tenant bypass … 32 on the sanctioned cross-tenant path"                      |
| `pnpm i18n:check`       | rc=0 — "both catalogs agree …"                                                              |

İlgili dosyalar verbose (`src/lib/agency`, `tests/agency-funnel.live`, `tests/k3-topic-stats-{parse,authz,import.live}`): `Test Files 8 passed (8) · Tests 96 passed (96)`. Canlı testlerin hepsi ✓ (↓ yok). Saldırgan kapısının 3 tohumu ve benim iki örneğim yeşil.

### Kart 1: kendi MILP saldırganım

| Veri                             | Görünür sayı modeli                        | Tablo | Sızan tablo |
| -------------------------------- | ------------------------------------------ | ----- | ----------- |
| **eski kod** `672c973e` (pozitif kontrol) | kesin (yuvarlama yok)             | 60    | **33**      |
| yeni kod, kurum üreteci ×2 tohum | yuvarlanmış (`pub`)                        | 300   | **0**       |
| yeni kod, hücre üreteci ×2 tohum | yuvarlanmış (`pub`)                        | 300   | **0**       |
| yeni kod, 4 veri kümesi          | yuvarlama YOK varsayımı (`exact`, yalnız kural) | 600 | 0          |
| yeni kod, 4 veri kümesi          | + kayıt toplamı kesin (≥5 ise; tek davet kodu) | 600  | 0           |
| yeni kod, geniş (4–9 tür, 1–5 il) | yuvarlanmış                                | 1200 (6 tohum × 200) | **0** |
| yeni kod, 4 veri kümesi          | + grup başına davet kodu (bkz. B-1)        | 600   | **133**     |

Pozitif kontrolden örnekler (eski kod): `registered-submitted|*|Samsun true=2 ILP=[2,2]`, `registered-savedSearch|CONSULTANCY|* true=2 ILP=[2,2]`.

**Sorulan sorulara yanıtlar:**

- **İki boyut arasında geçiş ve adım zinciri, yalnız funnel çıktısıyla:** açık bulamadım. Tür görünümü ile il görünümü aynı büyük toplamı paylaşıyor, adım zinciri de modelde. Tam sayılı kesin sınırla (LP'den güçlü) 2400 tablonun (1200 + geniş 1200, ≈210 bin küçük hedef) hiçbirinde 1..4 aralığı açılmadı. Tek boyut kararı ve kural (a) tek başına bile tuttu (`exact` satırı, 600'de 0).
- **"Toplam ayrı yuvarlanır" kuralı fark yoluyla sızdırıyor mu:** Yalnız funnel içinde hayır. Toplam aralığı 4 genişlikte. Görünür her parça en az 2 genişlik ekliyor ("5" = 5..7). Bu yüzden tek bir farkın genişliği ≥6 oluyor ve [1,4]'e sığamıyor. MILP bunu 1200 tabloda doğruladı. **Ama** sayfada yuvarlanmamış başka bir sayı varsa aralık daralıyor. B-1 tam olarak bu.
- **Saldırgan testi yeterli mi:** Funnel için büyük ölçüde evet. Aralık yayılımı LP ve MILP'ten zayıf ama benim MILP'im de 0 buldu. Eksikleri Ö-1'de: aynı sayfadaki başka paneller modelde yok, algoritma bilgisi yok, zaman farkı yok.

### Kart 1 B-1: davet kodu kanalı (saf fonksiyon + canlı)

Saf fonksiyon (`codes-poc.ts`: gerçek `buildAgencyFunnel` + `shownUsedCount`):

```
pano registered: {"state":"count","value":10} → saldırgan: R ∈ [8,12]
kod A used: 7  kod B used: null (<5 → B ∈ [0,4])
B = R − A ∈ [1, 4]  (gerçek 3) → K-1'in gizlediği 1..4 geri geliyor
```

Canlı: :3000, dev DB'deki mevcut ajans `cmulve87g0003l5xk9fkowrep`, 6 kurum. Oturum `.env` AUTH_SECRET ile imzalı JWT (admin-plan-editor.spec.ts yöntemi); veri eklenmedi.

```
/tr/ajans              200  "registered":{"state":"count","value":5}   "dimension":"none"
/tr/ajans?kirilim=tur  200  … "dimension":"orgType"
/tr/ajans?kirilim=Samsun 200 … "dimension":"province"  (yanıtta byOrgType: 0 eşleşme)
aynı sayfa, davet kodu:  "usedCount":6,"exhausted":false
```

Funnel "5" gösteriyor. Aynı sayfada kodun kesin "6"sı var. `funnel.ts:37`'deki "the browser never receives … an exact count" iddiası sayfa düzeyinde tutmuyor.

### Kart 2: xlsx okuyucusu, düşmanca girdi

Kapanmayan `<row>` etiketinde süre karesel büyüyor (tsx, doğrudan `readXlsx`; n×2 → süre ≈×4):

```
z-row-10000.xlsx   630 bytes    144 ms
z-row-20000.xlsx   703 bytes    473 ms
z-row-40000.xlsx   848 bytes   1758 ms
z-row-80000.xlsx  1139 bytes   6981 ms
z-row-160000.xlsx 1720 bytes  26613 ms
z-c-40000 (kapanmayan <c>) 1075 ms · z-si-40000 (kapanmayan <si>) 1405 ms
```

Aynı dosyalar gerçek rotadan (:3000, platform_admin, `mode=preview`, yazma yok):

```
z-row-10000 1069B upload → 422 in 0.48s
z-row-20000 1142B upload → 422 in 2.10s
z-row-40000 1287B upload → 422 in 9.49s
```

Rota ölçümü sırasında makinede paralel MILP süreçleri çalışıyordu, bu yüzden mutlak süreler şişkin. Oran (≈×4.5) karesel büyümeyi gösteriyor.

Bellek büyütmesi: 100.000 satır, her satırda `GR` sütununda boş bir hücre (dolgu 200 sütuna).

```
z-wide.xlsx  474872 bytes, 1 sayfa                     372 ms  rss 336 MB
z-wide8.xlsx 474915 bytes, 8 <sheet> aynı parçaya  2681 ms  rss 1704 MB
```

Yetki (:3000):

```
admin : page 200 (başlık "Horizon Dashboard xlsx → TopicStat") · rescore {"error":"bad_prefixes"} 400 · import 422 layout_changed
üye   : page 404 · rescore 403 PLATFORM_ADMIN_REQUIRED · import 403 PLATFORM_ADMIN_REQUIRED
anonim: page 404 · import 401
```

Bağımlılık ve şema: `git diff f626b2cf~1 672c973e --stat -- prisma package.json pnpm-lock.yaml` boş. Yeni bağımlılık ve şema değişikliği yok. Kullanılan `unzipper` zaten vardı: sürüm 0.12.5, lisans MIT. Bilinen zip-slip CVE'si (CVE-2018-1002203) diske açmayla ilgili. Burada `Open.buffer` + bellekte okuma var, dosya sistemine yazılmıyor, bu yüzden geçerli değil.

## 3. Bulgular

### Kart 1: TASK-MULZATEX4G92H

**B-1: Davet kodu `usedCount` kesin gösteriliyor. Funnel toplamının yuvarlanmış aralığıyla farkı, "<5" maskeli kodun 1..4'ünü açıyor (DoD 5 / K-1 sağlanmıyor).**

- Yer: `src/lib/agency/codes.ts:65-66` (`shownUsedCount`: ≥5 ise kesin), `src/app/[locale]/(app)/ajans/page.tsx:62-63`, `actions.ts:107-108`, `invite-codes-panel.tsx:258` (`used / max · left kaldı`).
- Mekanizma: Her kod kullanımı bir kiracıyı ajansa bağlar (`redeem_agency_invite`, `add-agency-invite-code.sql:149`). Silinen kiracı sayılmadığı için R ≤ Σ usedCount her zaman doğru. Buradan B ≥ R − Σ(diğer kodlar) çıkar. "<5" ise B ≤ 4 verir.
- Senaryo: Kod A 7 kez kullanılmış ("7 / 25 kullanıldı"), kod B 3 kez kullanılmış ("<5 / 25"), 10 kurum kayıtlı. Pano toplamı "10" gösteriyor, yani R 8..12. Saldırgan B ∈ [8−7, 4] = **[1, 4]** buluyor (kanıt yukarıda). Kod B bir etkinlikte ya da tek bir kuruma verildiyse, bu "o gruptan 1–4 kurum kayıt oldu" demek. K-1'in engellemek istediği tam olarak bu.
- İkinci etki: Tek kodlu ajansta (yaygın durum) `usedCount` = kesin kayıt toplamı. Canlıda "5" ile "6" yan yana görünüyor. Yuvarlama yedeği (karar 4) en büyük sayı için etkisiz kalıyor. Funnel geri kalanı bununla da açılmadı (MILP `total` satırı: 600'de 0).
- Kodlar gruplara göre dağıtılırsa (il/tür başına kod), MILP 600 tablonun 133'ünde açık buldu. Çoğu grup kayıt sayısı. Birkaçı funnel adımı: `savedSearch|MUNICIPALITY|<ilsiz> true=2 ILP=[2,2]`, `pipeline|SME|<ilsiz> true=4 ILP=[4,4]`. Bu satır "kodu kullanan = o gruptaki kurum" varsayımına dayanıyor. Kesin olan senaryo yukarıdaki A/B örneği.
- Yuvarlama tek başına düzeltmez. A=7 "5" gösterilse (5..7) bile R ∈ [8,12] ile B ∈ [1, 4] kalır.
- Önerilen düzeltme (seçim leed-fb/HUKUK-5'in):
  - (a) Ajansa kod başına kullanım **sayısı** gösterilmesin, yalnız durum gösterilsin (aktif/tükendi/iptal/süresi doldu). `maxUses < 5` kodlarda "tükendi" de gizlensin, ya da `maxUses ≥ 5` zorunlu olsun (fe-fb'nin açık sorusu).
  - (b) Sayı kalacaksa, kod çizgisi (R ≤ Σ used, tükendi ⇒ used = max) gizlemeye bir çizgi olarak girsin.
  - Her iki durumda da `funnel.attack.test.ts` saldırganına kod paneli girdi olarak eklensin (Ö-1).

**Ö-1: Saldırgan kapısı yalnız funnel'ı modelliyor (`funnel.attack.test.ts:23-37`).**

- Aynı yanıttaki davet kodu paneli modelde yok. B-1 bu yüzden kapıdan geçti.
- Algoritma bilgisi yok ("bu hücre neden gizli" çıkarımı). fe-fb bunu yazmış; standart SDC varsayımı, kabul edilebilir.
- Zaman farkı yok: bkz. K-1.
- Öneri: `publish()` kod panelini de yayımlasın (`usedCount`, `exhausted`, `maxUses`). Kısıtlar: R ≤ Σ used ve used ≤ max.

**K-1 (HUKUK-5, eski K-1'in devamı): Birikimli sayılar ve yuvarlama sınırı.**

Kohort birikimli ve kayıt monoton artıyor. Pano "10"dan "15"e geçtiği an R = 13 demektir. O anı yakalayan, iki sınır arasında her yeni kaydı kendi kod dağıtımıyla eşleştirebilir. Yuvarlama bu kanalı daraltıyor ama kapatmıyor. fe-fb raporunda da açık. Pilot öncesi karar gerekmiyor, HUKUK-5 notu yeter.

**K-2: Performans (öneri, bloke değil).**

`getAgencyFunnel` her tür × il grubu için `countApplicationOutcomes` çağırıyor (`funnel.ts:445-454`). Bu da kiracı başına ayrı `withTenant` işlemi ve 3 sayım demek. Kurum sayısıyla doğrusal büyüyor, pilot ölçeğinde sorun değil.

**Doğrulanan DoD maddeleri:**

- (1) Yanıt tek kırılım taşıyor. Canlıda il görünümünde `byOrgType` 0 eşleşme. Test `publish()` bunu `expect(...).not.toMatch` ile koruyor.
- (2) Adım 6–7 kurum sayıyor: `Math.min(x,1)`, `applicationOutcome.ts:127`. `accepted`/`rejected` ⊆ `submitted`, çünkü aynı `where` + durum filtresi. Canlı test "6 who applied where applications count 8" ✓.
- (3a) Kural (a) `funnel.ts:297-306`. Sıfırlar örtü sayılmıyor, en az 2 parça ve ≥5 şartı var.
- (3b) Saldırgan kapısı 3×300 yeşil, benim iki örneğim yeşil. Pozitif kontrolüm eski kodda 33/60 sızıntı buldu.
- (4) Yuvarlama `roundToFive`. "5" = 5..7 eşiği korunuyor. Funnel içinde fark yoluyla sızıntı yok.
- (5) K-2 `normalizeProvinces` ✓. K-1 kısmen: B-1.

### Kart 2: TASK-MULQKV3BJT6VM

**Ö-1: xlsx okuyucusunda karesel regex. 1,7 KB'lık dosya olay döngüsünü 26 sn kilitliyor, 50 MB'lık parça saatlerce.**

- Yer: `src/lib/k3-topic-stats/xlsx.ts:119` (`<row\b…>([\s\S]*?)<\/row>`), `:130` (`<c …`), `:112` (`<si …`).
- Senaryo: Kapanmayan her `<row>` etiketi için motor `</row>`'u dosya sonuna kadar arıyor. k açılışta O(k·n). Ölçüm yukarıda: 160.000 `<row>` (1.720 bayt sıkıştırılmış) = 26,6 sn. Parça sınırı 50 MB, yani ≈10M açılış mümkün. Bu, kestirimle saatler ya da günler demek (koşulmadı). Node tek iş parçacıklı olduğu için tüm kiracılara hizmet durur.
- Bloke etmiyor: rota yalnız platform_admin (`route.ts:44`). Tehdit, kandırılmış bir admin ya da bozuk bir dışa aktarım.
- Başlık yorumu (`xlsx.ts:10-19`) "hostile bytes'a karşı yazıldı" diyor, bu yüzden düzeltilmeli.
- Düzeltme: `indexOf` ile ilerleyen tarayıcı kullanılsın. `</row>` bir kez aranır, yoksa MALFORMED verilir. Ya da mevcut bir SAX ayrıştırıcı kullanılsın. Teste `'<row>'.repeat(1<<16)` büyüme eğrisi eklensin.

**Ö-2: Bellek büyütmesi. Aynı parçaya işaret eden sayfalar ve 200 sütuna dolgu.**

- Yer: `xlsx.ts:225-231` (her `<sheet>` parçayı yeniden okuyor; yol tekilleştirilmiyor), `:154` (`while (cells.length < col) cells.push('')`).
- Senaryo: 475 KB'lık dosya, 8 sayfa → 1,7 GB RSS (ölçüldü). Bütçe 120 MB şişmiş veri, yani ≈30 sayfa. Kestirim ≈6 GB, varsayılan heap'i aşar ve süreç çöker (koşulmadı, paylaşımlı makinede çökertme denemedim).
- Düzeltme:
  - sayfa yolları tekilleştirilsin;
  - bayt bütçesinin yanında hücre bütçesi olsun (ör. toplam 2M hücre);
  - ya da yalnız başlığı bulunan ilk sayfa tam ayrıştırılsın (`parseHorizonDashboard` zaten ilk uygun sayfayı kullanıyor).

**K-1: Sayfa admin olmayana 404 dönüyor, API 403 dönüyor.**

DoD "diğerleri 403" diyor. Sayfa 404'ü mevcut admin layout deseni (`admin/layout.tsx:35-37`, `notFound()`). API iki rotada 403 veriyor, testli (`k3-topic-stats-authz.test.ts:61,109`). Tutarlı, kabul.

**K-2: Oran ölçeği tahmini (`horizonDashboard.ts:272-277`).**

- Başlıkta "%" yoksa, sayı sütunu da yoksa ve tüm çıplak değerler ≤1 ise sütun kesir sayılıyor. Gerçekten yüzde olan "0.5" (=%0,5) %50 okunur.
- Sayı sütunları varsa `rateMismatch` bunu yakalar. Ayrıca reddedilecek satırların (toplam satırı vb.) değerleri de ölçek kararına katılıyor.
- Horizon oranları (%10–20) için düşük olasılık. Önizlemede `rateScale` gösteriliyor, admin görüyor. Not.

**K-3: `Content-Length` yoksa gövde sınırsız okunuyor (`route.ts:47-54`).**

Parçalı (chunked) yüklemede `req.formData()` önce tüm gövdeyi belleğe alıyor. `file.size` kontrolü sonra geliyor. Yalnız admin. Not.

**Doğrulanan DoD maddeleri:**

- Platform_admin'e özel ekran ve API (canlı ve test).
- Sunucuda ayrıştırma. Sütun eşleme değişirse açık `layout_changed` hatası veriliyor, bulunan başlıklar da gösteriliyor (canlı 422).
- Önizleme → onay. `expectedHash` ile önizlenen dosya dışında bir dosya yazılamıyor (409, testli).
- Upsert anahtarı (prefix, topicId, country, orgType) ve advisory lock ile yeniden planlama var. Dosya içi yinelenen satır `duplicate` olarak reddediliyor.
- İdempotent (canlı test ✓). Kaynak `horizon-dashboard|<dosya>|<tarih>`, ayrıca `recordRawFetch` hash'i kaydediliyor.
- Eşleşmeyen kodlar listeleniyor. G0 yeniden hesaplama butonu var; system-scope kaydı `scripts/tenant-bypass-baseline.json`'da gerekçeli.
- Testler: bozuk sütun, boş satır, "8%"/"0.08", 401/403, idempotent ✓. i18n ✓.
- Yeni bağımlılık yok, şema değişikliği yok.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MUM0M211WDIW5-crw-fb.md` (bu rapor). Kod değişikliği yok.
- Scratchpad'deki geçici dosyalar (repoda değil):
  - `gen.ts`, `gen-wide.ts`, `gen-old.ts`: `buildAgencyFunnel` ile yayın;
  - `milp.py`: MILP saldırganı, varyantlar `pub|exact|total|codes`;
  - `codes-poc.ts`;
  - `mkzip.py` ve `redos.ts`: düşmanca xlsx.
- Eski kod için ayrı worktree (`672c973e`) açıldı, iş bitince kaldırıldı.

## 5. Riskler

- B-1 düzeltilmeden pano pilota açılırsa ajans, "<5" gösterilen bir davet kodunun kullanım sayısını 1..4 olarak okuyabilir. Tek kodlu ajans kayıt toplamını kesin görür. Ek §3.1 ve K-1 kararı bununla çelişiyor.
- Kart 2 Ö-1 ve Ö-2: kötü niyetli ya da bozuk bir xlsx, platform_admin yüklediğinde tüm sunucuyu kilitleyebilir ya da düşürebilir.
- Saldırgan sonuçlarım örneklem: 2.400 tablo. Kanıt değil ama MILP, LP ve aralık yayılımından sıkı. Funnel için "açık bulunamadı" diyorum, "açık yok" demiyorum.

## 6. Açık sorular

- leed-fb/HUKUK-5: B-1 için (a) sayısız durum mu, (b) kod çizgisinin gizlemeye eklenmesi mi? `maxUses` alt sınırı 5 olsun mu?
- Algoritma bilgisi olan saldırgan kapsam dışı kalsın mı? Standart SDC varsayımı, fe-fb raporunda da var.

## 7. Sonraki adım

- fe-fb: B-1 düzeltmesi. Önce saldırgan testinin `publish()`'ına kod paneli eklensin: A=7, B=3, R=10 örneği kırmızı olmalı. Sonra düzeltme ve yeşil. crw-fb yeniden incelesin.
- se-fb: Ö-1 (indexOf tarayıcı ve büyüme eğrisi testi) ve Ö-2 (sayfa yolu tekilleştirme, hücre bütçesi) için küçük bir takip kartı.

## Platform beyanı

Doğrulama **mac** üzerinde yapıldı (Darwin 27.0, zsh, Node 26.5; Postgres 5433 docker; :3000 leed-fb'nin next dev sunucusu; MILP scipy 1.13.1/HiGHS, venv).

- İncelenen kod yolları platformdan bağımsız:
  - saf TS maskeleme ve yuvarlama;
  - Prisma sorguları;
  - bellekte zip/regex ayrıştırma (dosya sistemine yazma, yol ya da kabuk yok).
- Karesel regex davranışı V8'e ait, işletim sisteminden bağımsız. Bellek sınırı Node heap ayarına bağlı, platform farkı beklenmiyor.
- Windows ve Linux'ta koşulamadı, çünkü bu ofiste yalnız mac var. Koddan beklenen davranış aynı.
- Tarayıcıda etkileşimli tıklama yapmadım. Sayfalar imzalı oturumla curl'le SSR/RSC yükünden doğrulandı; kareleri yazarlar çekmişti.
