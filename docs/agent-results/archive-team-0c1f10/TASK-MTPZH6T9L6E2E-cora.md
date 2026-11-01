# TASK-MTPZH6T9L6E2E — M6.1 Evaluator Lens: Data Model & Schema

**Ajan:** cora-0c1f10 (Backend Mühendisi) · **Sprint:** S9 · **Epik:** M6 Evaluator Lens
**Tarih:** 2026-09-06 · **Branch:** `dev`

---

## 1. Ne yapıldı

### Kilit tasarım kararı: `Evaluation` YENİDEN YAZILMADI, GENİŞLETİLDİ

Şemada zaten **canlı bir `Evaluation` tablosu vardı** — `Opportunity` üzerinde tek-okuyucu
merceği (`readerType` = `HUMAN` | `AI`, `excellence`/`impact`/`implementation` float'ları),
`src/modules/m6/server/actions.ts` (`generateAiEvaluation`, `saveHumanEvaluation`) ve
`src/actions/user/export-data.ts` tarafından kullanılıyor. Görev metni ise `Proposal`
üzerinde çok-değerlendiricili bir panel tarif ediyordu.

Tabloyu görevdeki şekle göre yeniden yazmak mevcut kodu ve KVKK export akışını kırardı.
Bunun yerine **additive genişletme** yaptım: tek tablo `readerType` ile iki şekli taşıyor.

| readerType | Bağlam | Alanlar |
|---|---|---|
| `HUMAN` \| `AI` | v1.0 tek-okuyucu, `Opportunity` üzerinde | `excellence`, `impact`, `implementation`, `weaknesses`, `calibration` |
| `PANEL` | v1.1 panel, `Proposal` üzerinde | `proposalId`, `status`, `avgScore` + `Reviewer`/`Criterion`/`Score` |

Eklenen v1.1 sütunlarının **tamamı nullable ya da varsayılanlı**; `excellence`/`impact`/
`implementation`/`readerType` sütunlarına DEFAULT eklendi ki bir PANEL satırı onları
atlayabilsin. Hiçbir sütun düşürülmedi, hiçbir satır yeniden yazılmadı.

### Yeni tablolar
`Reviewer` (panel koltuğu), `Criterion` (ağırlıklı eksen), `Score` (not) — üçü de
`tenantId` taşır ve `tenant_isolation` RLS politikasıyla korunur.

### 🔴 Yan bulgu: `withTenant()` BOZUKTU — düzeltildi

Çalışma zamanı doğrulaması sırasında `src/lib/db.ts:36` içindeki `withTenant()`
sarmalayıcısının **her çağrıda patladığını** buldum:

```
Raw query failed. Code: `42601`. Message: `syntax error at or near "$1"`
```

Sebep: `` tx.$executeRaw`SET LOCAL app.tenant_id = ${tenantId}` `` — Postgres'te `SET`
**bind parametresi kabul etmez**, `$executeRaw` ise şablon değişkenini daima
parametreleştirir. Yani RLS bağlamını kuran tek fonksiyon hiç çalışmıyordu; henüz
çağıranı olmadığı için fark edilmemişti (CLAUDE.md §1 tüm sorguların buradan geçmesini
şart koşuyor, M6.2/M6.3 de bunu kullanacak).

Düzeltme — `set_config(..., is_local => true)` parametreleştirilebilir ve işlem-yereldir,
`SET LOCAL` ile aynı semantik; tenant id bağlı değer olarak kalır, string'e gömülmez:

```ts
await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
```

Bu benim görevimin dışındaydı ama M6 epiğinin tamamını bloke ediyordu ve tek satırlık,
enjeksiyona kapalı bir düzeltmeydi. `src/lib/db.ts` bana devredilmeden önce
değiştirilmemişti (`git status` temizdi) — hata bana ait değil.

---

## 2. Kanıt

### 2.1 Migration iki kez koştu — idempotent

```
########## RUN 1 ##########
ALTER TABLE / ALTER TABLE / ALTER TABLE / ALTER TABLE
DO / CREATE INDEX / CREATE INDEX
CREATE TABLE / DO / CREATE INDEX / CREATE INDEX / CREATE INDEX
CREATE TABLE / DO / CREATE INDEX / CREATE INDEX
CREATE TABLE / DO / CREATE INDEX / CREATE INDEX / CREATE INDEX
NOTICE:  policy "tenant_isolation" for relation "Reviewer" does not exist, skipping
COMMIT
EXIT_RUN1=0

########## RUN 2 (idempotency) ##########
NOTICE:  relation "Reviewer_evaluationId_userId_key" already exists, skipping
NOTICE:  relation "Criterion" already exists, skipping
NOTICE:  relation "Score" already exists, skipping
NOTICE:  relation "Score_reviewerId_criterionId_key" already exists, skipping
COMMIT
EXIT_RUN2=0
```

İkinci koşu hatasız (exit 0) ve tamamen no-op.

### 2.2 Şema ↔ DB uyumu (elle yazılan SQL Prisma modeliyle birebir)

```
$ npx prisma db push --schema prisma/schema.prisma
Datasource "db": PostgreSQL database "fabrika", schema "public" at "localhost:5432"

The database is already in sync with the Prisma schema.
```

### 2.3 Tablolar mevcut

```
$ psql -c '\dt "Evaluation"|"Reviewer"|"Criterion"|"Score"'
 Schema |    Name    | Type  |  Owner
--------+------------+-------+---------
 public | Criterion  | table | fabrika
 public | Evaluation | table | fabrika
 public | Reviewer   | table | fabrika
 public | Score      | table | fabrika
(4 rows)
```

### 2.4 `Score` yapısı — index, FK, CHECK, RLS

```
$ psql -c '\d "Score"'
   Column    |              Type              | Nullable |      Default
-------------+--------------------------------+----------+-------------------
 id          | text                           | not null |
 tenantId    | text                           | not null |
 reviewerId  | text                           | not null |
 criterionId | text                           | not null |
 score       | integer                        | not null |
 comment     | text                           |          |
 submittedAt | timestamp(3) without time zone |          |
 createdAt   | timestamp(3) without time zone | not null | CURRENT_TIMESTAMP
 updatedAt   | timestamp(3) without time zone | not null | CURRENT_TIMESTAMP
Indexes:
    "Score_pkey" PRIMARY KEY, btree (id)
    "Score_criterionId_idx" btree ("criterionId")
    "Score_reviewerId_criterionId_key" UNIQUE, btree ("reviewerId", "criterionId")
    "Score_tenantId_idx" btree ("tenantId")
Check constraints:
    "Score_score_check" CHECK (score >= 1 AND score <= 5)
Foreign-key constraints:
    "Score_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"(id) ON UPDATE CASCADE ON DELETE CASCADE
    "Score_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Reviewer"(id) ON UPDATE CASCADE ON DELETE CASCADE
Policies (forced row security enabled):
    POLICY "tenant_isolation"
      USING (("tenantId" = current_setting('app.tenant_id'::text, true)))
      WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)))
```

### 2.5 Kısıtlar gerçekten uyguluyor (5/5 doğru davrandı)

```
=== T1: score=6 must be REJECTED ===
ERROR:  new row for relation "Score" violates check constraint "Score_score_check"
=== T2: score=0 must be REJECTED ===
ERROR:  new row for relation "Score" violates check constraint "Score_score_check"
=== T3: score=5 must be ACCEPTED ===
INSERT 0 1
=== T4: duplicate (reviewer,criterion) must be REJECTED ===
ERROR:  duplicate key value violates unique constraint "Score_reviewerId_criterionId_key"
DETAIL:  Key ("reviewerId", "criterionId")=(demo-reviewer-alice, demo-criterion-innovation) already exists.
=== T5: duplicate reviewer seat must be REJECTED ===
ERROR:  duplicate key value violates unique constraint "Reviewer_evaluationId_userId_key"
DETAIL:  Key ("evaluationId", "userId")=(demo-evaluation-panel-1, demo-user-alice) already exists.
```

### 2.6 Cascade silme

```
before_delete: reviewers=1 criteria=1 scores=1
DELETE 1                         -- DELETE FROM "Evaluation"
after_delete:  reviewers=0 criteria=0 scores=0
ROLLBACK
```

### 2.7 RLS gerçekten izole ediyor — NOBYPASSRLS rolüyle kanıt

`fabrika` rolü SUPERUSER + BYPASSRLS olduğu için politikalar onun üstünde uygulanmaz.
Gerçek kanıt için geçici `m6_rls_probe` (NOSUPERUSER, NOBYPASSRLS) rolü açıp test ettim:

```
=== probe: tenant context = demo-tenant (own rows) ===
visible_reviewers=2
visible_criteria=4

=== probe: tenant context = other-tenant (must see ZERO) ===
visible_reviewers=0
visible_criteria=0

=== probe: cross-tenant INSERT must be BLOCKED by WITH CHECK ===
ERROR:  new row violates row-level security policy for table "Criterion"

=== cleanup probe role ===
DROP ROLE
probe_role_exists=0
```

Okuma izolasyonu **ve** `WITH CHECK` yazma koruması ikisi de çalışıyor. Probe rolü silindi.

### 2.8 Seed iki kez koştu — satır sayıları birebir aynı

```
===== COUNTS AFTER SEED RUN 1 =====        ===== COUNTS AFTER SEED RUN 2 =====
Evaluation=1                                Evaluation=1
Reviewer=2                                  Reviewer=2
Criterion=4                                 Criterion=4
Score=0                                     Score=0
Proposal=3                                  Proposal=3
```

Seed içeriği:

```
           id            |   proposalId    | readerType | status | avgScore
-------------------------+-----------------+------------+--------+----------
 demo-evaluation-panel-1 | demo-proposal-3 | PANEL      | draft  |

         id          |     userId      |    role     | status
---------------------+-----------------+-------------+---------
 demo-reviewer-alice | demo-user-alice | evaluator   | pending
 demo-reviewer-bob   | demo-user-bob   | coordinator | pending

     name      | weight | order          weight_sum
---------------+--------+-------        ------------
 Innovation    |    0.3 |     1             1.0000
 Feasibility   |    0.2 |     2
 Impact        |    0.3 |     3
 Communication |    0.2 |     4
```

Ağırlık toplamı tam **1.0000**.

### 2.9 Çalışma zamanı: `EvaluationDTO` canlı DB'den `withTenant()` üzerinden kuruluyor

```
EvaluationDTO built from live DB via withTenant():
{
  "id": "demo-evaluation-panel-1",
  "proposalId": "demo-proposal-3",
  "opportunityId": "demo-opp-3",
  "status": "draft",
  "avgScore": null,
  "reviewers": [
    { "id": "demo-reviewer-alice", "userId": "demo-user-alice", "userName": "Alice",
      "role": "evaluator", "status": "pending" },
    { "id": "demo-reviewer-bob", "userId": "demo-user-bob", "userName": "Bob",
      "role": "coordinator", "status": "pending" }
  ],
  "criterions": [
    { "id": "demo-criterion-innovation",    "name": "Innovation",    "weight": 0.3, "order": 1 },
    { "id": "demo-criterion-feasibility",   "name": "Feasibility",   "weight": 0.2, "order": 2 },
    { "id": "demo-criterion-impact",        "name": "Impact",        "weight": 0.3, "order": 3 },
    { "id": "demo-criterion-communication", "name": "Communication", "weight": 0.2, "order": 4 }
  ]
}
ESR total on linked proposal: 3.5
legacy HUMAN/AI evaluations still queryable: 0
```

Tipler DB şekliyle birebir örtüşüyor. `withTenant()` düzeltmesinden **önce** bu script
`42601 syntax error at or near "$1"` ile patlıyordu; düzeltmeden sonra geçti.

### 2.10 Geri uyum regresyon testi — v1.0 yazma yolu bozulmadı

`src/modules/m6/server/actions.ts`'in geçtiği alan kümesiyle birebir insert:

```
v1.0 create OK -> {
  id: 'cmtq0mtva00007fxktptrzcbv',
  readerType: 'AI',
  excellence: 4.2,
  proposalId: null,
  status: 'draft',
  avgScore: null
}
new columns defaulted correctly: true
count before=1 after=1 (restored: true)
```

Yeni sütunlar doğru varsayılanlarla doldu, test satırı silindi, sayım geri geldi.

### 2.11 typecheck / lint

```
$ pnpm typecheck
src/lib/billing.ts(103,21): error TS7006: Parameter 'plan' implicitly has an 'any' type.

$ pnpm typecheck | grep -E "src/modules/m6/types.ts|prisma/seed.ts"
  (none — my files are clean)

$ npx eslint src/modules/m6/types.ts prisma/seed.ts
EXIT=0
```

Kalan tek typecheck hatası `src/lib/billing.ts:103` — **benim değil**: başka bir ajanın
commit edilmemiş WIP'i (`git diff --stat src/lib/billing.ts` → 41 eklenen satır, ben
dokunmadım), `getAllPlans()` içinde, M6 ile ilgisi yok (`grep -c "Evaluation\|Reviewer\|
Criterion\|Score" src/lib/billing.ts` → 0). Devir özetimde de bu dosya zaten hatalı
olarak kayıtlıydı.

