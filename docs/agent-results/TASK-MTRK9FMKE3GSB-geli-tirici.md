# TASK-MTRK9FMKE3GSB — `prisma.organization` çağrıları gerçek CORDIS tablolarına taşındı

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi) · **Dalga:** 3 · **Tarih:** 2026-09-07
**Kapsam:** `src/lib/cordis-sync.ts`, `src/lib/cordis-delta.ts` + testleri

---

## 1. Ne yapıldı

### (a) Bu yollar gerçekten çağrılıyor mu? — ÖLÇÜLDÜ: **EVET, ölü kod değil**

Çağrı zinciri (grep ile tüm repo tarandı, `node_modules`/`.next` hariç):

| Giriş noktası | Zincir | Durum |
|---|---|---|
| `syncCordisBigData()` | `admin/cordis/client.tsx:145` (buton) → `actions.ts:63 handleRunCordisSync` → `cordis-sync.ts` | **CANLI** |
| `aggregateCordisMetrics()` | `admin/cordis/page.tsx:13` (SSR, her sayfa açılışında) | **CANLI** |
| `fetchLiveCordisDelta()` | `admin/cordis/client.tsx:157` (buton) → `actions.ts:71 handleRunCordisLiveDelta` | **CANLI** |
| `getCordisLiveStreamLogs()` | yalnız `actions.ts:75`; `client.tsx` bu action'ı import etmiyor | **ULAŞILAMAZ** (bkz. Açık sorular) |

Yani `prisma.organization.upsert` ölü kodda değildi: `/admin/cordis` ekranındaki iki butonun tam ortasındaydı.

### Çalışma zamanında kanıtlanan asıl kusur

`prisma generate` kurulumun parçası olmadığı için elle yazılmış `src/types/prisma-override.d.ts`
her delegate'i `any` yapıyor; `pnpm typecheck` bu yüzden çağrıyı GÖRMÜYORDU. Gerçek istemci
üretilip sorulduğunda:

```
DB OK. CordisProject=20 CordisOrganization=0 CordisParticipation=0
prisma.organization is: undefined
prisma.organization.count() THROWS: TypeError: Cannot read properties of undefined (reading 'count')
```

Şemada `model Organization` yok (`grep '^model.*[Oo]rgani' prisma/schema.prisma` → yalnız
`CordisOrganization`). Kritik ikinci bulgu: `catch` bloğu bu TypeError'ı yutuyor **ve
`syncedCount++` yapmaya devam ediyordu** (eski `cordis-sync.ts:87-90`). Sonuç: ekran
"3 proje senkronlandı" yazarken tabloya **sıfır satır** yazılıyordu. Uydurma başarı raporu.

### (b) Gerçek CORDIS tablolarına çevrildi + idempotan

Yazma artık tek bir yerden, `persistCordisRecord()` üzerinden geçiyor ve her yazma tablonun
kendi doğal anahtarına `upsert` ediyor — yani iki kez koşmak tek satır bırakıyor:

| Tablo | Anahtar |
|---|---|
| `CordisProject` | `id` |
| `CordisOrganization` | `organisationId` (PIC) |
| `CordisParticipation` | `(projectId, organisationId)` |
| `CordisProjectTopic` | `(projectId, topicCode)` |

Desen `src/lib/k2-cordis/importer.ts`'ten yeniden kullanıldı (icat edilmedi).

**Uydurma veri temizliği (aynı dosyalarda, aynı sınıf):** iki dosyadaki gömülü sahte veri
kaldırıldı, çünkü (b) bunları GERÇEK tablolara yazacaktı — M8 partner aramasının okuduğu
tablolara sahte satır basmak, çökmekten daha kötüydü:

- `cordis-sync.ts`: uydurma 3 proje (`rcn-248101…`) → kaldırıldı; argümansız çağrı artık
  **zaten içeri alınmış gerçek satırları** okuyup RAG'a yansıtıyor, veri uydurmuyor.
