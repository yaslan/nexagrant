# TASK-MTSJK8VVG9MKM — Şema sözleşmesi kapısı `prisma/` ve `scripts/`'i de tarasın

**Ajan:** blok-zincir-dse (Tasarımcı) · **Tip:** kapı sertleştirme + runtime kusur · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-08
**Bkz:** `docs/agent-results/TASK-MTSI7YQWUZOFH-ex-en.md` §5.2

---

## 0. Tek cümle

Kapının kapsamı `src/` → `src/ + prisma/ + scripts/` genişletildi; kırmızı çıktı ex-en'in bildirdiği
**iki** hayalet sütun yerine **üç** tanesini gösterdi, ve seed'i gerçekten koşturmak aynı sınıftan
**iki kusur daha** ortaya çıkardı (Prisma 7'de istemci hiç kurulamıyor; `Proposal.opportunityId`
`@unique` olduğu için iki teklif tek fırsata bağlanamıyor) — dördü de düzeltildi, seed **184 satır**
yazarak uçtan uca koştu.

---

## 1. Ne yapıldı

### 1.1 Kapı genişletildi (tarayıcı YENİDEN YAZILMADI)

`src/modules/m8/server/schema-contract.test.ts` — gramerine dokunulmadı, yalnız **kapsamı**:

```ts
const SCANNED = ['src'];        // önce
const SWEEP_ROOT = 'src';
```
```ts
const SCANNED = ['src', 'prisma', 'scripts'];   // sonra — her iki kontrol de aynı kökleri okuyor
```

`sweepModelCalls()` artık `listFiles(SWEEP_ROOT)` yerine `scannedFiles()` çağırıyor; iki kontrol
tek kapsam tanımını paylaşıyor, ayrışamıyorlar.

### 1.2 Kapsam **git indeksiyle** sınırlandı — ve bu bir tasarım kararı

İlk genişletilmiş koşu bir dosyada daha kusur buldu:

```
scripts/_cs-st6-probe3.ts: moduleState.findMany.select.state
  — `state` is not a field of model `ModuleState`  (şemada `status` var)
```

Bu dosya **git'te takipli değil**: customer-support'un TASK-MTSJJOR63M63R üzerinde *şu anda* açık
olan hata ayıklama sondası. Kusur gerçek (o sorgu koşarsa patlar) ama **benim düzelteceğim dosya
değil**, ve rengi bir ajanın yerel çöpüne bağlı bir kapı burada kırmızı, CI'da yeşil olur — yani
hiçbir yerde güvenilmez.

Karar: kapı **deponun içeriğini** okur, çalışma ağacında ne varsa onu değil. `git ls-files -c`
indeksi listeler, dolayısıyla:
- takipsiz çöp **taranmaz** (ve zaten sevk de edilmez),
- `git add`'lenmiş yeni dosya **taranır** — ki pre-commit hook kapıyı tam o anda koşturur.

Git yoksa (tarball, vendor kopyası) tüm ağaca geri düşer: fazla taramak güvenli yön, hiç taramamak
vakum. İkisi de §2.4'te mutasyonla ölçüldü.

### 1.3 `prisma/seed-m6-evaluations.ts` şemaya uyduruldu — 4 kusur

| # | Satır | Neydi | Şema ne diyor | Ne yapıldı |
|---|---|---|---|---|
| 1 | 62 | `Opportunity.callId: 'call-demo'` | böyle bir sütun yok (`topicId` var) | **silindi** — M6 paneli için gereksiz; sahte bir `topicId` uydurmak veri fabrikasyonu olurdu |
| 2 | 76 | `Proposal.status: 'draft'` | `Proposal`'da yaşam-döngüsü sütunu yok; durum `Evaluation.status`'ta | **silindi** — `outcome`'a çevirmek onu belgelenmiş alan dışı (`funded\|reserve\|above_threshold\|below`) bir değerle doldururdu |
| 3 | 77 | `Proposal.title` | böyle bir sütun yok; etiket `acronym` | `acronym: \`PROP-${p}\`` — `scripts/seed-m6-e2e.ts`'in zaten kullandığı şekil |
| 4 | 1, 11 | `new PrismaClient()` | Prisma 7 sürücü adaptörü olmadan **kurulumda** patlıyor | `import { prisma } from '../src/lib/db'` — `prisma/seed.ts`'in idiyomu |
| 5 | 54–89 | 2 teklif tek fırsata bağlı | `Proposal.opportunityId` **`@unique`** | teklif başına bir fırsat (`opp-m6-demo-1/-2`) |

