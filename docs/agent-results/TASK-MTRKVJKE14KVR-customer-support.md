# TASK-MTRKVJKE14KVR — Hayalet alan: iki halka açık çağrı yüzeyi sahte veri gösteriyordu

**Ajan:** blockzincir-pm · **Sprint:** S12 · **Dalga:** HAYALET ALAN · **Tarih:** 2026-09-07

## 1) Ne yapıldı

Kartın iddiaları doğrulandı ve iki yüzey de gerçek şemaya bağlandı; her ikisindeki **sessiz fallback kaldırıldı**.

### (a) `src/app/[locale]/calls/turkey/page.tsx` — hep boş liste gösteriyordu

Eski sorgu `prisma.call.findMany({ where: { country: 'TR', isOpen: true, deadline: { gt: now } } })`
çağırıyordu. `prisma/schema.prisma` içindeki `model Call` bu üç alanın **hiçbirini** taşımıyor
(`Call`: `id, programmeId, callIdentifier, title, openDate, budgetCents, currency, url`). Sorgu her
render'da fırlıyor, `try/catch` yutuyor ve sayfa veri tabanında ne olursa olsun **"0 aktif çağrı"**
gösteriyordu.

Yapılan:

- Sorgu gerçek yüzeye taşındı: `prisma.topic.findMany({ where: { status: 'OPEN', nextDeadlineAt: { gt: now } } })`,
  `Topic → Call → Programme` ilişkisiyle (`identifier`, `title`, `description`, `nextDeadlineAt`,
  `deadlines`, `budgetPerProjectCents`, `eligibility`, `sourceUrl`, `call.callIdentifier`,
  `call.budgetCents`, `call.url`, `call.programme.name`).
- **Ülke uygunluğu**: şemada çağrı başına ülke kolonu yok; ülke kısıtı `Topic.eligibility`
  JSON'unda (`restricted`, `countriesExcluded`) duruyor. Yeniden yazmak yerine G0 kapısının
  kullandığı `isCountryEligible()` (`src/lib/scoring/g0-features.ts`) **yeniden kullanıldı** —
  Türkiye ortak (associated) ülke olduğu için `EU_EEA_CH_ONLY` kısıtlı çağrılar listeden düşüyor.
- **`try/catch` kaldırıldı.** Veri tabanı erişilemezse sayfa artık sesizce boş liste göstermek
  yerine gürültülü biçimde hata veriyor; "bugün çağrı yok" ile "sorgu bozuk" birbirinden ayrıldı.