- `cordis-sync.ts`: `aggregateCordisMetrics` sabitleri (185 420 proje, €14.25 milyar, sabit
  4 ülkelik tablo) → gerçek `count`/`aggregate`/`GROUP BY` sorguları (CLAUDE.md #7).
- `cordis-delta.ts`: API başarısız olunca devreye giren 2 uydurma proje → kaldırıldı; ulaşılamayan
  besleme artık **0 sonuç + SystemAlert** veriyor.
- `cordis-delta.ts`: `getCordisLiveStreamLogs` sabit 2 sahte log → gerçek `CordisImportRun` satırları.

### (c) CLAUDE.md #6 — iş kırılmıyor, `SystemAlert` üretiliyor

`src/lib/observability/system-alert.ts` içindeki mevcut `recordAlert()` yeniden kullanıldı
(yeni yazar eklenmedi). Alert üretilen durumlar: eşlenmeyen alan (drift), `projectId`/`title`
eksik, PIC'siz koordinatör, besleme ulaşılamıyor / JSON dizi değil / HTTP != 2xx, kayıt bazlı hata.
Hiçbiri koşuyu kırmıyor. Bilinmeyen alanlar `CordisProject.rawJson`'da **korunuyor**
(`mapProjectRow`'un bilinmeyen CSV sütunları için yaptığının aynısı), atılmıyor.

Ayrıca sayaç düzeltildi: başarısız kayıt artık `skippedCount`'a gidiyor, `syncedProjectsCount`'a değil.

### (d) `RawFetch` yazılıyor mu? — ÖLÇÜLDÜ: **HAYIR** (bu kartta düzeltilmedi, bildiriliyor)

```
RawFetch rows: 0 | source=CORDIS*: 0
```

`grep -n "RawFetch\|rawFetch" src/lib/k2-cordis/importer.ts` → eşleşme yok. Hiçbir CORDIS yolu
(ne toplu CSV içe aktarıcı, ne delta) ham yanıtı `RawFetch`'e yazmıyor. CLAUDE.md #6 ihlali,
ayrı kart konusu — karttaki talimat gereği burada DÜZELTİLMEDİ.

### (e) Birim testler

Eski testler bu hatanın hayatta kalma sebebiydi: `prisma.organization.upsert`'i **mock'luyorlardı** —
gerçek istemcide var olmayan bir delegate'i — ve yeşil geçiyorlardı. Ayrıca
`expect(metrics.totalProjectsCount).toBeGreaterThan(100000)` ile uydurma sabiti doğruluyorlardı.

Yerine `tests/helpers/cordis-prisma-stub.ts` yazıldı: her tabloyu **gerçek birincil anahtarıyla**
tutan, `upsert`'ü gerçek upsert semantiğiyle uygulayan bellek-içi stub. Yalnız şemada gerçekten
olan delegate'leri açıyor — `stub.prisma.organization` `undefined`, ve iki test bunu doğruluyor.

---

## 2. Kanıt

### 2.1 Gerçek veritabanına karşı elle tetikleme — önce/sonra satır sayımı

`localhost/fabrika` (dev) üzerinde, gerçek modüller import edilerek koşuldu:

```
BEFORE            {"projects":20,"orgs":0,"parts":0,"topics":20,"cordisAlerts":0}
RUN 1 result      {"success":true,"source":"input","syncedProjectsCount":1,"skippedCount":0,"totalEcContributionEUR":1000000}
AFTER RUN 1       {"projects":21,"orgs":1,"parts":1,"topics":21,"cordisAlerts":0}
RUN 2 result      {"success":true,"source":"input","syncedProjectsCount":1,"skippedCount":0,"totalEcContributionEUR":1000000}
AFTER RUN 2       {"projects":21,"orgs":1,"parts":1,"topics":21,"cordisAlerts":0} <- unchanged = idempotent
```

**İki kez koşma kanıtı:** RUN 1 dört tabloya birer satır yazdı; RUN 2 aynı kaydı tekrar yazdı ve
sayımlar DEĞİŞMEDİ. (Eski kodda bu sayımların hepsi 0'da kalır, ama sonuç yine "senkronlandı" derdi.)

### 2.2 Şema sapması işi kırmıyor, SystemAlert yazılıyor (CLAUDE.md #6)

```
RUN 3 (drift)     {"success":true,"source":"input","syncedProjectsCount":1,"skippedCount":0,...}
  rawJson kept    {"aBrandNewUpstreamColumn":"drift"}
  SystemAlert     {"level":"warn","message":"CORDIS record carried fields this importer does not map",
                   "meta":{"projectId":"PROBE-TASK-MTRK9FMKE3GSB","unknownFields":["aBrandNewUpstreamColumn"]}}
AFTER RUN 3       {"projects":21,"orgs":1,"parts":1,"topics":21,"cordisAlerts":1} <- still unchanged
```

### 2.3 Delta beslemesi: uydurma yok, alert var

Eski kodun gömdüğü URL ölçüldü — **HTTP 404** (301 ile `commission.europa.eu`'ya yönleniyor):

```
$ curl -sL -o /dev/null -w "%{http_code} %{url_effective}" ".../cordis/projects_delta.json?since=..."
404 https://commission.europa.eu/funding-tenders/opportunities/data/cordis/projects_delta.json
```

Yeni davranış:

```
DELTA no-endpoint {"success":false,"deltaCount":0,"skippedCount":0,"ingestedProjects":[],...}
DELTA old-url     {"success":false,"deltaCount":0,"skippedCount":0,"ingestedProjects":[],...}
  SystemAlert     {"level":"warn","message":"CORDIS delta feed returned HTTP 404",
                   "meta":{"host":"ec.europa.eu","path":"/info/.../projects_delta.json","status":404}}
```

Eskiden bu durum 2 uydurma proje "içeri alındı" diye raporlanıyordu.

### 2.4 Gerçek metrikler (CLAUDE.md #7)

```
METRICS (real)    {"totalProjectsCount":21,"totalEcContributionEUR":1000000,
                   "topCountriesBreakdown":[{"country":"TR","name":"Türkiye","projectCount":1,"totalGrantEUR":1000000}],
                   "averageGrantPerProjectEUR":47619,"lastSyncTimestamp":"2026-09-07T18:25:24.646Z"}
STREAM LOGS       []
```

Rakamlar yazılan satırları takip ediyor. `STREAM LOGS []` doğru cevap: `CordisImportRun` boş.

**Temizlik:** Probe'un yazdığı satırlar silindi, sayımlar başlangıca döndü:
```
AFTER CLEANUP     {"projects":20,"orgs":0,"parts":0,"topics":20}
```
Probe projesine atıf yapan 1 dangling SystemAlert de silindi. Delta beslemesine dair 2 alert
(besleme yok / HTTP 404) bilerek BIRAKILDI — gerçek bir operatör sinyali.

### 2.5 Testler

```
$ pnpm vitest run tests/cordis-rag.test.ts tests/cordis-delta.test.ts
 Test Files  2 passed (2)
      Tests  19 passed (19)
```

İki test, kendi kodumdaki gerçek hatayı yakaladı ve test gevşetilerek değil, **kod düzeltilerek**
geçirildi:
1. `readDeltaItem` bilinmeyen alanları tipli nesneye çevirirken sessizce düşürüyordu → drift
   `extra` olarak taşınıp `persistCordisRecord`'a veriliyor (CLAUDE.md #6 delta yolunda da geçerli).
2. `success: skippedCount === 0` → besleme 404 verdiğinde `success:true` dönüyordu. `reached`
   bayrağı eklendi: `success: reached && skippedCount === 0`.

### 2.6 Kapı (`pnpm gate`)

| Aşama | Sonuç |
|---|---|
| `pnpm typecheck` | ✅ **exit 0, tüm repoda sıfır hata** |
| `pnpm test` | ✅ `78 passed \| 2 skipped (80)` dosya, `875 passed \| 8 skipped (883)` test |
| `pnpm rls:check` | ✅ `All 41 tenant-scoped models have RLS policies registered.` |
| `pnpm rls:verify` | ✅ `Veritabanı 41 kiracıya özel tablonun tamamında izolasyonu uyguluyor.` |
| `pnpm lint` | ❌ `2 errors, 84 warnings` — **ikisi de benim dosyalarımda DEĞİL** (aşağı bkz.) |

Lint'i düşüren tek şey başka bir ajanın izlenmeyen (`??`) dosyası:

```
/Users/macbook/AgentSpace/fabrika/src/lib/billing/plan-repository.ts
  169:20  error  Unexpected any. Specify a different type   @typescript-eslint/no-explicit-any
  170:17  error  Unexpected any. Specify a different type   @typescript-eslint/no-explicit-any
```

Kendi dosyalarımda lint problemi yok:
```
$ pnpm lint 2>&1 | grep -E "cordis-sync|cordis-delta|cordis-prisma-stub|cordis-rag"
✅ no lint problems in my files
```

**Baseline dürüstlüğü:** İşe başlarken `pnpm typecheck` **15 hata** veriyordu, hepsi
`src/app/api/v1/partners/[pic]/route.ts` içinde (DOKUNMA listemdeki dosya). Bunu `git stash`
kullanmadan, yalnız KENDİ iki dosyamı geçici olarak HEAD'e döndürüp ölçtüm. Aynı yöntemle
`tests/api/v1-partners.test.ts` hatasının da benden bağımsız olduğunu doğruladım (dosyalarım
HEAD'deyken de aynı şekilde düşüyordu). Çalışma sırasında paralel bir ajan o dosyaları
düzeltti; şu anki `typecheck` ve `test` temizliği kısmen onların işidir, hepsini kendime
yazmıyorum.

---

## 3. Değişen dosyalar

| Dosya | Durum | Değişim |
|---|---|---|
| `src/lib/cordis-sync.ts` | M | +513/-… — gerçek tablolara idempotan yazma, uydurma veri ve sabit metrikler kaldırıldı |
| `src/lib/cordis-delta.ts` | M | +426/-… — `persistCordisRecord` yeniden kullanımı, uydurma fallback kaldırıldı, gerçek audit trail |
| `tests/cordis-rag.test.ts` | M | 11 test — idempotency, drift, skip, gerçek metrikler |
| `tests/cordis-delta.test.ts` | M | 8 test — idempotency, drift, 404, endpoint yok |
| `tests/helpers/cordis-prisma-stub.ts` | **yeni** | 208 satır — PK'ya göre anahtarlanan, gerçek upsert semantiği olan bellek-içi stub |

Toplam: 4 değişen dosya (+1072/-226) + 1 yeni yardımcı.
`prisma/schema.prisma` ve `src/app/api/v1/partners/**` dosyalarına **dokunulmadı** (talimat gereği).

---

## 4. Riskler

1. **`/admin/cordis` "Delta" butonu artık her zaman 0 döndürür.** Bilinçli: gerçek bir üst
   besleme yok (404). Eskiden 0 değil, 2 *uydurma* proje döndürüyordu ve hiçbirini yazmıyordu.
   Sıfır + alert, sahte ikiden daha doğru — ama ekranda gözle görülür bir davranış değişikliği.
2. **`CordisProjectRecord` ve `LiveCordisDeltaItem` arayüzleri değişti** (`projectId`,
   `coordinatorPic` eklendi). Repo dışı tüketici yok — grep ile doğrulandı — ama bu tipleri
   import eden yeni kod varsa uyarlanmalı.
3. **`getCordisLiveStreamLogs` dönüş şeklinden `totalGrantEUR` çıkarıldı.** `CordisImportRun`
   koşu başına hibe toplamı tutmuyor; uydurmak yerine alan kaldırıldı. Okuyan tüketici yok.
4. **`prisma generate` çalıştırdım** (yalnız `node_modules` altına yazar, commit edilmez).
   Typecheck sonucunu değiştirmediğini doğruladım: `prisma-override.d.ts` ambient bildirimi
   hâlâ kazanıyor — HEAD baseline'ında `prisma.organization.upsert` yine sıfır hata veriyordu.

---

## 5. Açık sorular (kapsamım dışı — DÜZELTMEDİM, bildiriyorum)

1. **`RawFetch` hiçbir CORDIS yolunda yazılmıyor** — `src/lib/k2-cordis/importer.ts` (tüm dosya),
   `src/lib/cordis-delta.ts:180` civarı. DB'de 0 satır. CLAUDE.md #6 ham yanıtın kaydedilmesini
   istiyor. Karttaki (d) talimatı gereği düzeltilmedi; ayrı kart gerek.
2. **Ölü server action'lar** — `src/app/[locale]/admin/cordis/actions.ts:67` (`handleGetCordisMetrics`)
   ve `:75` (`handleGetCordisDeltaLogs`). `client.tsx:20` bu ikisini import etmiyor, başka çağıran
   da yok. Silinmeleri gerekir; `actions.ts` kapsamım dışında olduğu için dokunmadım
   (`getCordisLiveStreamLogs`'u da bu yüzden silmeyip dürüst hale getirdim).
3. **Lint kapısı `src/lib/billing/plan-repository.ts:169-170` yüzünden kırmızı** — iki
   `@typescript-eslint/no-explicit-any` hatası. İzlenmeyen dosya, başka bir ajanın işi.
   Bu düzelmeden `pnpm gate` yeşile dönmez.
4. **CORDIS RAG belgeleri `tenantId` olmadan yazılıyor** — `src/lib/rag.ts:97` üzerinden
   `Document.tenantId = null`. Halka açık EU verisi için muhtemelen kasıtlı, ama `Document`
   RLS listesinde olmadığı için doğrulamaya değer. Mevcut davranış, benim değişikliğim değil.
5. **`/admin/cordis` için gerçek delta beslemesi var mı?** CORDIS'in resmî yayını toplu CSV
   paketi (importer bunu zaten kullanıyor). Delta özelliğinin gerçek bir üst kaynağı yoksa,
   `cordis-delta.ts` + butonu tamamen kaldırmak doğru olabilir — ürün kararı, benim kararım değil.

---

## 6. Sonraki adım

1. Lead: madde 5.5'e karar versin — delta beslemesine gerçek bir kaynak mı bağlanacak
   (`fetchLiveCordisDelta` artık `{ endpoint }` parametresi alıyor, hazır), yoksa özellik mi kalkacak.
2. `RawFetch` kartı açılsın (madde 5.1) — CORDIS ham yanıtları hiç saklanmıyor.
3. `actions.ts` sahibinin kartına iki ölü action'ın silinmesi eklensin (madde 5.2).
4. Asıl sistemik iş: `prisma generate`'in kuruluma/kapıya alınması ve
   `src/types/prisma-override.d.ts`'in emekliye ayrılması. Bu kart o sınıfın iki dosyasını
   kapattı; `any` delegate'ler durdukça sınıf açık kalır.
