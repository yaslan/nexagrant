# TASK-MTS80DUAF39Z8 — SystemAlert'in tekrar koruması yoktu (customer-support / CS-EN)

Kod `f79156d` ile girdi; bu rapor geç yazıldı (S12 dalga 6'da tamamlandı) ve kanıtları
**bu koşuda yeniden ölçüldü**, commit mesajından kopyalanmadı.

---

## 1. Ne yapıldı

Kartın iddiası: aynı uyarı her koşuda yeni bir satır olarak yazılıyor, bu yüzden
`/admin/alerts` gerçek sinyali gömüyor. **İddia doğrulandı ve kapatıldı.**

`recordAlert()` düz bir `systemAlert.create` idi. Artık önce **çözülmemiş** ve aynı
kimliğe — `(level, source, message, çağıranın meta'sı)` — sahip bir uyarı arıyor; varsa
o satırı `alertRepeatCount` / `alertLastSeenAt` ile güncelliyor, yeni satır açmıyor.

Kararlar ve gerekçeleri:

- **Kimlik `meta`'yı da kapsıyor.** Aynı metin farklı bir bağlamdan geldiğinde
  (başka host, başka ay) ayrı bir olaydır; tek sayaca katlamak operatörden bilgi saklar.
  Karşılaştırma JS'te kararlı `stringify` ile yapılıyor: değer olarak eşit iki `meta`,
  saklanmış JSON metni olarak eşit olmak zorunda değil.
- **Arama `source` ile başlıyor**, böylece mevcut `[source, createdAt]` indeksini kullanıyor.
- **Ayrılmış anahtarlar (`alertRepeatCount`, `alertLastSeenAt`) çağıranın girdisinden
  sökülüyor** — kendi meta'sını yankılayan bir iş sayacı taklit edemesin.
- **Uyarıyı çözmek pencereyi kapatıyor:** bir sonraki oluş taze bir satır açar. Bir
  operatör bir şeyi "tamam" diye işaretlediyse, sorun geri geldiğinde bunu görmeli —
  arkasında sessizce artan bir sayaç olarak değil.
- **Migration yok.** `buildAlertRow()` kolon şeklini birebir koruyor
  (`calendar/__tests__/sync.test.ts` bu satırı gerçek Prisma istemcisine veriyor ve
  şemada olmayan her alanda kırılır), defter tutma `meta` içinde yolculuk ediyor.
- `/admin/alerts` sayacı **gösteriyor**: satırda `× N` rozeti, özette "tekrar" kutucuğu,
  detay panelinde son görülme + açıklama. Bu olmadan tablo hâlâ süren bir arızayı
  eksik raporlardı, çünkü `createdAt` artık "en son ne zaman oldu" değil "ne zaman
  başladı" anlamına geliyor.

## 2. Kanıt (bu koşuda üretildi, gerçek Postgres)

### 2.1 Birim testler

```
$ npx vitest run src/lib/observability/__tests__/system-alert-dedupe.test.ts
 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  135ms
```

### 2.2 Sayaç canlı veride çalışıyor

`SystemAlert`'te sayaç taşıyan satırlar (`meta ? 'alertRepeatCount'`):

```
total SystemAlert rows: 16; rows carrying alertRepeatCount: 2
  x6  k2_monthly_cordis  CORDIS worker unreachable: fetch failed  last=2026-09-08T06:12:20.716Z
  x2  k2_monthly_cordis  CORDIS worker returned HTTP 401          last=2026-09-08T06:05:49.313Z
```

Altı ayrı oluş **tek satırda**; düzeltmeden önce bu altı satır olurdu.

### 2.3 Aynı metnin ayrı bir olay olduğu durum — dedupe'u "kaçırmıyor", ayırıyor

Aynı `message`'a sahip dört satırın `meta`'sı:

```
cmtrndx2j…  2026-09-07T19:42:45Z  {"host":"localhost:8000","month":"2026-09"}
cmts6w0mm…  2026-09-08T04:48:42Z  {"host":"localhost:8000","month":"2026-09"}
cmts6w4lh…  2026-09-08T04:48:47Z  {"host":"localhost:8000","month":"2026-09",
                                   "alertLastSeenAt":"2026-09-08T06:12:20.716Z","alertRepeatCount":6}
cmts9obd4…  2026-09-08T06:06:41Z  {"host":"127.0.0.1:8123","month":"2026-12"}
```

- İlk iki satır **düzeltmeden önce** yazılmış özdeş kalıntı (kartın şikâyet ettiği desen).
- Üçüncü satır düzeltmeden sonraki tüm oluşları içine katlıyor (`×6`).
- Dördüncü satır **başka bir host ve başka bir ay** — ayrı bir satır olması doğru davranış,
  dedupe kaçağı değil.

### 2.4 Geriye kalan yinelenmeler

```
duplicate (level, source, message, meta) groups still in SystemAlert: 3
  n=3  k1_daily_calls     K1 sources returned 2 identifier(s) more than once…
  n=2  k2_monthly_cordis  CORDIS worker unreachable: fetch failed
  n=2  k1_daily_calls     K1 sources returned 7 identifier(s) more than once…
```

Bu üç grubun **her satırı düzeltme yürürlüğe girmeden önce** (`createdAt` ≤ 2026-09-08
04:51 UTC ve 2026-09-07) yazılmış. Düzeltme geçmişi geriye dönük birleştirmiyor —
bilerek: mevcut satırları sessizce yutmak, operatörün daha önce gördüğü kayıtları
değiştirmek olurdu. Temizlik ayrı ve açık bir karar (§5).

## 3. Değişen dosyalar

```
src/lib/observability/system-alert.ts                     | 190 ++++++++++++++++++--
src/lib/observability/__tests__/system-alert-dedupe.test.ts | 200 +++++++++++++++++++++
src/app/[locale]/admin/alerts/client.tsx                  |  45 ++++-
src/app/[locale]/admin/alerts/page.tsx                    |   8 +
```

Migration yok, şema değişikliği yok.

## 4. Riskler

- **Kimlik `meta`'yı içerdiği için dedupe kırılgan.** Meta'ya her koşuda değişen bir alan
  koyan bir çağıran (zaman damgası, deneme sayısı, rastgele id) dedupe'u tamamen devre dışı
  bırakır ve eski davranışa döner — sessizce. `recordAlert` çağıran her yeni iş için
  gözden geçirme noktası.
- `SystemAlert`'in **RLS politikası yok** ve `tenantId` taşımıyor; `meta` alanına kiracı
  içeriği yazılmamalı. Bu düzeltme kuralı değiştirmedi, ama `meta`'yı artık kimliğin
  parçası yaptığı için oraya alan eklemenin cazibesi arttı.
- Sayaç `meta` içinde yaşıyor, ayrı bir kolonda değil: `meta` üzerinden sorgulamak
  indekslenmiyor. 16 satırda sorun değil, on binlerde olur.

## 5. Açık sorular

- **Düzeltme öncesi yinelenen 7 satır temizlensin mi?** Geriye dönük birleştirme
  yapılmadı (yukarıda gerekçesi). Operatör onayıyla tek seferlik bir birleştirme
  yazılabilir — ama bu, kimsenin görmediği bir geçmişi değiştirmek demek.
- **`SystemAlert` için saklama politikası hâlâ yok.** Dedupe büyümeyi yavaşlatır,
  durdurmaz. Ayrı bir karar.

## 6. Sonraki adım

- `recordAlert` çağıran işlerin `meta`'larını tarayıp koşum-başına-değişen alan var mı
  diye bakmak (dedupe'u sessizce bozan tek şey bu).
- Saklama/arşivleme politikası kararı.