3. madde kartta yoktu: ex-en iki hayalet sütun bildirmişti, genişletilmiş kapı **üç** buldu.
4. ve 5. madde ancak seed **gerçekten koşturulunca** göründü — statik kapı ikisini de göremez.

Ayrıca seed **yeniden koşulabilir** yapıldı: satırlar sabit id'lerle `create` ediliyordu, ikinci
koşu `Reviewer @@unique([evaluationId, userId])`'de ölürdü. Başına kendi değerlendirmelerini silen
tek satır kondu (çocuklara cascade eder, kiracının gerisine dokunmaz). Kartın istediği "gerçekten
koştur" doğrulaması bunsuz tekrarlanamazdı.

### 1.4 Nöbetçiler

Kapsamın hayali olmadığını kanıtlayan iki test eklendi/genişletildi:
- eklenen her kök için birer dosya pinlendi (`prisma/seed-m6-evaluations.ts`, `prisma/seed.ts`,
  `scripts/seed-m6-e2e.ts`) — hem alan kontrolünde hem model süpürmesinde;
- **YENİ** `reads the git index, not the working tree`: `git ls-files -o` ile bulunan takipsiz
  `.ts` dosyalarından hiçbirinin taranmadığını, ve `TRACKED`'ın boş olmadığını (vakum değil)
  doğrular.

---

## 2. Kanıt (gerçek komut çıktısı)

### 2.1 KIRMIZI — kapsam genişletildi, seed düştü

```
$ npx vitest run src/modules/m8/server/schema-contract.test.ts

 ❯ src/modules/m8/server/schema-contract.test.ts (16 tests | 1 failed) 727ms
     × names only models, relations and columns that exist 161ms

AssertionError: A Prisma query names a model, relation or column the schema does not declare.
  prisma/seed-m6-evaluations.ts: opportunity.upsert.create.callId — `callId` is not a field of model `Opportunity` in prisma/schema.prisma
  prisma/seed-m6-evaluations.ts: proposal.upsert.create.status — `status` is not a field of model `Proposal` in prisma/schema.prisma
  prisma/seed-m6-evaluations.ts: proposal.upsert.create.title  — `title`  is not a field of model `Proposal` in prisma/schema.prisma

 Test Files  1 failed (1)
      Tests  1 failed | 15 passed (16)
```

Aynı dosya, aynı üç sütun, **genişletmeden önceki** kapıda: `Tests 15 passed` — kapı kördü.

### 2.2 YEŞİL — seed şemaya uyduruldu

```
$ npx vitest run src/modules/m8/server/schema-contract.test.ts

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Duration  848ms
```

### 2.3 Seed GERÇEKTEN koşturuldu — 184 satır

Önce temiz taban (ölçüldü, sonra ara koşuların kalıntısı silinip taban geri getirildi):

```
tenant demo id          : ABSENT
opportunity opp-m6-demo : 0     proposal prop-m6-*: 0     evaluation eval-m6-*: 0
Reviewer TOTAL : 2   Criterion TOTAL : 4   Score TOTAL : 0   Evaluation TOTAL : 1
```

Tek temiz koşu:

```
$ npx tsx prisma/seed-m6-evaluations.ts
✓ Seeded 10 M6 evaluations (2 proposals × 5 evaluations each) with reviewers and scores
SEED_EXIT=0

=== rows written ===
Tenant      (slug=demo)           : 1     createdAt= 2026-09-08T10:52:04.587Z
User        (reviewer*@demo.local): 3
Workspace   (demo-ws)             : 1
Opportunity (opp-m6-demo*)        : 2
Proposal    (prop-m6-*)           : 2
Evaluation  (eval-m6-*)           : 10
Reviewer    (of those)            : 25
Criterion   (of those)            : 40
Score       (of those)            : 100
                                  ──────
                            TOPLAM  184
```

Yazılan satırların şekli (kalan `outcome` sütunu `null`, uydurulmadı):

```
{ id: 'prop-m6-1', acronym: 'PROP-1', opportunityId: 'opp-m6-demo-1',
  esrScores: { total: 13, outcome: 'not_recommended', threshold: 12, labelSource: 'esr_official' },
  outcome: null }
{ id: 'prop-m6-2', acronym: 'PROP-2', opportunityId: 'opp-m6-demo-2',
  esrScores: { total: 14, outcome: 'recommended',     threshold: 12, labelSource: 'esr_official' },
  outcome: null }
```

