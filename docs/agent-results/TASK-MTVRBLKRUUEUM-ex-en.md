# TASK-MTVRBLKRUUEUM — `dedupeKey`'i üretim çağıranlarına bağlamak

**Ajan:** ex-en (Araştırmacı / Explorer) · **Tarih:** 2026-09-10 · **Platform:** macOS (darwin 25.6.0)
**Bağlam:** `docs/agent-results/TASK-MTVFL8IJALB2H-blok-zincir-dev.md` (mekanizma)

## 1. Ne yapıldı

`recordAlert` TASK-MTVFL8IJALB2H'den beri `dedupeKey` alabiliyordu ama hiçbir üretim
çağıranı vermiyordu. Bu kart çağıranları taradı, hangilerinin kimliğinde **koşudan
koşuya değişen ama problemi değiştirmeyen** bir alan taşıdığını ölçtü ve 21 çağırana
kararlı bir anahtar verdi. `src/lib/observability/system-alert.ts` **değiştirilmedi**.

### 1.1 Kartın verdiği zemin düzeltildi

Kart "17 dosyada 39 `recordAlert` çağrısı" diyordu. `grep -rn "recordAlert(" src scripts`
gerçekten 39 üretim çağrısı buluyor — ama bu grep **alarm yazan her yeri bulmuyor**:

- `src/lib/inngest/jobs/k1-daily-calls.ts` (3 yer) `prisma.systemAlert` **doğrudan**
  `.create()` ediyordu. Grep kaçırdı çünkü `prisma.systemAlert` ile `.create({` **ayrı
  satırlarda**; satır-bazlı `grep "systemAlert\.create"` de kaçırıyor.
- `src/lib/adapters/alerts.ts` (`createAdapterAlert` / `reportSchemaDrift`) aynı şekilde
  doğrudan yazıyordu; 3 K1 adaptörü (sedia, eurostars, tubitak) 6 yerden onu çağırıyor.

Yani gerçek zemin **20 dosyada 45 alarm yazma noktası**. Bu iki dosya `recordAlert`'i
tamamen atlıyordu: ne dedup (varsayılan kimlikle bile), ne `SENSITIVE_META_KEYS`
temizliği, ne `RESERVED_META_KEYS` koruması. `system-alert.ts`'in kendi başlığındaki
**"The single writer for operator-visible alerts"** iddiası bugüne kadar doğru değildi.
Ölçülen üretim etkisi: 34 açık alarmın **7'si** (%21) `k1_daily_calls` — tek kaynakta en
büyük yığın ve hiç katlanmıyordu. Bu ikisi `recordAlert`'e bağlandı.

### 1.2 Uygulanan kural