`src/lib/db.ts:19`'daki `no-explicit-any` lint hatası da pre-existing — benim diff'im
yalnızca 35-40. satırlara dokunuyor.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `prisma/schema.prisma` | `Evaluation` additive genişletme + `Reviewer`/`Criterion`/`Score` modelleri + `User.reviewerSeats`, `Proposal.evaluations` ters ilişkileri |
| `prisma/migrations/add-m6-evaluator-lens.sql` | **YENİ** — idempotent forward migration (165 satır), RLS dahil |
| `prisma/migrations/add-m6-evaluator-lens.down.sql` | **YENİ** — geri alma yolu (yıkıcı, açık onay + `pg_dump` şartı yazılı) |
| `prisma/rls.sql` | `Reviewer`, `Criterion`, `Score` kiracıya-özel tablo listesine eklendi |
| `prisma/seed.ts` | `seedM6EvaluatorLens()` eklendi + `main()`'den çağrıldı — ⚠️ **COMMIT EDİLMEDİ**, aşağıya bak |
| `src/modules/m6/types.ts` | **YENİ** — DTO'lar, durum birlikleri, `DEFAULT_CRITERIA`, `isScoreValue()` |
| `src/lib/db.ts` | 🔴 `withTenant()` düzeltmesi (`SET LOCAL` → `set_config`) |
| `docs/DATA_MODEL.md` | §8.1 M6 bölümü eklendi |

