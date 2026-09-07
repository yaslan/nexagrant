# TASK-MTRK8YPNJDCIT — Public partner API bound to real CORDIS tables

**Ajan:** blok-zincir-dse (Tasarımcı) · **Tip:** bug (P0) · **Dalga:** 3 · **Branch:** `dev`
**Kapsam:** `src/app/api/v1/partners/**`, `src/types/db-rows.ts`, `src/modules/m8/server/*.test.ts`
(+ `tests/api/v1-partners.test.ts` — gerekçesi §4'te)

---

## 1. Ne yapıldı

### 1.1 Bugünkü hata: 500 değil, **YALAN**

Kart "public API çalışmıyor" diyordu. Ölçtüğümde semptom beklenenden ağır çıktı: uç noktalar
**500 dönmüyor, 200 OK ile uydurma veri servis ediyor.**

`prisma.organization` şemada yok → delegate `undefined` → çağrı `TypeError` fırlatıyor →
rotadaki `try/catch` bunu yutup sabit kodlanmış "demo" diziye düşüyor. Sonuç: yeşil build,
200 OK, ve **hiç koşmamış bir sorgunun** yerine geçen uydurma rakamlar.

Detay uç noktası daha kötüydü: **herhangi bir PIC dizesi** için bir kurum uyduruyordu
(ad, ülke, 142 proje, €54,2M, 2 proje, 3 "co-author") — var olmayan bir kurum ile
gerçek bir kurum ayırt edilemiyordu.

Bu, takım hafızasındaki `fabrika-fabricated-fallback-antipattern` notunun
"ailenin en ağırı" diye işaretlediği tam olarak bu dosya.

### 1.2 Yapılan değişiklik

| Dosya | Değişiklik |
|---|---|
| `src/app/api/v1/partners/route.ts` | `prisma.organization.findMany` → `prisma.cordisOrganization.findMany` + ilişkili `CordisPartnerProfile`. Uydurma demo dizisi kaldırıldı: veri yoksa `data: []`. Sorgu patlarsa 500 + `PARTNERS_QUERY_FAILED` (sessizce uydurmak yerine). |
| `src/app/api/v1/partners/[pic]/route.ts` | `prisma.organization.findUnique` → CORDIS grafiği (`CordisOrganization`, `CordisParticipation`, `CordisProject`, `CordisProjectTopic`, `CordisCoParticipation`, `CordisPartnerProfile`). İki farklı gövde şekli veren **union kaldırıldı** — tek sözleşme. Bilinmeyen PIC → gerçek **HTTP 404**. |
| `src/types/db-rows.ts` | Şemada olmayan modelleri tipleyen 7 ölü arayüz silindi (`LegacyOrganizationRow`, `LegacyParticipationRow`, `LegacyCollabRow`, `LegacyOrgTopicStatRow`, `LegacyOrganizationWithParticipations`, `ConsortiumSeatWithOrg`, `SeatCandidateWithOrg`). Delegate'ler `any` olduğu için hayali bir modeli tiplemek çağrıyı "kontrol edilmiş" gösteriyordu. |
| `src/modules/m8/server/schema-contract.test.ts` | Kartın kalıcı değeri — §3. |
| `tests/api/v1-partners.test.ts` | Bu rotaları test eden mevcut dosya; mock'u hayali `organization` modeliydi. §4. |

---

## 2. Alan eşlemesi (API alan adları DEĞİŞMEDİ)

### `GET /api/v1/partners` — liste

| API alanı | CORDIS kaynağı | Not |
|---|---|---|
| `id` | `CordisOrganization.organisationId` | PIC ile aynı |
| `pic` | `CordisOrganization.organisationId` | |
| `name` | `shortName ?? name` | CORDIS'te `shortName` ticari kısa ad |
| `legalName` | `name` | CORDIS'te `name` tescilli hukuki ad |
| `country` | `country` | |
| `orgType` | `activityType` | HES/REC/PRC/PUB/OTH |
| `isSme` | `sme` | |
| `city` | `city` | |
| `stats.projectCount` | `CordisPartnerProfile.totalProjects` | profil yoksa `null` |
| `stats.coordinatorCount` | `CordisPartnerProfile.coordinatorProjects` | profil yoksa `null` |
| `stats.totalEuContributionEur` | `Number(CordisPartnerProfile.totalEcContribution)` | BigInt → Number |
| `stats.networkCentralityScore` | **KAYNAK YOK** | Her zaman `null`. Anahtar duruyor (şekil bozulmasın), değer uydurulmuyor — CLAUDE.md #7. |

Filtre eşlemesi: `?country=` → `country` · `?orgType=` → `activityType` · `?q=` → `name` /
`nameNormalized` / `organisationId` (contains, insensitive) · `?limit=` → `take` (1–50).

### `GET /api/v1/partners/[pic]` — detay

| API alanı | CORDIS kaynağı | Not |
|---|---|---|
| `pic` | `organisationId` | |
| `name` | `CordisOrganization.name` | detayda tam hukuki ad |
| `country` / `city` / `isSme` | `country` / `city` / `sme` | |
| `orgType` | `activityType` | |
| `metrics.totalProjects` | `profile.totalProjects` → yoksa katılım sayısı | |
| `metrics.coordinatorRoles` | `profile.coordinatorProjects` → yoksa `role='coordinator'` sayısı | |
| `metrics.totalFundingEur` | `profile.totalEcContribution` → yoksa `Σ ecContribution` | |
| `metrics.averageTeamSize` | `CordisParticipation` `groupBy(projectId)` ortalaması | **ölçülen** değer; katılım yoksa `null` |
| `metrics.preferredPillars` | `profile.topTopics` → yoksa `CordisProjectTopic` `groupBy(topicCode)` ilk 3 | |
| `recentProjects[].projectAcronym` | `CordisProject.acronym` | |
| `recentProjects[].projectTitle` | `CordisProject.title` | |
| `recentProjects[].programme` | `CordisProject.masterCall ?? framework` | |
| `recentProjects[].role` | `CordisParticipation.role` | CORDIS ham değeri (`coordinator`/`participant`) |
| `recentProjects[].grantAmountEur` | `Number(ecContribution)` | kayıt yoksa `null` |
| `recentProjects[].startDate` | `CordisProject.startDate` → `YYYY-MM-DD` | |
| `recentProjects[].status` | `CordisProject.status` | |
| `networkHub.topCoAuthors` | `profile.topPartners` → yoksa `CordisCoParticipation` (her iki yön) + ad çözümü | |
| `networkHub.cooperationIndex` | **KAYNAK YOK** | Her zaman `null`. |

**Tek davranış değişikliği (bilinçli):** bilinmeyen PIC artık uydurma kurum yerine
`404 / PARTNER_NOT_FOUND`. Alan adları değişmedi; değişen, kayıt yokken ne döndüğü.

---

## 3. Kartın kalıcı değeri: şemada olmayan modele yapılan çağrı artık testte yakalanıyor

`src/modules/m8/server/schema-contract.test.ts` iki güvenceye çıkarıldı:

1. **Alan düzeyi** (mevcut, `SCANNED` listesi) — model + ilişki + **kolon** adları.
   Listeye `src/app/api/v1/partners` eklendi.
2. **Depo geneli tarama** (YENİ) — `src/` altındaki hiçbir dosya, `prisma/schema.prisma`'da
   olmayan bir modeli çağıramaz. `KNOWN_UNKNOWN_MODEL_CALLS` defteri **boş** ve boş kalması
   amaçlanıyor; yalnızca KÜÇÜLEBİLİR (düzeltilmiş kayıt "sil" diye fail eder, listede
   olmayan yeni bir çağrı fail eder).

Ayrıca iki gerçek tarayıcı hatası düzeltildi:
- Yorum satırları artık kod sayılmıyor (`stripComments`) — aksi halde bir modeli *anlatan*
  doküman yorumu "çağrı" diye raporlanıyordu.
- `g` bayraklı regex dosyalar arasında `lastIndex` taşıyordu; uzun bir dosyadan sonraki kısa
  dosya **hiç taranmıyordu**. Bu yüzden regex artık dosya başına kuruluyor.

---

## 4. Kapsam genişletmesi: `tests/api/v1-partners.test.ts`

Bu dosya kapsam listemde yoktu ama **düzelttiğim rotaları test ediyor** ve değişikliğim onu
kırdı. Kırılma sebebi, bu kartın tam da kök nedeni:

```js
// eski mock
organization: { findMany: vi.fn().mockResolvedValue([]) },
```

`Organization` modeli yalnızca **bu mock'un içinde** vardı. Mock `[]` döndürdüğü için rota
uydurma demo dizisine düşüyor, `expect(body.data.length).toBeGreaterThan(0)` de
**uydurma satırlar sayesinde** geçiyordu. Yeşil test, bozuk uç nokta.

Yapılan: mock `cordisOrganization`/`cordisParticipation`/… olarak gerçek modellere bağlandı;
zayıf `length > 0` iddiası alan-alan sözleşme iddiasına çevrildi; iki test eklendi
(veri yokken `data: []`, bilinmeyen PIC'te 404). Şema doğrulamasını mock'a bırakmıyorum —
onu §3'teki test yapıyor.

---

## 5. Kiracı kapsamı kararı (kart maddesi d)

**Karar: paylaşılan referans verisi. `withTenant` KULLANILMADI.** Gerekçe, tercih değil, ölçüm:

1. `prisma/schema.prisma` — sekiz `Cordis*` modelinin hiçbirinde `tenantId` kolonu yok;
   `withTenant` kapsayacak bir kolon bulamaz.
2. `scripts/rls-models.ts:16-18` — sekizinin tamamı `SYSTEM_WIDE` kümesinde, yani
   `tenant_isolation` politikası bu tablolar için beklenmiyor. `pnpm rls:verify` bunu
   canlı olarak doğruluyor (§6).
3. Veri EU açık verisi (CORDIS): her kiracı için aynı. Kiracıya göre bölmek yanlış olurdu.

API anahtarı **kimin sorabileceğini** belirlemeye devam ediyor (401 kanıtı §6'da) ve
`meta.authenticatedTenant` çağıranı kayda geçiriyor — ama **ne döndüğünü** bölmüyor.

---

## 6. Kanıt

### 6.1 Kök neden — `prisma.organization` çalışma zamanında `undefined`

```
$ node --env-file=.env -e "... p.organization.findMany({take:1}) ..."
THROWS: TypeError | Cannot read properties of undefined (reading 'findMany')
THROWS: TypeError | Cannot read properties of undefined (reading 'findUnique')

$ node --env-file=.env -e "... typeof p[delegate] ..."
cordisOrganization object
cordisParticipation object
cordisPartnerProfile object
cordisProjectTopic object
cordisCoParticipation object
organization undefined
```

### 6.2 ÖNCE — gerçek istek, gerçek `ApiKey` satırı

Geçerli anahtar üretildi (dev DB'de gerçek `ApiKey` satırı, SHA-256 hash'li; iş bitince
silindi — §8).

```
$ curl -i -H "x-api-key: $K" "http://localhost:3000/api/v1/partners?country=DE&limit=2"
HTTP/1.1 200 OK
{"success":true,"meta":{"total":2,...},"data":[
 {"id":"org-fraunhofer","pic":"999984059","name":"Fraunhofer-Gesellschaft",...,
  "stats":{"projectCount":1420,"coordinatorCount":385,
           "totalEuContributionEur":840500000,"networkCentralityScore":0.98}},
 {"id":"org-siemens","pic":"999987260","name":"Siemens AG",...}]}
```
→ 200 OK, ama DB'de **sıfır** `CordisOrganization` satırı vardı. Tamamı uydurma.

```
$ curl -i -H "x-api-key: $K" "http://localhost:3000/api/v1/partners/999984059"
HTTP/1.1 200 OK
{"success":true,"data":{"pic":"999984059",
 "name":"EU Research Participant (PIC: 999984059)","country":"DE","orgType":"HES",
 "city":"Munich","isSme":false,
 "metrics":{"totalProjects":142,"coordinatorRoles":28,"totalFundingEur":54200000,
            "averageTeamSize":11.4,"preferredPillars":[...]},
 "recentProjects":[{"projectAcronym":"THERMO-CLEAN",...},{"projectAcronym":"SOLID-SAFE",...}],
 "networkHub":{"topCoAuthors":["Fraunhofer-Gesellschaft (DE)",...],"cooperationIndex":94.2}}}
```
→ Kurum kayıtta yok; uç nokta yine de bir kurum üretti.

### 6.3 SONRA — gerçek CORDIS satırlarıyla (geçici fixture, sonra silindi)

```
$ curl -i -H "x-api-key: $K" "http://localhost:3000/api/v1/partners?country=DE"
HTTP/1.1 200 OK
{"success":true,"meta":{"total":1,"limit":20,"queriedAt":"2026-09-07T18:28:05.073Z",
 "authenticatedTenant":"demo-tenant"},
 "data":[{"id":"999984059","pic":"999984059","name":"Fraunhofer-Gesellschaft",
 "legalName":"FRAUNHOFER GESELLSCHAFT ZUR FOERDERUNG DER ANGEWANDTEN FORSCHUNG E.V.",
 "country":"DE","orgType":"REC","isSme":false,"city":"München",
 "stats":{"projectCount":2,"coordinatorCount":1,"totalEuContributionEur":4840000,
          "networkCentralityScore":null}}]}
```
Fixture: 2 proje, Fraunhofer 1 koordinatör + 1 ortak, €4.200.000 + €640.000 = **€4.840.000**. Eşleşiyor.

Filtreler: `?country=TR` → 1 satır (METU) · `?orgType=PRC` → `[('912743326','Lomartov','PRC',True)]`
· `?q=lomartov` → `[('912743326','Lomartov')]`.

Detay, **profil satırı OLMAYAN** kurum (türetilmiş metrikler yolu):
```
$ curl -i -H "x-api-key: $K" "http://localhost:3000/api/v1/partners/999841469"
HTTP/1.1 200 OK
{"success":true,"data":{"pic":"999841469","name":"MIDDLE EAST TECHNICAL UNIVERSITY",
 "country":"TR","orgType":"HES","city":"Ankara","isSme":false,
 "metrics":{"totalProjects":2,"coordinatorRoles":1,"totalFundingEur":1850000,
   "averageTeamSize":2.5,
   "preferredPillars":["HORIZON-CL5-2024-D3-01","HORIZON-CL4-2023-DIGITAL-02"]},
 "recentProjects":[
   {"projectAcronym":"THERMOX","projectTitle":"Thermal Management for Heavy EV Fleets",
    "programme":"HORIZON-CL5-2024-D3","role":"participant","grantAmountEur":750000,
    "startDate":"2024-09-01","status":"SIGNED"},
   {"projectAcronym":"GRIDSAFE","projectTitle":"Resilient Grid Safety Verification",
    "programme":"HORIZON-CL4-2023-DIGITAL","role":"coordinator","grantAmountEur":1100000,
    "startDate":"2023-11-01","status":"SIGNED"}],
 "networkHub":{"topCoAuthors":["LOMARTOV SL (ES)"],"cooperationIndex":null}},
 "meta":{"queriedAt":"2026-09-07T18:28:05.151Z","source":"CORDIS Open Data & Caching Engine"}}
```
Aritmetik doğrulaması: €750.000 + €1.100.000 = **€1.850.000** ✓ · projeler 3 ve 2 katılımcı →
`averageTeamSize` **2,5** ✓ · `topCoAuthors` kenarı `orgA=912743326, orgB=999841469` olarak
saklı, PIC `orgB` tarafında eşleşti → ters yön çözümü çalışıyor ✓.

### 6.4 Boş/hata durumları (uydurma yok)

```
# DB'de sıfır CordisOrganization
$ curl -i ... /api/v1/partners        → HTTP/1.1 200 OK
  {"success":true,"meta":{"total":0,...},"data":[]}

$ curl -i ... /api/v1/partners/999984059 → HTTP/1.1 404 Not Found
  {"error":"Not Found","message":"No CORDIS organisation with PIC 999984059.",
   "code":"PARTNER_NOT_FOUND"}

$ curl -i ... /api/v1/partners/000000000 → HTTP/1.1 404 Not Found
  {"error":"Not Found","message":"No CORDIS organisation with PIC 000000000.",
   "code":"PARTNER_NOT_FOUND"}

$ curl -i http://localhost:3000/api/v1/partners/999984059   (anahtarsız)
  HTTP/1.1 401 Unauthorized
```
404 **gerçekten HTTP 404** — hafızadaki `fabrika-notfound-returns-http-200` tuzağına düşmüyor
(bu bir route handler, `notFound()` değil; `curl -i` ile durum satırı doğrulandı).

### 6.5 Muhafızın MUTASYON testi — asıl kanıt

`prisma.organization.findMany({ where: { pic: '1' } })` satırı rotaya geri kondu:

```
$ npx vitest run src/modules/m8/server/schema-contract.test.ts
AssertionError: M8 queries reference things the schema does not have:
  src/app/api/v1/partners/route.ts: prisma.organization.* —
    there is no `model Organization` in prisma/schema.prisma
AssertionError: A Prisma call names a model the schema does not declare. ...
  src/app/api/v1/partners/route.ts: prisma.organization.* — ...
 Tests  2 failed | 4 passed (6)

$ npx tsc --noEmit -p tsconfig.json | grep -i organization
(çıktı YOK — typecheck aynı mutasyonu GÖRMÜYOR)
```

`SCANNED` listesinde **olmayan** bir dosyada da (depo geneli tarama):
```
# src/lib/api-auth.ts içine `prisma.legalEntity.count()` eklendi
AssertionError: A Prisma call names a model the schema does not declare. ...
  src/lib/api-auth.ts: prisma.legalEntity.* —
    there is no `model LegalEntity` in prisma/schema.prisma
 Tests  1 failed | 5 passed (6)
```
Her iki mutasyon geri alındı; `git diff --stat src/lib/api-auth.ts` boş.

### 6.6 Kapı (`pnpm gate`)

```
$ pnpm test
 Test Files  78 passed | 2 skipped (80)
      Tests  875 passed | 8 skipped (883)

$ pnpm typecheck        → bu görevin dosyalarında hata YOK
$ npx eslint <bu görevin 5 dosyası>   → temiz (çıkış 0)

$ pnpm rls:check
Found 41 tenant-scoped models requiring RLS policies: ...
✅ SUCCESS: All 41 tenant-scoped models have RLS policies registered.

$ pnpm rls:verify
Kiracıya özel model: 41 · RLS açık tablo: 47 · tenant_isolation politikası: 41
✅ Veritabanı 41 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

**`pnpm gate` KIRMIZI — ve sebebi bu görevin dışında.** `pnpm lint` iki hata veriyor:
```
/Users/macbook/AgentSpace/fabrika/src/lib/billing/plan-repository.ts
  167:3   warning  Unused eslint-disable directive (...)
  169:20  error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  170:17  error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
✖ 86 problems (2 errors, 84 warnings)
```
Bu dosya `git status`'ta **`??` (untracked)** — bu dalgada başka bir ajanın ürettiği, benim
dokunmadığım bir dosya. Kapsam dışı olduğu için DÜZELTMEDİM (§7). Kapının diğer dört adımı
(typecheck, test, rls:check, rls:verify) temiz.

---

## 7. Açık sorular / kapsam dışı bulgular (DÜZELTİLMEDİ, bildiriliyor)

1. **`src/lib/billing/plan-repository.ts:169-170`** — `@typescript-eslint/no-explicit-any` iki
   hatası `pnpm lint`'i, dolayısıyla `pnpm gate`'i kırıyor. Untracked dosya, bu dalgada başka
   bir ajanın işi. **Kapıyı bu blokluyor.**
2. **`src/app/api/v1/calls/route.ts:67-80`** — aynı uydurma-fallback ailesi: `Topic` tablosu
   boşsa API'den sabit "HORIZON-CL5-2026-D3-01, €25.000.000" satırları servis ediliyor.
   Model gerçek (`Topic`), o yüzden §3'teki tarama bunu yakalamaz — bu bir *veri* uydurması,
   *model* uydurması değil. `src/app/api/v1/opportunities/route.ts` de aynı desende.
   Takım hafızasındaki `fabrika-fabricated-fallback-antipattern` listesiyle uyumlu.
3. **`meta.total` yanıltıcı** (`partners/route.ts:152`) — sayfa boyutunu döndürüyor, eşleşme
   sayısını değil. Mevcut anlamı KORUDUM (sözleşmeyi değiştirmemek için). Sayfalama eklenirken
   `meta.matchCount` gibi ayrı bir alan gerekir; `total`'ı sessizce yeniden tanımlamak
   `data.length === total` varsayan çağıranı kırar.
4. **`src/lib/cordis-sync.ts` / `src/lib/cordis-delta.ts`** — çalışmaya başladığımda bu iki
   dosyada da `prisma.organization.upsert` vardı (yutulan `catch` yüzünden "senkronize edildi"
   diyip sıfır satır yazıyorlardı). Aynı dalgada **başka bir ajan** bunları düzeltti; §3'teki
   depo geneli tarama bu yüzden boş defterle geçiyor. **O iş geri alınırsa testim kırmızıya
   döner** — doğru davranış, ama bilinsin.
5. **500 yolu gerçek istekle test EDİLMEDİ.** Her iki rotadaki yeni `catch → 500` dalı
   yalnız kodla doğrulandı; DB'yi düşürmeden gerçek bir istekle tetikleyemedim. Uydurmadım,
   bildiriyorum.
6. **`preferredPillars` alan adı artık içeriğini anlatmıyor** — değerler "pillar" değil,
   topic kodu/başlığı. Adı DEĞİŞTİRMEDİM (kart: alan adları sabit). v2'de `topTopics` olmalı.

---

## 8. Riskler

- **Dev DB'ye geçici yazım yapıldı ve geri alındı.** Doğrulama için (a) gerçek bir `ApiKey`
  satırı, (b) 3 `CordisOrganization` + 2 `CordisProject` + 5 `CordisParticipation` +
  2 `CordisProjectTopic` + 1 `CordisPartnerProfile` + 1 `CordisCoParticipation` fixture'ı
  eklendi. **Hepsi silindi**; silme sonrası sayımlar: `CordisOrganization 0`,
  `CordisParticipation 0`, `CordisPartnerProfile 0`, `CordisCoParticipation 0`, `ApiKey 0`.
  Kalan 20 `CordisProject`/`CordisProjectTopic` satırı benim değil (başka ajanın importer işi);
  silme sorgularım yalnız `t-proj-1`/`t-proj-2` id'lerini hedefledi ve tam 2+2 satır sildi.
- **`in: projectIds` sınırsız.** Çok katılımlı bir kurumda (CNRS ~1890 proje) `groupBy`
  sorgusu ~1890 elemanlı bir `IN` listesi üretir. Postgres kaldırır, ama CORDIS tam import
  edildikten sonra bu uç noktanın gecikmesi ölçülmeli.
- **`KNOWN_UNKNOWN_MODEL_CALLS` bir muafiyet kapısıdır.** Bugün boş ve yalnız küçülebilir;
  yine de gözden geçirende "buraya ekleyip geçeyim" refleksi oluşursa muhafız değerini
  kaybeder. Testin hata mesajı bunu açıkça yasaklıyor.
- Uç noktalar artık veri yokken boş/404 dönüyor. Demo dizisine bel bağlamış bir tüketici
  varsa (satış demosu, Postman koleksiyonu) davranış değişikliğini görür. Bu, kartın amacı.

---

## 9. Değişen dosyalar

```
 M src/app/api/v1/partners/route.ts
 M src/app/api/v1/partners/[pic]/route.ts
 M src/types/db-rows.ts
 M src/modules/m8/server/schema-contract.test.ts
 M tests/api/v1-partners.test.ts
 A docs/agent-results/TASK-MTRK8YPNJDCIT-blok-zincir-dse.md
```
`git add -A` KULLANILMADI — dosyalar tek tek eklendi.

---

## 10. Sonraki adım

1. **Kapıyı açmak için:** `src/lib/billing/plan-repository.ts:169-170` sahibi iki `any`'yi
   temizlemeli (§7.1). O olmadan `pnpm gate` kırmızı kalır.
2. **`prisma generate`'i kuruluma ve kapıya al.** Bu kartın kök nedeni. §3'teki test bir
   telafi muhafızıdır, gerçek çözüm değil: `prisma generate` koşsaydı `pnpm typecheck` bu
   sınıfın tamamını zaten yakalardı.
3. `/api/v1/calls` ve `/api/v1/opportunities` için aynı temizlik (§7.2) — ayrı kart.
4. CORDIS importer'ı dev DB'de koştur; bu uç noktalar şu an gerçek ama **boş** veri döndürüyor.