Bir çağıranı ancak şu durumda dönüştürdüm: **bugünkü kimliği, aynı problemin iki
oluşumu arasında değişen bir alan içeriyorsa.** Bu iki şeyi kapsar —
(a) koşu/kayıt başına değişen meta alanları (`projectId`, `briefId`, `documentId`,
`userId`, `month`, `sinceDays`, sayaçlar, listeler), ve
(b) serbest hata metninden kurulan `message` (kimlik `message`'ı da içerdiği için).
Anahtar, **hangi problem** olduğunu söyleyen her şeyi tutar (besleme kaynağı, sağlayıcı,
bağlantı, HTTP kodu, sıralanmış alan kümesi); **hangi oluşum** olduğunu söyleyen hiçbir
şeyi almaz.

### 1.3 Tam envanter (45 nokta / 20 dosya)

**Dönüştürüldü (21):**

| # | Çağıran | Değişen (kimliği bozan) | `dedupeKey` | Tek cümlelik savunma |
|---|---|---|---|---|
| 1 | `cordis-sync.ts:160` | `projectId` | `cordis-sync:record-missing-id-or-title` | Kusur "besleme keyed edilemeyen kayıt taşıyor"; hangi kayıt olduğu her satırda değişir. |
| 2 | `cordis-sync.ts:172` | `projectId` | `cordis-sync:schema-drift:${sorted fields}` | Eşlenmemiş **alan kümesi** problemin ta kendisi; `projectId` yalnız hangi kaydın ilk çarptığını söyler. |
| 3 | `cordis-sync.ts:246` | `projectId` | `cordis-sync:coordinator-without-pic` | Kayıt başına ateşlenir; operatörün ihtiyacı olan sayı `alertRepeatCount`. |
| 4 | `cordis-sync.ts:382` | `projectId` + hata metni | `cordis-sync:record-sync-failed` | Eski kimliğin iki yarısı da oluşum başına oynuyordu. |
| 5 | `cordis-delta.ts:210` | hata metni | `cordis-delta:feed-unreachable:${host}` | Host operatörün eylediği şey ve iki host iki problem; ETIMEDOUT/ENOTFOUND farkı değil. |
| 6 | `cordis-delta.ts:236` | `sinceDays` | `cordis-delta:no-endpoint-configured` | Eksik yapılandırma, koşunun sorduğu pencereden bağımsız tek bir boşluk. |
| 7 | `cordis-delta.ts:264` | `sinceDays`, item sırası | `cordis-delta:item-skipped:${reason}` | `reason` kapalı kümeden gelir ve kusuru adlandırır; item döngüsündeki en geniş yayılım buydu. |
| 8 | `cordis-delta.ts:312` | `projectId` + hata metni | `cordis-delta:item-ingest-failed` | Item başına; iki alan da problemi kendinden ayırmıyor. |
| 9 | `k2-monthly-cordis.ts:62` | `month` | `k2:worker-unreachable:${host}` | Eylülde düşen worker Ekimde aynı arıza; `month` işin koşu kimliği. |
| 10 | `k2-monthly-cordis.ts:93` | `month`, `rawFetch` | `k2:worker-http:${host}:${status}` | 401 düzeltilecek kimlik, 503 beklenecek şey — kod anahtarda. |
| 11 | `k2-monthly-cordis.ts:112` | `month`, `contentType` | `k2:worker-body-not-json:${host}` | text/html ile text/plain hata sayfası aynı kusur; katlanmaları amaç. |
| 12 | `k2-monthly-cordis.ts:131` | `month` | `k2:worker-missing-fields:${sorted}` | Eksik alan kümesi sözleşme değişikliği; ay değil. |
| 13 | `k2-monthly-cordis.ts:147` | `month`, `rowCounts`, detay | `k2:pipeline-failed:${host}` | `rowCounts` yapı gereği her koşuda farklı. |
| 14 | `k1-daily-calls.ts:149` ⚠ | id listesi + sayı | `k1:duplicate-identifiers` | Kusur tek: bir besleme aynı id için iki kez cevap verdi. |
| 15 | `k1-daily-calls.ts:167` ⚠ | `reason` metni | `k1:source-failed:${s.source}` | Bozuk SEDIA, bozuk TÜBİTAK değildir — üç besleme ayrı kalır. |
| 16 | `k1-daily-calls.ts:277` ⚠ | drift sayısı+örneği | `k1:schema-drift` | Sözleşmenin kaymış olması, eşlenip çözülene dek tek bir açık madde. |
| 17 | `adapters/alerts.ts` `reportSchemaDrift` ⚠ | sayı + örnek liste | `${source}:schema-drift` | `source` kolonu zaten adaptörleri ayırıyor; anahtar yalnız "hangi alarm" der. |
| 18-20 | `sedia.ts:421`, `eurostars.ts:150,173`, `tubitak.ts:175,197` ⚠ | `reason` metni | `${source}:fetch-failed` | Aynı ölü uca karşı denemeler arasında yalnız taşıma hatası metni oynuyor. |
| 21 | `calendar/sync.ts:159` | `briefId` + hata metni | `calendar-sync-failed:${conn.id}` | **Fazla-katlama tuzağının tam kaçınıldığı yer:** `CalendarConnection` kiracı kapsamlı, yani iki kiracının süresi dolmuş token'ı iki alarm kalır; tek token ise artık her brief için satır açmaz. |
| 22 | `rag.ts:346` | `documentId`, `cleanupError` | `rag-pdf-ingest:orphan-not-removed` | Kimliğin **her** alanı oluşum başınaydı; hiçbir id kaybolmuyor, bir alt satırdaki `console.error` her birini tek tek adlandırıyor. |
| 23 | `auth.ts:496` | `userId` | `auth-registration-consent:oauth-createUser` | Kayıt yolu düzeltilecek problem; etkilenen hesaplar = `Consent` satırı olmayan `User` satırları, yani sorgu — alarmın taşıması gerekmiyor. |
| 24 | `sso.ts:87` | hata metni | `sso-configure:${providerType}` | Hangi sağlayıcı tipinin kaydedilemediği problem; DB hata metni değil. |
| 25 | `sso.ts:159` | hata metni | `sso-resolve:domain-lookup-failed` | Meta yok — kimliğin tamamı hata metniydi; oturum-açma yolunda, yayılım trafiği takip ediyordu. |
| 26 | `m10/actions.ts:102` | `opportunityId` + hata metni | `m10-doc-generation-failed:${kind}` | Belge türü operatörün ayıkladığı şey; **kiracılar arası katlıyor** (§4'e bakın). |
| 27 | `m10/actions.ts:115` | `opportunityId` | `m10-doc-generation-empty:${kind}` | Aynı gerekçe. |
| 28 | `invoice-writer.ts:500` | `detail` (TCMB tarih metni) | `invoice-fx:${currency}:${reason}` | Para birimi + arıza türü problem; `detail` kurun ulaşılamadığı her gün oynuyor. |
| 29-32 | `partners/page.tsx:115,168`, `person-days:94`, `consortium:134` | hata metni (+ `opportunityId`) | sayfa başına sabit anahtar | Sayfa render'ında ateşlenir: yayılım **arızayı değil trafiği** takip ediyordu; consortium'da `opportunityId` yüzünden her sayfa görüntülemesi ayrı satırdı. |

⚠ = `recordAlert`'i tamamen atlıyordu; bu kartta tek yazara bağlandı.
(Numaralar tablo satırı; toplam dönüştürülen çağrı noktası **21**.)

**Bilerek dokunulmadı (kimliği zaten kararlı — kısıtlama kanıtı):**

| Çağıran | Neden |
|---|---|
| `cordis-delta.ts:188` | `{host, path, status}` sabit, message'da status var → bugün zaten katlanıyor. |
| `cordis-delta.ts:199` | `{host, path, receivedType}` sabit. |
| `invoice-writer.ts:365, 398, 434, 458, 554, 575` | Altısının da meta'sı sabit; `invoice_profile_assumed` ölçülmüş şekilde 231 oluşumu tek satıra katlamıştı. Dosyada yalnız FX çağıranının kimliği oynaktı. |
| `users-scheduled-deletion.ts` `buildPurgeFailureAlert` | **Dönüştürüldü, sonra geri alındı** — §2.3. |

**BAŞKA AJANLARDA — dokunulmadı (kart talimatı):**

| Çağıran | Durum | Ne yapılmalı |
|---|---|---|
| `alerts-daily.ts:245` | blok-zincir-dev | `message` `errorMessage(error)` taşıyor → `alerts-daily:saved-search-fetch-failed`. |
| `alerts-daily.ts:262` | blok-zincir-dev | **En kötü örneklerden biri:** message'da sayılar, meta'da `emailsSent`/`emailsFailed`/`failures[]` — üçü de her koşuda değişir, yani hiç katlanmaz. `alerts-daily:saved-search-delivery-failed` uygun. |
| `feedback/submit.ts:155` | blockzincir-pm | `feedbackId` oluşum başına → `beta-feedback-screenshot:not-stored`. |
| `feedback/submit.ts:168` | blockzincir-pm | **KATLANMAMALI.** Her geri bildirim ayrı bir iş kaydı; buraya `dedupeKey` verilirse gerçek sinyal kaybolur. Dönüştürecek ajan için kritik not. |
| `feedback/submit.ts:202` | blockzincir-pm | `feedbackId` oluşum başına → `beta-feedback:outcome-stamp-failed`. |

## 2. Kanıt

Tüm ölçümler **gerçek Postgres**'e karşı, **gerçek üretim fonksiyonları** çağrılarak
yapıldı (`fetchLiveCordisDelta`, `persistCordisRecord`, `syncK1Topics`,
`runK2MonthlyCordis`, `reportSchemaDrift`, `createAdapterAlert`) — alarm gövdesi elle
yeniden yazılmadı, yani ölçülen şey kodun kendisi. Betikler scratchpad'de tutuldu
(repoya untracked `scripts/*.ts` koymak komşuların lint kapısını kırıyor).

### 2.1 Taban değer

```
BASELINE total=34 open=34
     6  warn  k1_daily_calls        ← DEDUPE_CANDIDATE_LIMIT (5) ÜSTÜNDE
     5  error k2_monthly_cordis     ← limitte
     4  warn  cordis-delta
     4  warn  cordis-sync
     3  warn  k2_monthly_cordis
     3  error invoice_not_issued
     2  error invoice_vat_country_unknown
     2  error cordis-sync
     1  error cordis-delta / k1_daily_calls / invoice_buyer_identity_missing
     1  error m10_document_generation_failed
     1  warn  invoice_profile_assumed
```

### 2.2 Katlama + çürütme sondası — kopyalanmış çıktı

Her çağıran **aynı problemle iki kez**, ama oynak kısmı **kasten farklı** olacak şekilde
tetiklendi (farklı ay, farklı `projectId`, farklı hata metni, ters sıralı alan listesi).
Her çürütme sondası, **gerçekten farklı** bir problemin hâlâ **ayrı** satır açtığını
gösterir — katlamanın fazla geniş olmadığının kanıtı.

```
baseline rows: 34

PASS  cordis-delta no-endpoint (sinceDays 7 then 30)
        key=cordis-delta:no-endpoint-configured
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  cordis-delta feed-unreachable (same host, different path/window)
        key=cordis-delta:feed-unreachable:127.0.0.1:9
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  [refutation] a different host is a different outage
        cordis-delta:feed-unreachable:127.0.0.1:9 -> 1 row
        cordis-delta:feed-unreachable:127.0.0.2:9 -> 1 row
PASS  cordis-sync record-missing-id-or-title (two different bad records)
        key=cordis-sync:record-missing-id-or-title
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  cordis-sync schema-drift (same fields, different projects, reversed order)
        key=cordis-sync:schema-drift:flange,wobble
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  [refutation] a different unmapped field set is a different drift
        cordis-sync:schema-drift:flange,wobble -> 1 row
        cordis-sync:schema-drift:gasket -> 1 row
PASS  k1 duplicate-identifiers (different ids, different count)
        key=k1:duplicate-identifiers
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  k1 schema-drift (different drift lists)
        key=k1:schema-drift
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  k1 source-failed sedia (different reason text)
        key=k1:source-failed:sedia
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  [refutation] a different K1 feed failing is a different problem
        k1:source-failed:sedia -> 1 row
        k1:source-failed:tubitak -> 1 row
PASS  k2 worker-unreachable (two different months)
        key=k2:worker-unreachable:127.0.0.1:9
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  [refutation] a different worker host is a different outage
        k2:worker-unreachable:127.0.0.1:9 -> 1 row
        k2:worker-unreachable:127.0.0.2:9 -> 1 row
PASS  k2 worker-http 503 (two months, different RawFetch outcome)
        key=k2:worker-http:127.0.0.1:61610:503
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  k2 body-not-json (text/html then text/plain)
        key=k2:worker-body-not-json:127.0.0.1:61610
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  k2 worker-missing-fields (same field absent, different rowCounts)
        key=k2:worker-missing-fields:message
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  k2 pipeline-failed (different error text and rowCounts)
        key=k2:pipeline-failed:127.0.0.1:61610
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  sedia adapter schema-drift (different drift lists)
        key=sedia:schema-drift
        rows=1 (expected 1)  repeatCount=2 (expected 2)
PASS  [refutation] a different adapter drifting is a different problem
        sedia:schema-drift -> 1 row
        tubitak:schema-drift -> 1 row
PASS  sedia adapter fetch-failed (different transport errors)
        key=sedia:fetch-failed
        rows=1 (expected 1)  repeatCount=2 (expected 2)

RESULT: 19 passed, 0 failed
```

### 2.3 Karşı-olgu (sonda gerçekten anahtarı mı ölçüyor?)

Sondanın "1 satır" görmesi, anahtar olmasa da olabilecek bir şey olmasın diye
`cordis-sync` schema-drift anahtarı **geçici olarak kaldırıldı**, aynı iki kayıt yeniden
işlendi, sonra dosya geri kondu:

```
───────── A) WITH the dedupeKey (current code)
cordis-sync schema-drift rows opened by two drifted records: 1
   projectId=zzcf-1  dedupeKey=cordis-sync:schema-drift:flange,wobble  repeat=2

───────── B) counterfactual: dedupeKey line disabled
cordis-sync schema-drift rows opened by two drifted records: 2
   projectId=zzcf-1  dedupeKey=(none)  repeat=1
   projectId=zzcf-2  dedupeKey=(none)  repeat=1
```

Fark tek satırlık `dedupeKey`'den geliyor.

### 2.4 `DEDUPE_CANDIDATE_LIMIT` — ölçüldü, tahmin edilmedi

Kart "sınıra yaklaşıyorsan söyle" diyordu. İki ayrı soru var ve cevapları farklı:

**(a) Mevcut eski (anahtarsız) yığın katlamayı engelliyor mu? HAYIR.**
`k1_daily_calls` warn'da zaten **6** açık satır var (limit 5) ve `k2_monthly_cordis`
error'da **5**. Yine de §2.2'de ikisi de `rows=1 repeatCount=2` verdi: anahtarlı satır
en yeni olarak açılır ve `take: 5, orderBy createdAt desc` penceresinde kalır. Eski
yığın satırları daha eskidir, dolayısıyla engellemez.

**(b) Aynı `(level, source)` altında 5 *daha yeni* satır oluşursa? EVET, kaçırıyor.**
Gerçek `persistCordisRecord` ile ölçüldü — hedef alarm açıldı, ardından 5 farklı yeni
drift anahtarı açıldı, sonra ilk problem tekrarlandı:

```
open (warn, cordis-sync) rows at start: 4   [DEDUPE_CANDIDATE_LIMIT = 5]
opened the target alert   key=cordis-sync:schema-drift:alpha
opened 5 newer distinct drift keys

rows for key cordis-sync:schema-drift:alpha -> 2  repeatCount=[1,1]
ESCAPED — the fold was missed: a duplicate row opened
```

Bu **regresyon değil** (önceden zaten her oluşum satır açıyordu), iyileşmenin tavanı.
Ulaşılabilir tek yer, kardinalitesi yüksek anahtar taşıyan kaynak:
`cordis-sync:schema-drift:${alan kümesi}` — 4 eski açık warn satırı + 3 anahtarlı yer
üstüne, üst üste 5 farklı alan kümesi kayarsa. Diğer bütün anahtarlarım sabit ya da
küçük kapalı kümeden. Çözüm mekanizma tarafında (limit ya da anahtar üzerinden sorgu);
bu kart mekanizmaya dokunmuyor, ayrı kart olarak §6'da öneriliyor.

### 2.5 Doğrulama çöpü temizlendi (ayrı, bağımsız sayım)

Sondaların açtığı satırlar **id bazında** silindi; ayrıca ilk (çöken) sonda koşusunun
bıraktığı artıklar ve tam test paketini çalıştırmanın ürettiği `beta-feedback` satırları
temizlendi. Taban değere birebir dönüldü:

```
SystemAlert before=65  keyed-probe-rows deleted=9  beta-feedback test rows deleted=22  after=34
CordisProject zzprobe deleted=0  Topic zzk1 deleted=0  Call ZZPROBE deleted=1
TARGET baseline is 34 -> RESTORED
```

Sonda kendi koşusunun sonunda da temizledi:

```
rows created by this probe: 19
deleted: 19
probe Topic rows deleted: 3, probe Call rows deleted: 1
SystemAlert total now: 34 (baseline was 34)
probe rows still present: 0  (must be 0)
```

Oturum sonu bağımsız tarama:

```
total=34
with alertDedupeKey=0  without=34
zzprobe CordisProject: 0
zzk1 Topic: 0
ZZPROBE Call: 0
```

**Dürüstlük notu:** commit'ten sonraki son kontrolde tablo 34 değil **36** gösterdi.
İki satırın ikisi de `beta-feedback`, `2026-09-10T17:16:23Z` damgalı — benim son
temizliğimden (17:14) ve son test koşumdan **sonra**, bir komşu ajanın test koşusundan
gelmiş. `alertDedupeKey` taşımıyorlar, yani bu kartın ürettiği satırlar değil. Başka
bir ajanın verisini silmedim; bu zaten bilinen ve kayıtlı bir sorun
(`.live.test.ts` dosyaları operatör konsoluna kalıcı satır bırakıyor). Bu kartın kendi
doğrulama çöpü **sıfır**: yukarıdaki taramada `with alertDedupeKey=0`.

### 2.6 Kapılar

```
$ pnpm typecheck        → exit 0
$ pnpm lint             → exit 0
$ pnpm vitest run
   Test Files  157 passed | 2 skipped (159)
        Tests  1858 passed | 8 skipped (1866)
$ pnpm alerts:check
açık SystemAlert satırı            : 34
  tenant'ı SİLİNMİŞ (öksüz)         : 0
✅ Öksüz alarm yok
```

Not: iş sırasında tam paket iki kez kızardı ve **ikisi de komşu ajanların ağacındandı**,
benim değişikliğim değil: (1) `tests/pipeline-surface-tenant-scope.live.test.ts` —
**untracked**, tek başına 5/5 geçiyor, sırayla koşunca RLS ihlali veriyordu;
(2) `tests/modules/ai-module-gate.test.ts` 12 hata — kök neden
`src/lib/modules/access.ts:89`, bir komşunun yarım kalan `prisma` → `withTenant`
göçü (`tx.moduleState` undefined), M2/M7/M10'da **aynı** şekilde patlıyordu, yani
benim dokunduğum M10'a özgü değildi. Yukarıdaki yeşil koşu, komşu göçünü bitirdikten
sonra alındı.

## 3. Değişen dosyalar

```
 src/app/[locale]/(app)/[workspace]/partners/page.tsx                 |  7 +++
 src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx |  6 ++
 src/app/[locale]/(app)/[workspace]/reports/person-days/page.tsx      |  3 +
 src/lib/adapters/alerts.ts                                           | 35 +++++--
 src/lib/adapters/eurostars.ts                                        | 10 +-
 src/lib/adapters/sedia.ts                                            | 10 +-
 src/lib/adapters/tubitak.ts                                          | 10 +-
 src/lib/auth.ts                                                      |  7 +++
 src/lib/billing/invoice-writer.ts                                    |  8 +++
 src/lib/calendar/sync.ts                                             |  6 ++
 src/lib/cordis-delta.ts                                              | 17 ++++
 src/lib/cordis-sync.ts                                               | 19 ++++
 src/lib/inngest/jobs/k1-daily-calls.ts                               | 68 +++++++------
 src/lib/inngest/jobs/k2-monthly-cordis.ts                            | 22 ++++
 src/lib/rag.ts                                                       |  6 ++
 src/lib/sso.ts                                                       |  9 +++
 src/modules/m10/server/actions.ts                                    | 10 ++
 17 files changed, 210 insertions(+), 43 deletions(-)
```

`src/lib/observability/system-alert.ts` **değiştirilmedi** (kart kısıtı).

## 4. Riskler

1. **`m10` kiracılar arası katlıyor.** `m10-doc-generation-failed:${kind}` iki farklı
   kiracının aynı türdeki üretim hatasını tek satırda toplar. Kabul edilebilir sayıyorum
   çünkü alarm zaten `tenantId` taşımıyor (`system-alert.ts` gizlilik kuralı yasaklıyor),
   yani vazgeçilen bir kiracı ayrımı yok — ama bu bilinçli bir seçim, sessiz bir yan etki
   değil. Aksi karar verilirse anahtar `opportunityId`'ye genişletilir ve katlama kaybolur.
2. **Kayıt-başına alarmlarda birey listesi artık N satırda değil.** `cordis-sync` üç
   çağıranında hangi `projectId`'lerin atlandığı yalnız son satırda + koşu çıktısında
   kalıyor (`skippedCount` dönüyor). `rag.ts` ve `auth.ts`'de kayıp yok (biri
   `console.error` ile her id'yi yazıyor, diğeri `Consent` sorgusuyla türetilebilir).
3. **`DEDUPE_CANDIDATE_LIMIT` tavanı** — §2.4(b), ölçülmüş, `cordis-sync` schema-drift
   için gerçek.
4. **Anahtarlı satır ile eski satır birleşmez.** Anahtar verilen bir kaynakta ilk koşu
   yeni bir satır açar; mevcut 34 açık satırın eskileri oldukları yerde kalır ve elle
   (ya da `alerts-sweep` ile) kapanana kadar durur. Beklenen davranış, ama konsolda
   ilk gün kısa bir artış görünecek.
5. Paylaşımlı ağaçta çalışıldı; komşu ajanlar aynı anda `access.ts`, `feedback/submit.ts`
   ve `alerts-daily.ts` üzerinde çalışıyordu. Commit dar tutuldu (§ commit).

## 5. Açık sorular

1. `feedback/submit.ts:168` gerçekten katlanmamalı mı? Benim okumam: her geri bildirim
   ayrı bir iş kaydı, dolayısıyla `dedupeKey` **verilmemeli**. Onu dönüştürecek ajanın
   bunu bilerek atlaması gerekiyor.
2. `cordis-sync` atlanan kayıt id'leri operatör için gerekli mi? Gerekliyse doğru yer
   alarm değil, koşu çıktısı/`RawFetch` — ayrı bir karar.
3. `DEDUPE_CANDIDATE_LIMIT` yükseltilsin mi, yoksa `dedupeKey` varken aday sorgusu
   doğrudan `meta.alertDedupeKey` üzerinden mi yapılsın? İkincisi limiti tamamen
   anlamsızlaştırır ama mekanizma değişikliği.

## 6. Sonraki adım

Önerilen kartlar:

1. **`alerts-daily.ts` + `feedback/submit.ts` çağıranlarını dönüştür** (bu kartta
   dokunulmadı — dosyalar blok-zincir-dev ve blockzincir-pm'deydi). §1.3'teki tabloda
   her biri için anahtar önerisi ve `feedback/submit.ts:168` için "KATLAMA" uyarısı var.
2. **Aday sorgusunu `dedupeKey` üzerinden yap** (`system-alert.ts`): `hasDedupeKey`
   durumunda `meta.alertDedupeKey` ile filtrele, böylece §2.4(b)'deki kaçış kapanır ve
   `DEDUPE_CANDIDATE_LIMIT` bu yol için anlamsızlaşır.
3. **`recordAlert` tek yazar olsun diye kapı kuralı ekle**: `prisma.systemAlert.create`
   (satır sonu kırılmalarını da yakalayan) kullanımını `system-alert.ts` dışında
   yasaklayan bir lint/gate kuralı. Bu kartta iki bypass bulundu; kural olmadan üçüncüsü
   gelir. `.claude/commands/gate-rule` bunun için var.

## 7. Platform beyanı

**macOS (darwin 25.6.0) üzerinde doğrulandı** — gerçek Postgres'e karşı, gerçek üretim
fonksiyonları çağrılarak. **Windows ve Linux koşulmadı** (bu ekipte çalışan tek makine
macOS; ayrıca CI erişimim yok).

Dokunulan kod yolu **platforma bağlı değildir**, koddan gerekçe: değişikliklerin tamamı
`recordAlert` çağrılarına bir string alan (`dedupeKey`) eklemek ve iki dosyada
`prisma.systemAlert.create`'i `recordAlert`'e çevirmekten ibaret. Süreç öldürme, dosya
yolu, kabuk/ikili adı, kısayol metni, ekran/DPI, mikrofon-kamera izni yok. Anahtar
üretiminde kullanılan tek platform-duyarlı olabilecek şey `Array.prototype.sort()` —
karşılaştırıcısız `sort()` UTF-16 kod birimine göre sıralar ve **locale'den bağımsızdır**
(ECMA-262), yani `flange,wobble` her platformda aynı çıkar. Sondadaki `127.0.0.1`
dinleyicisi yalnız doğrulama betiğinde, üretim kodunda değil. Diğer platformlarda
davranış aynıdır.
