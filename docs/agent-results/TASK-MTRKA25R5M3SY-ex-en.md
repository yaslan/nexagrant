# TASK-MTRKA25R5M3SY — `prisma-override.d.ts` ölçümü (MİMARİ)

**Ajan:** ex-en (Araştırmacı / Explorer) · **Tip:** spike / ölçüm · **Tarih:** 2026-09-07
**Kapsam:** YALNIZ ÖLÇÜM. Hiçbir tip hatası düzeltilmedi, hiçbir uygulama dosyası değiştirilmedi.
**Ölçüm tabanı:** HEAD `8913c16` + o an çalışma ağacında duran commit'siz dosyalar
(`prisma/schema.prisma`, `src/modules/m5/**`, `src/lib/billing/plan-repository.ts`, `tests/kpi-metrics.test.ts`).
Ölçüm **HEAD'den açılan izole bir git worktree'de** yapıldı; ana ağaca ve paralel çalışan iki
çocuk karta (`src/app/api/v1/partners/**`, `src/lib/cordis-*.ts`) dokunulmadı.

> ⚠️ Ölçüm anı önemli: iki çocuk kart `prisma.organization` çağrılarını **ölçümden sonra**
> düzeltmeye başladı (rapor sonundaki `git status`'ta o dosyalar `M` görünüyor). Aşağıdaki
> 4 "hayalet tablo" hatası o düzeltmelerin **öncesindeki** durumdur.

---

## 1. Ne yapıldı

### (a) `prisma generate` — veritabanı gerekmiyor, 1 saniye

```
$ pnpm exec prisma generate
Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma/schema.prisma.
warn Preview feature "driverAdapters" is deprecated. ...
✔ Generated Prisma Client (v7.10.0) to ./node_modules/.pnpm/@prisma+client@7.10.0_.../node_modules/@prisma/client in 230ms

pnpm exec prisma generate  1.39s user 0.15s system 149% cpu 1.027 total
```

Üç kanıtlanmış gerçek:
1. **Veritabanı bağlantısı gerekmiyor** — `DATABASE_URL` okunuyor ama kullanılmıyor; çıktı 1.0 sn'de üretildi.
2. **Yazdığı tek yer `node_modules`** — git ağacı hiç değişmedi.
3. **İstemci üretilmiş haldeyken bile, override yerindeyken `pnpm typecheck` YEŞİL kalıyor.**
   Kanıt: worktree'de override dosyası yerindeyken, üretilmiş istemciyle:
   ```
   $ ./node_modules/.bin/tsc --noEmit --incremental false
   EXIT=0
   ```
   Sebebi mimari olarak önemli: `declare module '@prisma/client'` bir **ambient module
   declaration**'dır ve gerçek paketin tiplerini gölgeler. Yani `prisma generate`'i kuruluma/kapıya
   eklemek **tek başına sıfır riskli ve sıfır faydalıdır**; fayda ancak override silinince gelir.

### (b) Override geçici devre dışı — 144 hata / 51 dosya

Worktree'de `src/types/prisma-override.d.ts` → `.disabled` olarak yeniden adlandırıldı
(ana ağaçta değil, commit edilmedi, ölçüm sonunda worktree tamamen silindi):

```
$ ./node_modules/.bin/tsc --noEmit --incremental false --pretty false > errors.txt
EXIT=2
$ grep -cE "^[^ ].*error TS" errors.txt
144
```

**Sonuç: 144 hata / 51 dosya — dosyanın kendi yorumundaki "158 hata / 36 dosya" ARTIK DOĞRU DEĞİL.**
Yorum eskimiş: hata sayısı düşmüş (M8 temizliği), dosya sayısı ise **artmış** (36 → 51), çünkü
o ölçüm muhtemelen `prisma/`, `scripts/` ve `tests/` dizinlerini saymıyordu.
Daha önemlisi: yorumun "**çoğu** dört hayalet tablo" iddiası da yanlış — hayalet tablo çağrıları
144 hatanın yalnızca **4'ü** (%2,8).

Hata kodu dağılımı:

| Kod | Adet | Anlamı |
|---|---:|---|
| TS2322 | 61 | tip atanamıyor |
| TS2345 | 28 | argüman tipi uyumsuz |
| TS2339 | 17 | özellik yok |
| TS18048 | 15 | possibly undefined |
| TS2353 | 8 | bilinmeyen nesne anahtarı |
| TS2740 | 5 | eksik özellikler |
| TS18047 | 5 | possibly null |
| TS2352 | 3 | riskli `as` dönüşümü |
| TS2741 / TS2739 | 2 | eksik zorunlu özellik |

Dosya türüne göre: **uygulama kodu 79 hata / 42 dosya**, test 56 / 4, seed 5 / 3, script 4 / 2.

### (c) Gruplama

| # | Grup | Hata | Dosya | Çalışma zamanında ne olur | Öncelik |
|---|---|---:|---:|---|---|
| 1 | **Hayalet tablo** (`prisma.organization`) | 4 | 4 | `PrismaClientValidationError` — 500 / sessiz fallback | 🔴 kritik |
| 2 | **Hayalet alan / ilişki** (doğrudan) | 11 | 8 | `PrismaClientValidationError` — aynı sınıf | 🔴 kritik |
| 2b | ↳ hayalet alanın **türev** hatası | 6 | 5 | (aynı çağrının dönüş tipi çöküyor) | 🔴 |
| 3 | **Enum uyuşmazlığı** (`string` → `Role`/`SubStatus`/…) | 11 | 7 | genelde çalışır; yanlış literal yazılırsa DB reddeder | 🟠 orta |
| 4 | **Json ↔ somut tip** (`JsonValue` / `InputJsonValue`) | 38 | 23 | çalışır — saf tip gürültüsü | 🟡 düşük |
| 5 | **Test mock tipi** (2 dosya) | 52 | 2 | üretimi etkilemez | 🟡 düşük |
| 6 | **Satır tipi sapması** (elle yazılmış `*Row` ↔ şema null'lığı) | 15 | 13 | genelde çalışır; `null` gelen alan UI'da patlayabilir | 🟠 orta |
| 7 | **Null güvenliği / gerçek hata** | 7 | 3 | 2'si potansiyel **kiracı sızıntısı** (aşağıda) | 🔴 kritik |
| | **TOPLAM** | **144** | **51** | | |

**Grup 1 — hayalet tablo (4).** Hepsi `prisma.organization`; `model Organization` şemada yok.
`src/app/api/v1/partners/route.ts:48` · `src/app/api/v1/partners/[pic]/route.ts:66` ·
`src/lib/cordis-sync.ts:65` · `src/lib/cordis-delta.ts:91`.
`Participation`, `Collab`, `OrgTopicStat` için **canlı çağrı kalmamış** — bugün yalnızca yorum
satırlarında ve `src/types/db-rows.ts`'teki ölü tip tanımlarında geçiyorlar
(`grep -rnE "\bCollab\b" src` → 6 isabet, hepsi yorum/tip).

**Grup 2 — hayalet alan / ilişki (11 doğrudan + 6 türev).** Aynı sınıf, sadece tablo yerine sütun:

| Dosya:satır | Hayalet | Şemadaki gerçek | try/catch var mı |
|---|---|---|---|
| `src/lib/sso.ts:26` | `Tenant.domain` | **yok** — `Tenant.settings` (Json) var | evet → **sessiz başarısızlık**, fonksiyon yine `success: true` döner |
| `src/app/[locale]/calls/turkey/page.tsx:69,74` | `Call.country`, `Call.isOpen`, `Call.deadline` | `Topic.nextDeadlineAt`, `CordisOrganization.country` | evet → sayfa **hep boş liste** |
| `src/app/api/v1/calls/route.ts:52` | `Topic.topicId`, `.programme`, `.deadlineAt`, `.deadlineTz`, `.budgetTotalEur`, `.fundingType` | `Topic.id/identifier`, `Call.programmeId`, `Topic.nextDeadlineAt`, `Topic.budgetPerProjectCents` | evet → **public API hep gömülü demo satırını** servis ediyor |
| `src/app/api/concept-notes/[id]/export/route.ts:20` | `ConceptNote.opportunity` ilişkisi | `ConceptNote.opportunityId` (ilişki tanımlı değil) | **hayır → 500** |
| `src/modules/m2/server/actions.ts:74` | `Opportunity.topic` ilişkisi | `Opportunity.topicId` (ilişki tanımlı değil) | **hayır → "Konsept not üret" her zaman patlar** |
| `src/modules/m2/server/actions.ts:167` | `ConceptNote.opportunity` | ↑ aynı | **hayır** |
| `src/lib/inngest/jobs/alerts-daily.ts:26` | `SavedSearch.tenant` ilişkisi | `SavedSearch.tenantId` (ilişki yok) | **hayır → günlük cron her sabah ölür** |
| `src/lib/calendar/sync.ts:68` | `SystemAlert.severity/type/sourceModule/metadata` | `level/source/message/meta` | catch bloğunun **içinde** → hata catch'ten kaçar |
| `prisma/seed-m6-evaluations.ts:62,76` | `Opportunity.callId`, `Proposal.status` | yok / `Proposal.outcome` | hayır → seed patlar |

> Bu tablo, kartın hipotezini doğruluyor ve **genişletiyor**: sınıf "hayalet tablo" değil,
> "**şemada olmayan her şey**". `prisma.organization` buzdağının görünen kısmıydı; aynı sınıftan
> 8 dosyada 11 canlı çağrı daha var ve bunların 4'ünde try/catch bile yok.

**Grup 7 — gerçek hata (kapsam dışı, bildiriliyor).**
`src/app/[locale]/(app)/[workspace]/relationships/[id]/page.tsx:20,25` —
`const tenantId = session?.tenantId` (`string | null | undefined`) doğrudan
`where: { id, tenantId }` içine giriyor. `tenantId` `undefined` olursa Prisma o koşulu **atar**
ve kayıt kiracıdan bağımsız döner. Override bu hatayı gizliyor; gerçek tiplerle
`TS2322: Type 'string | null | undefined' is not assignable to type 'string | StringFilter<"Relationship">'`.
Aynı desen `src/lib/auth.ts:234-237` ve `scripts/create-superadmin.ts:56`'da `possibly null` olarak çıkıyor.

**Grup 4 ve 5 neden düşük öncelikli.** 90 hata (%63) yalnızca iki mekanik kalıptan geliyor:
`Record<string, unknown>` → `Prisma.InputJsonValue` (yazarken) ve `JsonValue` → somut arayüz
(okurken); artı iki test dosyasının elle yazılmış mock'u (`subscription-sync.test.ts` 22,
`calendar/__tests__/sync.test.ts` 30). Hiçbiri çalışma zamanını etkilemiyor.

### (d) Dört hayalet tablonun şemadaki gerçek karşılığı

| Hayalet | Karşılık | Hüküm |
|---|---|---|
| `Organization` | **`CordisOrganization`** (`prisma/schema.prisma:556`) — `@id organisationId` = CORDIS PIC. Türev sayaçlar (`participationCount`, `coordinatorCount`, `ecContributionSum`) için **`CordisPartnerProfile`** (`:636`) hazır: `totalProjects`, `coordinatorProjects`, `totalEcContribution`. Kiracıya özel, CORDIS'te olmayan kurumlar için ayrıca **`PartnerOrg`** (`:763`) var. | **Ölü kod değil, yanlış isim.** Veri modeli eksiği YOK. Tek istisna: `LegacyOrganizationRow.eigenvector` — özvektör merkeziliğinin hiçbir kaynağı yok; `degree` `CordisCoParticipation` kenar sayımından türetilebilir ama `eigenvector` **gerçek bir veri modeli eksiği ya da ölü alan**. Karar gerekiyor. |
| `Participation` | **`CordisParticipation`** (`:583`, `@@id([projectId, organisationId])`) ⨝ `CordisProject` (`:525`). Sütun eşlemesi birebir: `role`→`role`, `ecContributionCents`→`ecContribution` (BigInt), `project`→`project` ilişkisi. | **Ölü kod.** Canlı çağrı yok; sadece `src/types/db-rows.ts:32`'deki `LegacyParticipationRow` tipi duruyor. Silinebilir. |
| `Collab` | **`CordisCoParticipation`** (`:666`, `@@id([orgA, orgB])`). `projects` → `sharedProjectCount`. `src/modules/m8/server/matching.ts:23` bu eşlemeyi zaten belgeliyor ve kullanıyor. | **Ölü kod.** Canlı çağrı yok; `LegacyCollabRow` (`db-rows.ts:53`) silinebilir. |
| `OrgTopicStat` | **Tek tablo karşılığı yok — kasıtlı.** İki seçenek şemada mevcut: (i) sorgu zamanında `CordisProjectTopic` (`:603`) ⨝ `CordisParticipation`, organizasyon başına toplanarak (`matching.ts:21`'in yaptığı); (ii) önceden hesaplanmış `CordisPartnerProfile.topTopics` (Json, top-20). Dikkat: şemadaki **`TopicStat` (`:454`) BU DEĞİL** — o Horizon Dashboard'dan gelen `topicPrefix × country × orgType` başarı oranı, organizasyon kırılımı içermez. | **Ölü kod + adaş tuzağı.** Veri modeli eksiği yok. Ama `TopicStat` ile `OrgTopicStat` isim benzerliği ileride yanlış eşleme üretir; `db-rows.ts:60`'daki `LegacyOrgTopicStatRow` silinirken bu not korunmalı. |

Özet hüküm: **dördünün üçü tamamen ölü kod, biri (`Organization`) sadece yanlış isim.**
Yeni tablo, yeni migration ve yeni RLS politikası **gerekmiyor** — CORDIS tabloları
`scripts/rls-models.ts`'te SYSTEM_WIDE. Tek açık veri sorusu `eigenvector`.

### (e) `prisma generate`'i kapıya bağlama + override'ı silme planı

**Ek ölçüm — kapıya bağlanabilecek ucuz bir bekçi zaten var.**
`src/modules/m8/server/schema-contract.test.ts` (261 satır) `prisma/schema.prisma`'yı okuyup
`prisma.*.<method>({ where/select/include/orderBy })` literallerini şemaya karşı doğruluyor —
veritabanı yok, mock yok. Ama `SCANNED` dizisi (satır 25-31) yalnızca 5 M8 yoluna bakıyor.
Repo geneline (`['src','prisma','scripts']`) açıp çalıştırdım (worktree'de, geçici kopya):

```
$ vitest run src/modules/m8/server/repo-wide-scan.test.ts
TOTAL 51 problems in 29 files      (138 ms)
```
Bu 51'in **29'u yanlış pozitif**: bileşik tekil anahtar adları (`tenantId_moduleId`,
`email_tenantId`, `projectId_organisationId`, `tenantId_userId`, …) — tarayıcı `@@unique`/`@@id`
bloklarını okumadığı için bunları "olmayan alan" sanıyor.
Kalan **22'si gerçek** ve tsc'nin bulduğu 15 doğrudan hayalet hatasından **daha fazlasını**
yakalıyor (tsc bir nesne literalinde ilk hatalı anahtarda duruyor; tarayıcı hepsini listeliyor —
ör. `api/v1/calls/route.ts`'te tsc 1, tarayıcı 6 hayalet sütun buldu).
Tarayıcının bugünkü kör noktası: `FIELD_BEARING` (satır 40) `data`'yı içermiyor, bu yüzden
`sso.ts` `data:{domain}`, `calendar/sync.ts` `data:{severity}` ve seed'lerdeki `callId`/`status`
gözünden kaçıyor.

**Önerilen 7 adım (her biri ayrı, tek başına yeşil bırakılabilir PR):**

| Adım | İş | Dokunulan dosya | Kapatılan hata | Risk |
|---|---|---|---|---|
| **0** | `package.json`: `"db:generate": "prisma generate"`, `"postinstall": "prisma generate"`, `gate` satırının başına `pnpm db:generate &&`. | 1 | 0 | **sıfır** — ölçüldü: istemci üretilmiş + override yerindeyken typecheck yeşil (EXIT=0) |
| **1** | `schema-contract.test.ts`'i repo geneline aç: `SCANNED = ['src','prisma','scripts']`; `parseSchema`'ya `@@unique([a,b])`/`@@id([a,b])` → `a_b` sanal alanı ekle (29 yanlış pozitifi bitirir); `FIELD_BEARING`'e `'data'` ekle. Dosyayı `src/modules/m8/server/` altından `tests/` ya da `src/lib/db/` altına taşı — artık M8'e ait değil. | 1 (+taşıma) | — (22 gerçek isabeti **kapıya** taşır) | düşük |
| **2** | 22 hayalet isabetini düzelt: `prisma.organization`→`CordisOrganization` (4, **iki çocuk kart bunu şu an yapıyor**) + tablodaki 8 dosyalık hayalet alan/ilişki listesi. | ~12 | 21 | orta — her biri gerçek tıklama ile doğrulanmalı |
| **3** | Enum: string literalleri üretilmiş enum'lardan içe aktar (`SubStatus`, `ModuleStatus`, `SeatStatus`, `Role`). | 7 | 11 | düşük |
| **4** | Null güvenliği: `tenantId` `undefined` iken sorguya girmesin (`relationships/[id]/page.tsx`, `auth.ts`, `create-superadmin.ts`). | 3 | 7 | **düşük ama kritik** — kiracı izolasyonu |
| **5** | `src/types/db-rows.ts`'i emekli et: elle yazılmış `*Row` arayüzlerini `Prisma.XGetPayload<...>` ile değiştir; `Legacy*Row` tiplerini sil. | ~15 | 15 | orta |
| **6** | Json: tek bir `toInputJson(v: Record<string, unknown>)` ve okuma tarafında `parseJson<T>(zod)` yardımcıları; 23 dosyada mekanik uygulama. Ayrıca 2 test dosyasının mock'unu tiplendir. | ~25 | 90 | düşük (mekanik, ama en geniş diff) |
| **7** | `src/types/prisma-override.d.ts`'i **sil**; `Role` importunu üretilmiş istemciden al; `pnpm gate`. | 1 | — | düşük (önceki adımlar yeşilse) |

**Tahmin: 7 adım / 7 PR, ~51 dosya.** İş yükü eşit dağılmıyor — hata sayısının %63'ü (adım 6)
mekanik ve düşük riskli, **çalışma zamanı riskinin tamamı ise adım 2 ve 4'te (28 hata, 15 dosya)**.

**Kritik tavsiye:** adım 0 tek başına HİÇBİR ŞEY korumaz (ambient declaration gerçek tipleri
gölgeler — ölçüldü). Kapının bugün kazanabileceği tek gerçek koruma **adım 1'dir**: 130 ms'lik,
veritabanısız, override'a dokunmayan bir test. Sıra **1 → 0 → 2 → 4 → 3 → 5 → 6 → 7** olmalı,
"önce generate'i ekleyelim" değil.

---

## 2. Kanıt

Tüm komutlar `HEAD 8913c16`'dan açılan izole worktree'de koştu
(`git worktree add --detach .../wt-measure HEAD`, `node_modules` ana ağaca symlink,
commit'siz `m5/*`, `plan-repository*`, `kpi-metrics.test.ts`, `schema.prisma` dosyaları kopyalandı).

```
### (a) prisma generate — DB gerekmiyor
$ pnpm exec prisma generate
✔ Generated Prisma Client (v7.10.0) to ./node_modules/.pnpm/@prisma+client@7.10.0_.../@prisma/client in 230ms
pnpm exec prisma generate  1.39s user 0.15s system 149% cpu 1.027 total

### taban: override YERİNDE + istemci üretilmiş
$ ./node_modules/.bin/tsc --noEmit --incremental false
EXIT=0

### (b) override devre dışı
$ mv src/types/prisma-override.d.ts src/types/prisma-override.d.ts.disabled
$ ./node_modules/.bin/tsc --noEmit --incremental false --pretty false > errors.txt
EXIT=2
$ grep -cE "^[^ ].*error TS" errors.txt
144
$ node classify.mjs
TOTAL 144 errors / 51 files

### hata kodu dağılımı
  61 error TS2322    28 error TS2345    17 error TS2339    15 error TS18048
   8 error TS2353     5 error TS2740     5 error TS18047     3 error TS2352
   1 error TS2741     1 error TS2739

### hayalet tablo — tam liste (4)
src/app/api/v1/partners/[pic]/route.ts(66,28): error TS2339: Property 'organization' does not exist on type 'PrismaClient<...>'
src/app/api/v1/partners/route.ts(48,29):      error TS2339: Property 'organization' does not exist on type 'PrismaClient<...>'
src/lib/cordis-delta.ts(91,20):               error TS2339: Property 'organization' does not exist on type 'PrismaClient<...>'
src/lib/cordis-sync.ts(65,20):                error TS2339: Property 'organization' does not exist on type 'PrismaClient<...>'

### hayalet alan/ilişki — doğrudan (11)
prisma/seed-m6-evaluations.ts(62,7):  TS2353: 'callId' does not exist in type 'OpportunityCreateInput...'
prisma/seed-m6-evaluations.ts(76,9):  TS2353: 'status' does not exist in type 'ProposalCreateInput...'
src/app/[locale]/calls/turkey/page.tsx(69,9):  TS2353: 'country' does not exist in type 'CallWhereInput'
src/app/[locale]/calls/turkey/page.tsx(74,18): TS2353: 'deadline' does not exist in type 'CallOrderByWithRelationInput...'
src/app/api/concept-notes/[id]/export/route.ts(20,5): TS2322: Type '{ opportunity: true; }' is not assignable to type 'never'
src/app/api/v1/calls/route.ts(52,9):   TS2353: 'topicId' does not exist in type 'TopicSelect<DefaultArgs>'
src/lib/calendar/sync.ts(68,11):       TS2353: 'severity' does not exist in type 'SystemAlertCreateInput...'
src/lib/inngest/jobs/alerts-daily.ts(26,9): TS2322: Type '{ tenant: true; }' is not assignable to type 'never'
src/lib/sso.ts(26,9):                  TS2353: 'domain' does not exist in type 'TenantUpdateInput...'
src/modules/m2/server/actions.ts(74,18):  TS2353: 'topic' does not exist in type 'OpportunityInclude<DefaultArgs>'
src/modules/m2/server/actions.ts(167,7):  TS2322: Type '{ opportunity: true; }' is not assignable to type 'never'

### enum uyuşmazlığı (11)
prisma/seed.ts(145,63) / (145,77)                       'string' → SeatStatus
src/app/[locale]/(app)/[workspace]/pipeline/actions.ts(255,9)  OppStatus → dar birlik
src/app/[locale]/(app)/[workspace]/pipeline/page.tsx(24,5)
src/lib/auth.ts(215,19)                                 'string' → Role | undefined
src/lib/billing/subscription-sync.ts(279,7) / (289,7)   'string' → SubStatus
tests/e2e/module-plan-gate.spec.ts(38,15) / (39,53)     'string' → ModuleStatus
tests/e2e/plan-entitlement.spec.ts(36,15) / (37,52)     'string' → ModuleStatus

### null güvenliği / gerçek hata (7)
src/app/[locale]/(app)/[workspace]/relationships/[id]/page.tsx(20,18): TS2322: 'string | null | undefined' → 'string | StringFilter<"Relationship">'
src/app/[locale]/(app)/[workspace]/relationships/[id]/page.tsx(25,14): TS2322: 'string | null | undefined' → 'string | StringFilter<"Interaction">'
src/lib/auth.ts(234,17) (235,20) (236,19) (237,20):  TS18047: 'user' is possibly 'null'
scripts/create-superadmin.ts(56,82):                 TS18047: 'user' is possibly 'null'

### (e) repo geneli şema-sözleşmesi tarayıcısı (geçici kopya, worktree)
$ vitest run src/modules/m8/server/repo-wide-scan.test.ts
 Test Files  1 passed (1)   Duration  138ms
TOTAL 51 problems in 29 files
$ grep -c -- "where\.[a-zA-Z]*_[a-zA-Z]" scan.txt     # bileşik anahtar yanlış pozitifleri
29
# → 22 gerçek isabet. Örnek (tsc'nin göremediği ek sütunlar):
src/app/api/v1/calls/route.ts
   - topic.findMany.select.topicId / .programme / .deadlineAt / .deadlineTz / .budgetTotalEur / .fundingType
src/app/[locale]/calls/turkey/page.tsx
   - call.findMany.where.country / .isOpen / .deadline ; call.findMany.orderBy.deadline

### şema doğrulaması (ana ağaç, salt-okunur)
$ grep -c "^model " prisma/schema.prisma
70
$ for m in Organization Participation Collab OrgTopicStat CordisOrganization CordisParticipation; do
    printf "%-22s " $m; grep -cE "^model $m \{" prisma/schema.prisma; done
Organization           0
Participation          0
Collab                 0
OrgTopicStat           0
CordisOrganization     1
CordisParticipation    1

### üç hayaletin canlı çağrısı kalmamış (yalnız yorum/tip)
$ grep -rnE "\bCollab\b" --include="*.ts" --include="*.tsx" src
src/types/prisma-override.d.ts:87   (yorum)
src/types/db-rows.ts:8              (yorum)
src/types/db-rows.ts:53             (LegacyCollabRow tipi)
src/modules/m8/server/matching.ts:7,23  (yorum)
src/modules/m8/server/schema-contract.test.ts:253  (regresyon testi)

### temizlik
$ git worktree remove --force .../wt-measure
$ git worktree list
/Users/macbook/AgentSpace/fabrika  8913c16 [dev]
$ ls -l src/types/prisma-override.d.ts
-rw-r--r--@ 1 macbook staff 3752 Sep 7 19:37 src/types/prisma-override.d.ts   # dokunulmadı
```

### Bitişte `git status` (ana ağaç)

```
$ git status --porcelain
 M .agentspace/memory/agents/blog-yazar/git-add-verify-before-commit.md
 M .agentspace/memory/agents/blok-zincir-lead/MEMORY.md
 M .agentspace/memory/agents/blok-zincir-lead/fabrika-einvoice-real-record-or-404.md
 M .agentspace/memory/agents/ex-en/MEMORY.md
 M .agentspace/memory/agents/geli-tirici/MEMORY.md
 M docs/.agent-notifications
 M docs/CORDIS-SAMPLE-CALIBRATION.md
 M prisma/rls.sql
 M prisma/schema.prisma
 M src/app/api/v1/partners/[pic]/route.ts      ← çocuk kart (bana ait DEĞİL)
 M src/app/api/v1/partners/route.ts            ← çocuk kart (bana ait DEĞİL)
 M src/lib/cordis-delta.ts                     ← çocuk kart (bana ait DEĞİL)
 M src/lib/cordis-sync.ts                      ← çocuk kart (bana ait DEĞİL)
 M src/modules/m5/server/metrics.ts
 M src/modules/m5/server/queries.ts
 M src/modules/m5/ui/Dashboard.tsx
 M src/types/db-rows.ts                        ← çocuk kart (bana ait DEĞİL)
?? ...(diğer ajanların hafıza + rapor dosyaları)
?? docs/agent-results/TASK-MTRKA25R5M3SY-ex-en.md   ← bu rapor (benim TEK dosyam)
```

**Benim bıraktığım tek iz bu rapor dosyası + kendi hafıza dosyam.**
`src/types/prisma-override.d.ts` değiştirilmedi, worktree silindi, `pnpm exec prisma generate`
yalnızca `node_modules`'a yazdı (git ağacı etkilenmedi, idempotent).

### `pnpm gate` — commit öncesi (tam çıktı)

Çalışma ağacı paralel ajanların işiyle kirli olduğu için kapının kod adımları (`lint`, `typecheck`,
`test`) **HEAD `8913c16`'dan açılan ayrı bir worktree'de** + benim üç `.md` dosyamla koşuldu —
yani tam olarak bu commit'in ürettiği ağaç. `rls:check` / `rls:verify` canlı DB istediği için ana
ağaçta koşuldu (salt-okunur, benim değişikliğimden bağımsız).

```
$ ./node_modules/.bin/eslint
✖ 84 problems (0 errors, 84 warnings)          → PASS (kapı yalnız error'a bakar)

$ ./node_modules/.bin/tsc --noEmit --incremental false
TYPECHECK_EXIT=0                                → PASS

$ ./node_modules/.bin/vitest run --passWithNoTests
 Test Files  75 passed | 2 skipped (77)
      Tests  815 passed | 12 skipped (827)
   Duration  3.00s                              → PASS

$ pnpm rls:check
Found 41 tenant-scoped models requiring RLS policies: ...
✅ SUCCESS: All 41 tenant-scoped models have RLS policies registered.
   (Declared, not measured — `pnpm rls:verify` asks the database.)   → PASS

$ pnpm rls:verify
Kiracıya özel model: 41 · RLS açık tablo: 47 · tenant_isolation politikası: 41
✅ Veritabanı 41 kiracıya özel tablonun tamamında izolasyonu uyguluyor.  → PASS
```

**Kapı: 5/5 yeşil.** Bu commit yalnızca `.md` dosyaları içeriyor; `tsconfig.json` `include`'una da
`vitest` kapsamına da girmediği için kapı sonucu HEAD ile birebir aynı — beklenen davranış.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `docs/agent-results/TASK-MTRKA25R5M3SY-ex-en.md` | **yeni** — bu rapor |
| `.agentspace/memory/agents/ex-en/fabrika-prisma-override-audit.md` | **yeni** — hafıza kaydı |

Uygulama kodunda **sıfır** değişiklik. `git add -A` kullanılmadı; dosyalar tek tek eklendi.

---

## 4. Riskler

1. **Ölçüm bir anlık fotoğraf.** İki çocuk kart ölçümden sonra `prisma.organization`'ı düzeltmeye
   başladı; adım 2'nin kalan işi ölçüldüğünden küçük olabilir. Plan uygulanmadan önce
   `(b)` ölçümü tekrarlanmalı — 5 dakikalık iş.
2. **144 sayısı `skipLibCheck: true` altında.** Kapatılırsa üretilmiş istemcinin kendi
   `.d.ts`'lerinden ek hatalar gelebilir; ölçmedim.
3. **Adım 6 en geniş diff.** 23+2 dosya, 90 hata. Tek PR'da yapılırsa gözden geçirilemez;
   modül modül bölünmeli.
4. **`postinstall: prisma generate`** CI'da `pnpm install --frozen-lockfile` sonrası her seferinde
   1 sn ekler ve `prisma/schema.prisma` bozuksa kurulumu kırar. Bu istenen davranış, ama
   kurulum kırıldığında hata mesajı bugünkünden farklı olacak — takıma duyurulmalı.
5. **Şema-sözleşmesi tarayıcısı regex tabanlı.** Değişkene atanmış sorgu nesnelerini
   (`const where = {...}; prisma.x.findMany({ where })`) göremez. Kapı olarak yeterli ama
   "temiz = güvenli" demek değil.

---

## 5. Açık sorular

1. **`eigenvector` nedir?** `src/types/db-rows.ts:24` `LegacyOrganizationRow.eigenvector`
   tanımlıyor; CORDIS tablolarında hiçbir karşılığı yok ve hesaplayan kod da yok.
   **Veri modeli eksiği mi (özvektör merkeziliği hesaplanacak mıydı) yoksa ölü alan mı?** Karar gerek.
2. **Kapsam dışı — potansiyel kiracı sızıntısı.**
   `src/app/[locale]/(app)/[workspace]/relationships/[id]/page.tsx:19-25`:
   `session?.tenantId` `undefined` olduğunda `where: { id, tenantId: undefined }` Prisma tarafından
   **koşul atlanarak** çalışır → kayıt kiracıdan bağımsız döner. `moduleGate('M4')` giriş
   kontrolü yapıyor olabilir ama tip seviyesinde garanti yok. Ayrı bir kart açılmalı.
3. **Kapsam dışı — `src/lib/sso.ts:17-31`.** `configureEnterpriseSso` DB yazımı başarısız olsa da
   `success: true` döndürüyor (`catch` yalnızca `console.warn`). `Tenant.domain` şemada olmadığı için
   **bu fonksiyon bugün hiçbir zaman kaydetmiyor**, ama çağıran taraf başarılı sanıyor.
   `Tenant.settings` (Json) alanına taşınmalı mı, yoksa `Tenant.domain` sütunu mu eklenmeli?
4. **Kapsam dışı — `src/app/api/v1/calls/route.ts:47-61`.** Public API'nin `Topic` select'indeki
   6 sütunun hiçbiri yok; endpoint her istekte `catch` düşüp **gömülü demo satırını** dönüyor.
   Public sözleşme bu mu, yoksa gerçek veri mi dönmeli? (Şemada karşılıklar var:
   `identifier`, `nextDeadlineAt`, `budgetPerProjectCents`, `typeOfAction`.)
5. **Kapsam dışı — `src/lib/inngest/jobs/alerts-daily.ts:24-30`.** `SavedSearch.tenant` ilişkisi yok,
   try/catch da yok → günlük 08:00 UTC cron'u her sabah `PrismaClientValidationError` ile ölüyor
   olmalı. Inngest üretimde çalışıyorsa bu **canlı bir arıza**; runtime logu ile doğrulanmalı.
6. **Kapsam dışı — `src/lib/billing/plan-repository.ts:102`** (commit'siz, başka ajanın dosyası):
   `versions[].plan.visibility` seçiliyor ama `visibility` üst düzey `plan` nesnesinden okunuyor
   → `TS2339`. Sahibine bildirilmeli.
7. **`schema-contract.test.ts` nereye taşınsın?** Artık M8'e ait değil, repo geneli bir kapı olacak.
   `tests/schema-contract.test.ts` mi, `src/lib/db/schema-contract.test.ts` mi?

---

## 6. Sonraki adım

**Önerilen sıra — "önce generate" DEĞİL, "önce bekçi":**

1. **Adım 1'i tek başına bir kart yap** (`schema-contract.test.ts` → repo geneli + `@@unique`
   bileşik anahtar desteği + `FIELD_BEARING`'e `data`). 130 ms, veritabanısız, override'a dokunmadan
   22 gerçek isabeti kapıya taşır. **Bu dalganın en yüksek getirili tek işi budur.**
2. Adım 2'nin kalanını (çocuk kartların bitirmediği 8 dosyalık hayalet alan listesi) ayrı kartlara
   böl; her biri gerçek tıklama/çağrı ile doğrulansın.
3. Adım 4'ü (kiracı null güvenliği) güvenlik kartı olarak ayır — 3 dosya, ama izolasyonu ilgilendiriyor.
4. Adım 0'ı 1'den sonra ekle; 3 → 5 → 6 → 7 sırasıyla borç kartlarına yaz.
5. `src/types/prisma-override.d.ts:83-90`'daki "158 hata / 36 dosya" yorumu **yanlış** —
   düzeltilmesi (144 / 51, ve "çoğu dört hayalet tablo" ifadesinin kaldırılması) adım 0 veya 1'e iliştirilsin.