### ⚠️ `prisma/seed.ts` bilerek commit EDİLMEDİ

Dosya çalışma ağacında hazır ve doğrulandı (§2.8), ama **stage'den çıkardım**. Sebep:
başka bir ajanın E10 çalışması sırasında bu dosyaya altı import eklenmiş ve o altı modülün
**hiçbiri git'te takipli değil**:

```
prisma/seed-tenant-workspace.ts          UNTRACKED
prisma/seed-calls.ts                     UNTRACKED
prisma/seed-opportunities.ts             UNTRACKED
prisma/seed-gate-decisions.ts            UNTRACKED
prisma/seed-proposals.ts                 UNTRACKED
prisma/seed-efforts.ts                   UNTRACKED
```

`seed.ts`'i tek başıma commit etseydim `dev`'i checkout eden herkeste seed, var olmayan
altı dosyayı import edip **kırılırdı**. E10 ajanı kendi modüllerini commit ederken bu
dosya da onunla birlikte gitmeli — `seedM6EvaluatorLens()` bloğum içinde duruyor.

`prisma/schema.prisma` ilk turda `prisma format` ile bütünüyle yeniden hizalanmıştı
(~900 satır gürültü); eşzamanlı çalışan ajanlarla çakışmasın diye HEAD'den yeniden
kurup yalnız anlamsal bloğu uyguladım — diff artık **73 ekleme / 5 silme**.