- **Uydurma satır yok, `href="#"` yok.** Kayıt yoksa açık boş-durum metni ("örnek kayıt
  gösterilmez"); kaynak URL'i olmayan kartta buton hiç render edilmiyor.
- **CLAUDE.md kural 8:** sayfadaki tüm sabit TR/EN ternary metinleri kaldırıldı; `getTranslations`
  + yeni `calls_turkey` ad alanı, **iki dile de** eklendi (`messages/tr.json`, `messages/en.json`).
- **CLAUDE.md kural 10:** her kart iki okumayı yan yana veriyor — çağrının yayımlandığı resmî saat
  (zone `Topic.deadlines[].tz`'den okunuyor, tahmin edilmiyor) ve ziyaretçinin yerel saati.
  Yerel saat sunucuda bilinemeyeceği için `local-deadline.tsx` istemci bileşeninde
  `useSyncExternalStore` ile hidrasyon-güvenli şekilde render ediliyor; `<time datetime>` UTC
  anını taşıyor.
- **CLAUDE.md kural 9:** tutarlar minor unit; euro'ya çevrim `src/lib/money.ts` `toDecimalString`
  üzerinden, elle `/100` yok.

### (b) `src/app/api/v1/calls/route.ts` — her istekte gömülü demo satırı servis ediyordu

Eski `select` `Topic.topicId / .programme / .deadlineAt / .deadlineTz / .budgetTotalEur / .fundingType`
istiyordu; gerçekte `Topic.id/.identifier`, `Call.programmeId → Programme.name`,
`Topic.nextDeadlineAt`, `Topic.deadlines[].tz`, `Call.budgetCents`,
`Topic.budgetPerProjectCents`, `Topic.typeOfAction` var. Sorgu fırlıyor, `catch` yutuyor ve endpoint
**200 OK** ile dört uydurma çağrı döndürüyordu (€180m "EIC Accelerator", "TÜBİTAK 1707", uydurma
`expectedGrantRangeEur` bantları) — CLAUDE.md kural 7 ihlali.

Yapılan:

- Gömülü demo dizisi **tamamen silindi**. Satırlar `Topic → Call → Programme`'den geliyor,
  `orderBy: nextDeadlineAt asc` (eskiden sıralama yoktu).
- Sorgu hatası artık **500 `CALLS_QUERY_FAILED`** — uydurma 200 değil. (Kardeş `/api/v1/partners`
  rotasının aynı dalgada aldığı biçimle birebir.)
- Yayımlanan alan **adları korundu**; kaynağı değişti. `budgetTotalEur` gerçekten çağrı toplamı
  (`Call.budgetCents`); proje başına gösterge için **`budgetPerProjectEur`** eklendi
  (`Topic.budgetPerProjectCents`). Şemada hibe *bandı* taşıyan kolon olmadığı için
  `expectedGrantRangeEur` anahtar olarak duruyor ama değeri **her zaman `null`** — uydurulmuyor.
- `deadlineTz` `Topic.deadlines` JSON'undan, `nextDeadlineAt` anına eşleşen aşamadan okunuyor;
  kayıt yoksa `null` — "Europe/Brussels" varsayılmıyor (tahmin edilen zone son tarihi bir saat
  kaydırır).
- `programme` filtresi ilişki üzerinden (`call.programme.id` ya da `name contains`); `status`
  Zod ile doğrulanıyor, geçersiz değer **400 `CALLS_INVALID_STATUS`** (sessiz boş liste değil).

## 2) Kanıt

### Public API — gömülü demo satırı artık dönmüyor

Doğrulama için yerel dev DB'sine geçici bir `ApiKey` satırı açıldı ve **iş bitince silindi**
(çıktı aşağıda). Sunucu: `next dev` (localhost:3000, repo kökündeki mevcut süreç).

```
### 1) No key → 401
HTTP/1.1 401 Unauthorized

### 2) GET /api/v1/calls?status=OPEN&limit=3
{
    "success": true,
    "meta": {
        "total": 3,
        "limit": 3,
        "statusFilter": "OPEN",
        "programmeFilter": null,
        "queriedAt": "2026-09-07T18:41:29.805Z",
        "authenticatedTenant": "demo-tenant"
    },
    "data": [
        {
            "id": "cmtrerwvu0011qgxku2kk1341",
            "topicId": "HORIZON-CLUSTER1-2026-01-01",
            "title": "Cluster 1 — Health Bioeconomy",
            "programme": "Horizon Europe",
            "callId": "HORIZON-CLUSTER1-2026-01",
            "deadlineAt": "2026-09-15T17:00:00.000Z",
            "deadlineTz": "Europe/Brussels",
            "budgetTotalEur": 480000,
            "budgetPerProjectEur": null,
            "expectedGrantRangeEur": null,
            "fundingType": "IA",
            "status": "OPEN"
        },
        {
            "id": "cmtrerwvi000tqgxktgz0cf4a",
            "topicId": "HORIZON-MSCA-2026-01-01",
            "title": "Marie Skłodowska-Curie Doctoral Networks",
            "programme": "Horizon Europe",
            "callId": "HORIZON-MSCA-2026-01",
            "deadlineAt": "2026-09-20T17:00:00.000Z",
            "deadlineTz": "Europe/Brussels",
            "budgetTotalEur": 320000,
            "budgetPerProjectEur": null,
            "expectedGrantRangeEur": null,
            "fundingType": "IA",
            "status": "OPEN"
        }
    ]
}
```

> Eski davranışta bu çağrı **her zaman** `HORIZON-CL5-2026-D3-01 / HORIZON-CL4-2026-TWIN-01 /
> EIC-ACC-2026-STEP / TUBITAK-1707-2026` dörtlüsünü döndürüyordu. Yukarıdaki satırların hepsi
> veri tabanındaki gerçek `Topic` kayıtları (cuid'ler DB'den).

```
### 3) status=CLOSED → boş liste, demo satırı DEĞİL
{
    "success": true,
    "meta": { "total": 0, "limit": 20, "statusFilter": "CLOSED",
              "programmeFilter": null, "queriedAt": "2026-09-07T18:41:41.489Z",
              "authenticatedTenant": "demo-tenant" },
    "data": []
}

### 4) bilinmeyen status → 400
{"error":"Bad Request","message":"Unknown status \"PENDING\". Expected one of: OPEN, FORTHCOMING, CLOSED.","code":"CALLS_INVALID_STATUS"}
HTTP 400

### 5) programme=TUBITAK (ilişki üzerinden filtre) → gerçek satırlar
"topicId": "TUBITAK-1509-2026-Q3-01", "programme": "TÜBİTAK",
"callId": "TUBITAK-1509-2026-Q3", "budgetTotalEur": 180000

### 6) tüm yanıtta (limit=50) dört demo topic + dolu expectedGrantRangeEur araması
0 occurrences (grep found none)
```

Geçici anahtarın silinmesi:

```
$ npx tsx .tmp-apikey-del.mjs
deleted {"count":1}
```

### Tarayıcı — TR ve EN, gerçek sayfa

`docs/agent-results/TASK-MTRKVJKE14KVR-screenshots/`

| Dosya | İçerik |
|---|---|
| `calls-turkey-tr.png` | TR, 20 gerçek çağrı kartı |
| `calls-turkey-en.png` | EN, 20 gerçek çağrı kartı |
| `calls-turkey-tr-empty.png` | TR, dürüst boş durum |
| `calls-turkey-en-empty.png` | EN, dürüst boş durum |

Playwright (chromium, `timezoneId: Europe/Istanbul`) çıktısı:

```
--- tr --- status=200 cards=20
h1: Türkiye'ye Açık Horizon Çağrıları
count line: 20 aktif çağrı bulundu
--- en --- status=200 cards=20
h1: Open Horizon Calls for Turkey
count line: 20 open calls found
```

Kart içindeki satırlar (DOM'dan, TR):

```
"Resmî saat (Europe/Brussels)\n15 Eyl 2026 19:00"
"Yerel saatiniz\n15 Eyl 2026 20:00 (Europe/Istanbul)"
"Çağrı\nHORIZON-CLUSTER1-2026-01"
"Çağrı bütçesi\n€480.000"
--- <time> attr --- 2026-09-15T17:00:00.000Z
```

Yani kural 10 üç okumayı da veriyor: UTC (`<time datetime>`), çağrının resmî saati (17:00 UTC →
Brüksel 19:00 CEST) ve ziyaretçinin yerel saati (İstanbul 20:00).

**Uygunluk filtresi gerçekten çalışıyor mu?** 20 topic'in `eligibility`'si geçici olarak
`{restricted: 'EU_EEA_CH_ONLY'}` yapıldı, sayfa yeniden çekildi, sonra **birebir eski hâline
döndürüldü** (`{}` — öncesi/sonrası ölçüldü: `topics: 20 | with non-empty eligibility: 0`):

```
### kısıtlıyken
restricted {"count":20}
--- tr empty state ---   cards: 0
Türkiye'ye Açık Horizon Çağrıları
0 aktif çağrı bulundu
Şu anda Türkiye’ye açık çağrı kaydı yok.
Bu liste yalnızca veri tabanındaki çağrılardan üretilir; örnek kayıt gösterilmez. Çağrı toplama işi çalıştığında burada görünür.

--- en empty state ---   cards: 0
No open calls for Turkey are on record right now.
This list is built only from calls in the database; no sample rows are shown. Entries appear here once the call-harvesting job has run.

### geri alındıktan sonra
restored to {} {"count":20}
topics: 20 | with non-empty eligibility: 0
--- tr --- status=200 cards=20   |   --- en --- status=200 cards=20
```

Türkiye ortak ülke olduğu için `EU_EEA_CH_ONLY` kısıtı 20 → 0 yapıyor: filtre canlı, boş durum
dürüst.

### Kapı: typecheck / lint / test

```
$ npx eslint "src/app/[locale]/calls/turkey/page.tsx" \
             "src/app/[locale]/calls/turkey/local-deadline.tsx" \
             "src/app/api/v1/calls/route.ts"
(çıktı yok — temiz)

$ pnpm typecheck
src/lib/billing/plan-repository.ts(172,14): error TS7006: Parameter 'plan' implicitly has an 'any' type.
src/lib/billing/plan-repository.ts(173,11): error TS7006: Parameter 'plan' implicitly has an 'any' type.
```

> Bu iki hata **benim dosyalarımda değil** — `src/lib/billing/plan-repository.ts`, başka bir kartın
> devam eden admin/billing/plans işine ait. Benim üç dosyamda tip hatası yok. Aşağıda
> "DOKUNMADIĞIM BULGULAR"da adıyla bildirildi.

```
$ npx vitest run
 Test Files  82 passed | 2 skipped (84)
      Tests  904 passed | 8 skipped (912)
```

Yeni test dosyası `tests/api/v1-calls.test.ts` (11 test): alan-alan eşleme, iki aşamalı topic'te
doğru aşamanın zone'u, zone yoksa `null`, bütçe yoksa `null` (0 değil), boş DB → boş liste,
sorgu hatası → 500, geçersiz status → 400, programme filtresinin ilişki üzerinden kurulması ve
kaynak seviyesinde demo satırlarının geri sızmadığının kontrolü.

## 3) Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/app/[locale]/calls/turkey/page.tsx` | Topic tabanlı gerçek sorgu, `isCountryEligible` ile TR uygunluğu, sessiz `try/catch` kaldırıldı, i18n, kural 9/10 |
| `src/app/[locale]/calls/turkey/local-deadline.tsx` | **YENİ** — ziyaretçinin yerel saatini hidrasyon-güvenli render eden istemci bileşeni |
| `src/app/api/v1/calls/route.ts` | Gerçek şemadan okuma, gömülü demo dizisi silindi, 500/400 hata yolları, Zod status doğrulama |
| `messages/tr.json`, `messages/en.json` | **Yalnızca ekleme**: `calls_turkey` ad alanı (13 anahtar, iki dilde birebir) |
| `tests/api/v1-calls.test.ts` | **YENİ** — endpoint için 11 test |
| `tests/api/v1-partners.test.ts` | Tek testin bayat iddiası düzeltildi (aşağıda) |
| `docs/agent-results/TASK-MTRKVJKE14KVR-screenshots/*` | 4 ekran görüntüsü |

**Not — i18n değişikliği başka bir commit'e düştü.** Paylaşılan çalışma ağacında paralel çalışan
başka bir ajan, ben `messages/*.json`'ı stage etmişken `git commit` çalıştırdı; benim 15 satırlık
`calls_turkey` bloğum onun **09c385b `feat(billing): platform plan editor…`** commit'ine karıştı.
İçerik doğru ve `dev`'de duruyor; yalnızca benim commit'imde (**a3bf433**) görünmüyor. Aynı
commit **o ajanın kendi `adminPlans.*` anahtarlarını almadı** — onlar hâlâ çalışma ağacında
commit'siz duruyor, yani 09c385b'deki plan editörü çevirisiz kalır. Kendi kartımın dışında
olduğu için düzeltmedim, sahibine bildiriyorum. (bkz. [[fabrika-concurrent-commit-steals-your-stage]])

`tests/api/v1-partners.test.ts` benim kartımın dosyası değil, ama içindeki
`GET /api/v1/calls returns open Horizon Europe & national calls` testi **benim endpoint'imi** test
ediyordu ve `topic.findMany` mock'u `[]` dönerken `data.length > 0` bekliyordu — yani yalnızca
demo fallback'i sayesinde yeşildi. Fallback gidince kırmızıya dönecekti; testi gerçeğe göre
düzelttim (boş mock → boş liste) ve neden değiştiğini yorumda yazdım. Başka hiçbir satırına
dokunmadım.

## 4) Riskler

- **Yayımlanan API sözleşmesi değişti.** `expectedGrantRangeEur` artık her zaman `null` ve yeni bir
  `budgetPerProjectEur` anahtarı var. Eski değerler zaten uydurma olduğu için bu bir "veri kaybı"
  değil, ama bu alanı okuyan bir tüketici varsa haberdar edilmeli.
- **Sayfa artık gürültülü hata verebilir.** DB erişilemezse `/[locale]/calls/turkey` boş liste
  yerine Next hata sınırına düşer. Bu bilinçli: sessiz boş liste tam olarak bu görevin düzelttiği
  yanlıştı. Halka açık bir sayfa olduğu için, istenirse ayrı bir `error.tsx` ile nazik bir hata
  ekranı eklenebilir (kapsam dışı bıraktım).
- **Seed verisi mütevazı.** `prisma/seed-calls.ts` çağrı bütçelerini €500.000 mertebesinde yazıyor;
  ekranda görülen €480.000 doğru dönüşümdür (kolon cent). Gerçek Horizon çağrı bütçeleri çok daha
  büyüktür — üretim verisi geldiğinde rakamlar değişecek.
- **`ApiKey` seed'i yok.** `src/lib/api-auth.ts` yorumu "seed'in yazdığı gerçek bir ApiKey satırı"
  diyor ama `prisma/seed.ts` böyle bir satır üretmiyor; doğrulamayı geçici bir satırla yaptım ve
  sildim. Bir sonraki entegrasyon testi aynı işi tekrar yapmak zorunda kalacak.

## 5) Açık sorular

1. `/api/v1/calls` tüketicisi var mı? Varsa `expectedGrantRangeEur: null` ve yeni
   `budgetPerProjectEur` için sürüm notu gerekir mi, yoksa endpoint hâlâ yayına girmemiş mi?
2. "Türkiye'ye açık" tanımı yalnızca `eligibility` kısıtı mı olmalı, yoksa `Topic.eligibility.notes`
   içindeki serbest metin de mi değerlendirilmeli? Bugün yalnızca yapısal alanlar okunuyor.
3. Halka açık sayfada DB hatası nasıl görünmeli — Next varsayılan hata ekranı mı, özel `error.tsx`
   mi? (Ürün kararı.)

## 6) Sonraki adım

- `prisma/seed.ts` içine gerçek bir `ApiKey` satırı ekleyip `api-auth.ts` yorumunu doğru hale
  getirmek (küçük, ayrı görev).
- `src/modules/m8/server/schema-contract.test.ts` içindeki `SCANNED` listesine
  `src/app/api/v1/calls` ve `src/app/[locale]/calls` eklemek — alan seviyesindeki koruma bu iki
  yüzeyi henüz kapsamıyor (dosya benim kartımda değil, bu yüzden dokunmadım).

---

## DOKUNMADIĞIM BULGULAR

Yolun üstünde görülüp **kartıma girmediği için düzeltilmeyen** kusurlar:

1. **`src/lib/billing/plan-repository.ts:172` ve `:173` — `pnpm typecheck` kırmızı.**
   `error TS7006: Parameter 'plan' implicitly has an 'any' type.` Devam eden admin/billing/plans
   işine ait; kapı bu iki hata yüzünden şu an temiz değil.

2. **`prisma/seed-calls.ts:258` — TÜBİTAK çağrılarının son tarih zone'u yanlış.**
   Satır tüm çağrılara `tz: 'Europe/Brussels'` yazıyor, TÜBİTAK olanlar dahil. Gerçek adaptör
   `src/lib/adapters/tubitak.ts:133` doğru şekilde `tz: 'Europe/Istanbul'` üretiyor. Sonuç: seed'li
   ortamda API ve sayfa `TUBITAK-1509-2026-Q3-01` için "Europe/Brussels" gösteriyor — kod doğru,
   veri yanlış. (Kanıt: yukarıdaki curl #5.)

3. **`src/components/CookieConsent` — her sayfada hidrasyon uyuşmazlığı.**
   `Hydration failed because the server rendered HTML didn't match the client` + `Encountered a
   script tag while rendering React component`. Benim değişikliğimden gelmediğini, dokunmadığım
   `/tr/calls/germany` sayfasında birebir aynı hatayı üreterek doğruladım:
   ```
   /tr/calls/germany => Encountered a script tag ... || pageerror: Error: Hydration failed ...
   /tr/calls/turkey  => Encountered a script tag ... || pageerror: Error: Hydration failed ...
   ```

4. **`/tr` ana sayfası — 500 + geçersiz `next/image` kaynağı.**
   ```
   /tr => Failed to load resource: the server responded with a status of 500 ...
       || pageerror: Error: Invalid src prop (https://images.unsplash.com/photo-15220718200...)
   ```
   `next.config.ts` dosyasında hiç `images` bloğu yok (ne `remotePatterns` ne `domains`),
   bu yüzden uzak hiçbir kaynak `next/image` için geçerli değil.

5. **`scripts/i18n-check.ts:83` — denetleyici `getTranslations`'ı görmüyor.**
   Anahtar çıkarıcı yalnızca `content.includes('useTranslations')` olan dosyaları tarıyor, yani
   sunucu bileşenlerindeki `getTranslations(...)` çağrılarının hiçbiri sayılmıyor. Sonuç: gerçekte
   kullanılan anahtarlar "kullanılmıyor" olarak raporlanıyor (bugün 510 tane) ve sunucu
   bileşenlerindeki eksik bir çeviri hiç yakalanmıyor. Kendi `calls_turkey.*` anahtarlarımın iki
   dilde de var olduğunu doğrudan JSON'dan doğruladım (`missingInTurkish` / `missingInEnglish`
   listelerinde yoklar; ikisinde de 13 anahtar).

6. **`src/modules/m8/server/schema-contract.test.ts:43-50` — `SCANNED` eksik.**
   Alan seviyesindeki hayalet-alan koruması yalnızca M8 yüzeylerini ve `src/app/api/v1/partners`'ı
   kapsıyor. `src/app/api/v1/calls` ve `src/app/[locale]/calls` listede olsaydı bu görevdeki her iki
   hata da derleme zamanında yakalanırdı. (Repo geneli tarama yalnızca *model* adlarını kontrol
   ediyor, kolon adlarını değil.)