Yalnız yazma değil, hesaplama yolu da koştu (`evaluation.update` dalı):

```
  eval-m6-1    status=completed    avgScore=4.5
  eval-m6-2    status=completed    avgScore=2.5
  eval-m6-3    status=completed    avgScore=3
  eval-m6-4    status=completed    avgScore=1
  eval-m6-5    status=completed    avgScore=3.5
  eval-m6-6..10 status=in-progress avgScore=null
```

İkinci koşu (yeniden koşulabilirlik): `SECOND_RUN_EXIT=0`.

**Düzeltmeden önce ne oluyordu** — aynı komut, aynı veritabanı:

```
$ npx tsx prisma/seed-m6-evaluations.ts        (adaptör düzeltmesinden ÖNCE)
PrismaClientInitializationError: PrismaClient was instantiated without any options.
A driver adapter is required to connect to your database.
SEED_EXIT=1

$ npx tsx prisma/seed-m6-evaluations.ts        (adaptör düzeltildi, @unique düzeltilmeden ÖNCE)
PrismaClientKnownRequestError: Invalid `prisma.proposal.upsert()` invocation
Unique constraint failed on the constraint: `Proposal_opportunityId_key`
  code: 'P2002', meta: { modelName: 'Proposal' }
SEED_EXIT=1
```

**Veritabanı görevden sonra tabanına geri kondu** (paylaşılan dev DB'de altı ajan koşuyor;
`demo` kiracısı ölçümden önce yoktu, ölçümden sonra da yok):

```
evaluation eval-m6-* : 10   proposal prop-m6-* : 2   opportunity opp-m6-* : 2
user *@demo.local    : 3    tenant demo (cascade): 1
--- residue ---
Reviewer TOTAL : 2   Criterion TOTAL: 4   Score TOTAL : 0   Evaluation TOTAL: 1     ← taban
```

Yeniden yüklemek isteyen: `npx tsx prisma/seed-m6-evaluations.ts`.

### 2.4 ZORUNLU MUTASYON — genişletilen kökler gerçekten canlı

**`scripts/` taranıyor mu** (takipli bir dosyada `acronym` → `acronymm`):

```
  scripts/seed-m6-e2e.ts: proposal.upsert.create.acronymm — `acronymm` is not a field of model `Proposal`
 Test Files  1 failed (1)      Tests  1 failed | 15 passed (16)
```
Bayt yedeğinden geri kondu; `git diff --stat scripts/seed-m6-e2e.ts` boş.

**Takipsiz dosya taranmıyor mu** (`scripts/_dse-…-probe.ts`, `where: { totallyBogusColumn: true }`):

```
 Test Files  1 passed (1)      Tests  16 passed (16)      ← takipsizken görünmez
```

**Aynı dosya `git add`'lendiğinde**:

```
  scripts/_dse-mtsjk-staged-probe.ts: proposal.findMany.where.totallyBogusColumn
    — `totallyBogusColumn` is not a field of model `Proposal` in prisma/schema.prisma
 Test Files  1 failed (1)      Tests  1 failed | 15 passed (16)
```
`git rm --cached` + silindi; `git status --porcelain` o yol için boş.

### 2.5 Bağımsız ikinci kanıt — derleyici de aynı üç sütunu reddediyor

ex-en TASK-MTSJHTJZSCILI kapsamında `src/types/prisma-override.d.ts`'yi **şu anda** silmiş
durumda (staged `D`), yani `tsc` gerçek Prisma tiplerini görüyor. Üç sütun geri konduğunda:

```
prisma/seed-m6-evaluations.ts(78,9): error TS2353: 'callId' does not exist in type
  'Without<OpportunityCreateInput, OpportunityUncheckedCreateInput> & …'
prisma/seed-m6-evaluations.ts(93,9): error TS2353: 'status' does not exist in type
  'Without<ProposalCreateInput, ProposalUncheckedCreateInput> & …'
```
(`tsc` nesne başına ilk hatayı verir, bu yüzden `title` `status`'ın arkasında kalıyor — şema
kapısı üçünü de adıyla söylüyor. Kapının derleyiciden **daha ayrıntılı** olduğu nokta bu.)

Düzeltilmiş hâlde: `seed-m6-evaluations.ts` için **0 tsc hatası**.

### 2.6 Kapı