---

## 4. Riskler

1. **🔴 Yerel `fabrika` rolü SUPERUSER + BYPASSRLS** (`super=true bypassrls=true`).
   Politikalar duruyor ama bu rol üzerinde uygulanmıyor. Ben geçici NOBYPASSRLS probe
   rolüyle izolasyonu kanıtladım (§2.7), fakat **uygulama kodu hâlâ bypass eden rolle
   bağlanıyor** — yani M6.2/M6.3 yerelde "çalışıyor" derken RLS'i gerçekten test etmiş
   olmayacak. Takip görevi: **TASK-MTQ0BIV9UXVRU** (NOBYPASSRLS `fabrika_app` rolü),
   hâlâ backlog'da ve atanmamış.
2. **`prisma/migrations/` gerçek bir Prisma migration dizini değil** — zaman damgası
   öneki ve `migration_lock.toml` yok, şema `db push` ile kuruluyor. Benim dosyam bu
   mevcut deseni izliyor (elle `psql -f` ile uygulanır). Prod'a çıkmadan önce baseline
   migration gerekiyor; `pnpm db:migrate` (prisma migrate dev) bu depoda çalışmıyor.
   **Bu yüzden DoD'daki `pnpm db:migrate` adımını `psql -f` + `prisma db push` drift
   kontrolü ile ikame ettim** (§2.1, §2.2) — sonuç aynı, kanıt daha güçlü.