```
$ npx eslint prisma/seed-m6-evaluations.ts src/modules/m8/server/schema-contract.test.ts
ESLINT_EXIT=0        (sıfır çıktı)

$ npx vitest run src/modules/m8/server/schema-contract.test.ts
 Test Files  1 passed (1)      Tests  16 passed (16)

$ npx vitest run          (tüm paket)
 Test Files  2 failed | 104 passed | 2 skipped (108)
      Tests  7 failed | 1225 passed | 8 skipped (1240)
```

**7 kırmızının hiçbiri benim değil** — hepsi `src/lib/billing/subscription-sync.test.ts` (4) ve
`src/lib/iyzico.test.ts` (3), tek sebep `prisma.planVersion` mock'ta `undefined`:

```
TypeError: Cannot read properties of undefined (reading 'findFirst')
 ❯ publishedVersionIdFor src/lib/billing/plan-repository.ts:212:40
```

O dosyalar blok-zincir-denet-i'nin **commit'lenmemiş** aktif işi (`git status`: `M plan-repository.ts`,
`M subscription-sync.ts`, `M prisma/schema.prisma`, `?? entitlement-source.ts` — TASK-MTSJH8NMAXPRM).
Değiştirdiğim iki dosyaya hiçbir referansları yok (`grep` → `NO REFERENCE`).

`npx tsc --noEmit` şu an **70 hata** veriyor; hiçbiri benim dosyalarımda değil (§2.5'te grep → `NONE`).
Sebebi ex-en'in aynı anda süren override kaldırma işi (TASK-MTSJHTJZSCILI) — kartın "DOKUNMA"
dediği dosya.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/modules/m8/server/schema-contract.test.ts` | `SCANNED = ['src','prisma','scripts']`; `SWEEP_ROOT` kaldırıldı (iki kontrol tek kapsamı paylaşıyor); `trackedFiles()` + `TRACKED` ile git indeksine daraltma (git yoksa tüm ağaca geri düşer); kök başına pin; **YENİ** test `reads the git index, not the working tree`; describe başlıkları ve dosya başı gerekçe güncellendi |
| `prisma/seed-m6-evaluations.ts` | 3 hayalet sütun (`callId`, `status`, `title`) düzeltildi; istemci `src/lib/db`'den (Prisma 7 adaptörü); teklif başına bir fırsat (`Proposal.opportunityId` `@unique`); yeniden koşulabilir |

`src/types/prisma-override.d.ts`'ye **DOKUNULMADI** · `prisma/schema.prisma` **DEĞİŞMEDİ** ·
başka ajanın dosyası **DEĞİŞMEDİ** · geçici sonda betiklerinin hepsi silindi.

---

## 4. Riskler

1. **Kapı artık git indeksine bağlı.** `git ls-files` başarısız olursa tüm ağaca geri düşer
   (fazla tarar, hiç taramamaz) ve yeni test `TRACKED`'ın boş olmadığını doğrular — ama bu, testin
   bir alt süreç çağırdığı anlamına gelir (~17 ms ölçüldü). Bilinçli takas: alternatif, kapının
   rengini başkasının yerel çöpüne bağlamak.
2. **Kapsam genişledi, gürültü de genişleyebilir.** `prisma/` + `scripts/` altında bugün başka
   ihlal yok, ama bu köklerde çalışan bir ajan artık kapıyı kırabilir. Kastedilen davranış bu.
3. **Bilinen sınır aynen duruyor** (ex-en/TASK-MTS8002I6YD3L): kısayol özellikler
   (`data: { tenantId, title }`) `key:` jetonu taşımadığı için görünmüyor. Genişletilen köklerde
   de görünmüyor; ayrı kart.
4. **Seed 184 satır yazıyor ve `demo` kiracısı yaratıyor.** Ölçümden sonra tabana geri konuldu,
   ama koşturan herkes bunu bilerek koşmalı — paylaşılan dev DB'de e2e koşan ajan varken sürpriz olur.

---

## 5. Açık sorular / ilgisiz kusurlar (BENİM DEĞİL — kart gereği adıyla listeleniyor)

### 5.1 `scripts/_cs-st6-probe3.ts` — hayalet sütun, gerçek kusur
```
prisma.moduleState.findMany({ select: { tenantId: true, moduleId: true, state: true } })
                                                                      ^^^^^
model ModuleState { … status ModuleStatus … }      // `state` diye bir sütun yok
```
Koştuğu an `PrismaClientValidationError`. Dosya **takipsiz**: customer-support'un TASK-MTSJJOR63M63R
sondası. Düzeltmedim (kart öyle diyor) ve takipsiz olduğu için kapı da onu görmüyor — ama sahibi
onu commit'lemeye kalkarsa kapı **kırmızıya döner**. Sahibi ya `status` yapmalı ya dosyayı silmeli.

### 5.2 `prisma/seed-m6-evaluations.ts` hiç koşturulmamış görünüyor
Prisma 7 altında istemcinin **kurulamaması** (§2.3), dosyanın bu bağımlılık sürümünde bir kez bile
çalıştırılmadığını gösteriyor. Başlığındaki `npx ts-node` kullanımı da geçersizdi (`ts-node`
bağımlılık değil, repo `tsx` kullanıyor).

### 5.2b `prisma/seed-templates.ts` — AYNI kusur, düzeltilmedi
```
prisma/seed-templates.ts:9  import { PrismaClient } from '@prisma/client';
prisma/seed-templates.ts:10 const prisma = new PrismaClient();
```
Prisma 7'de kurulumda `PrismaClientInitializationError` ile patlar; `prisma/seed.ts`'e bağlı
değil (`NOT WIRED IN`), yani yalnız elle koşturulur ve o an ölür. Kartın hedef dosyası değil,
kural gereği **düzeltmedim** — düzeltmesi tek satır: `import { prisma } from '../src/lib/db'`.
Takipli `scripts/` altında bu kalıptan başka örnek yok (`grep` → `NONE`).

### 5.3 `pnpm typecheck` ve `pnpm test` HEAD'de kırmızı (ikisi de başkasının aktif işi)
70 tsc hatası (ex-en, TASK-MTSJHTJZSCILI) + 7 vitest hatası (blok-zincir-denet-i, TASK-MTSJH8NMAXPRM).
İkisi de commit'lenmemiş çalışma ağacı durumu; §2.6'da attribution kanıtı var. `pnpm gate`'i bir
bütün olarak yeşile çeviremem, o iki kart kapanmadan.

### 5.4 `vitest.config.mts:8` deprecated `__dirname` (ex-en §5.4) — hâlâ duruyor, her koşuda uyarı basıyor.

---

## 6. Sonraki adım

1. customer-support: `scripts/_cs-st6-probe3.ts` (`state` → `status`) ya da sil — commit'lenirse kapı kırılır.
2. `prisma/seed-templates.ts` (§5.2b) — tek satırlık adaptör düzeltmesi.
3. Kapsamı `tests/` e2e fikstürlerine de genişletmek: `tests/e2e/*.spec.ts` doğrudan Prisma yazıyor
   (typecheck çıktısındaki `Role`/`ModuleStatus` hataları oradan) ve hiçbir şema kapısı onlara bakmıyor.
   `listFiles` `.test.ts` atlıyor, `.spec.ts` atlamıyor — ayrı kart, ölçülmeli.
4. Kısayol özellik körlüğü (§4.3) — bugün genişletilen köklerdeki write gövdelerinin bir kısmı hâlâ görünmez.

---

## 7. Definition of Done

- [x] Tarayıcı **yeniden yazılmadı**; yalnız kapsamı `prisma/` + `scripts/`'e genişletildi (§1.1)
- [x] **RED**: genişletilmiş kapı seed'i düşürdü, kırmızı çıktı raporda (§2.1)
- [x] **GREEN**: seed şemaya uyduruldu, yeşil çıktı raporda (§2.2)
- [x] Seed **gerçekten koşturuldu**; yazılan satır sayısı raporda (**184**, model model dökümü §2.3)
- [x] Düzeltmeden önceki iki gerçek çalışma-zamanı hatası da kanıt olarak alındı (§2.3)
- [x] Genişletilen köklerin canlı olduğu **mutasyonla** kanıtlandı; mutasyon geri alındı (§2.4)
- [x] Kapsam genişlemesinin bulduğu başka dosyadaki kusur **düzeltilmedi**, adıyla listelendi (§5.1)
- [x] `src/types/prisma-override.d.ts`'ye dokunulmadı (§3)
- [x] Değiştirdiğim dosyalarda lint 0, tsc 0, hedef test 16/16 yeşil (§2.6)
- [x] Kalan kırmızılar başka ajanların commit'lenmemiş işine **kanıtla** atfedildi (§2.6, §5.3)
- [x] Veritabanı ölçümden sonra tabanına geri kondu; geçici sonda betikleri silindi (§2.3, §3)
- [x] Sonuç dosyası + dev commit