3. **`prisma/seed.ts` eşzamanlı olarak başka bir ajan tarafından düzenleniyor.**
   Çalışırken iki kez üzerine yazıldı: (a) `seedDemoTenant()` çağrısı `main()`'den
   kaldırılıp E10 seed fonksiyonlarıyla değiştirildi — bu benim M6 bloğumu ölü koda
   düşürdü, ayrı `seedM6EvaluatorLens()` fonksiyonuna taşıyıp `main()`'e bağladım;
   (b) import satırım silindi, geri ekledim. **`seedDemoTenant()` şu anda ölü kod** —
   tanımlı ama hiç çağrılmıyor. Benim işim değil, ama birinin karar vermesi gerek.
4. `Score` tablosundaki 1..5 CHECK'i Prisma üretemiyor; yalnızca migration dosyasında
   yaşıyor. `prisma migrate reset` / sıfırdan `db push` sonrası bu dosya tekrar
   koşulmazsa CHECK **kaybolur**. `src/modules/m6/types.ts` içindeki `isScoreValue()`
   uygulama tarafı kuşağıdır, ama tek savunma hattı olarak bırakılmamalı.

---

## 5. Açık sorular

1. Görev metni `Reviewer` için "RLS via evaluation" diyordu; ben depodaki mevcut desene
   uyup (`prisma/rls.sql` düz `tenantId` sütunu bekliyor) üç tabloya da `tenantId`
   koydum. Onay bekliyorum — alternatif JOIN'li politika daha yavaş ve mevcut
   `scripts/check-rls.ts` denetimini geçmez.
2. Görev "alice@fabric, bob@fabric" diyordu; E10 seed'i zaten `demo-user-alice` /
   `demo-user-bob` (`alice@fabrika.test`, `bob@fabrika.test`) oluşturmuş, onları
   kullandım. Yeni kullanıcı uydurmadım.
3. Görev "1 evaluation (Horizon-CL5-2024-01 fake)" diyordu; `Proposal.opportunityId`
   `@unique` olduğu ve E10 seed'i `demo-opp-3` üzerine `demo-proposal-3` (GFLEX,
   HORIZON-CL5-2026-09-D4-03) koyduğu için sahte bir çağrı yaratmak yerine onu kullandım.
   ESR karşılaştırması için `esrScores.total = 3.5` ekledim (**yalnızca alan boşsa**).
4. `Evaluation.userId` alanını görevdeki `evaluatorUserId` yerine korudum (mevcut sütun).
   İsim değişikliği istenirse ayrı bir rename migration'ı gerekir.

---

## 6. Sonraki adım

- **M6.3 (TASK-MTPZHMSPMDA66)** artık koşulabilir: `DEFAULT_CRITERIA` ağırlıkları,
  `Criterion.weight`, `Proposal.esrScores.total = 3.5` ve çalışan `withTenant()` hazır.
- **M6.2 (TASK-MTPZHGD3S6G3C)** `EvaluationDTO` / `ReviewerDTO` / `CriterionDTO`
  sözleşmelerini `src/modules/m6/types.ts`'ten alsın; yeniden tanımlamasın.
- **M6.4 (TASK-MTPZHVY46L1MR)** `src/modules/m6/manifest.ts`'i güncelleyecek —
  şu an `requires: []`, `tables` alanı yok. Ben dokunmadım (o görevin kapsamı).
- **TASK-MTQ0BIV9UXVRU** (NOBYPASSRLS uygulama rolü) birine atanmalı — bu yapılmadan
  hiçbir ajanın "RLS çalışıyor" iddiası yerelde geçerli değil.
- `seedDemoTenant()` ölü kodu: silinsin mi, yoksa `main()`'e geri mi bağlansın?
