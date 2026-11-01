# TASK-MTQ61HQDX035M — Çalışma ağacı temizliği (DALGA-1 kilit taşı)

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi) · **Sprint:** S8 · **Branch:** `dev`
**Başlangıç HEAD:** `4bee05b` · **Bitiş HEAD:** `97b89e2` · **Tarih:** 2026-09-06

---

## 1. Ne yapıldı

Commit'siz duran 15 değişmiş + 45 izlenmeyen dosya envanterlendi, mantıksal gruplara
ayrıldı ve **10 ayrı commit** olarak `dev`'e alındı. `git add -A` hiç kullanılmadı; her
commit öncesi `git diff --cached` ile sahnelenen içerik doğrulandı, sonrasında `git show
HEAD:<yol>` ile HEAD'e gerçekten indiği kontrol edildi (paralel ajan dosya yarışı —
`.agentspace/memory/shared/fabrika-parallel-agent-file-race.md`).

| # | Commit | Grup | Dosya |
|---|---|---|---|
| 1 | `d04e657` | Çöp-artık temizliği + `.gitignore` | 11 |
| 2 | `dd17036` | `src/lib/env.ts` — boş opsiyonel URL düzeltmesi | 1 |
| 3 | `1c54fa6` | prefer-const (stripe-sync, M8 matching, pipeline actions) | 3 |
| 4 | `4829804` | M6 evaluator paneli (server + UI + i18n) | 6 |
| 5 | `ee124a2` | E10.3 KVKK/GDPR — legal sayfalar, DPA, `/api/user/*` | 9 |
| 6 | `b4cf47f` | Marketing landing/pricing + public çağrı sayfaları | 4 |
| 7 | `3c6c4d1` | 5 adet E10 seed modülü | 5 |
| 8 | `a3649ef` | a11y — erişilebilir ad + kontrast | 3 |
| 9 | `65b2ab7` | docs/agent-results + DevOps Postgres rehberi | 20 |
| 10 | `97b89e2` | .agentspace/memory notları | 11 |

Toplam: **73 dosya, +5632 / −28820**.

### Commit EDİLMEYEN tek dosya — ve nedeni

`prisma/migrations/add_soft_delete/migration.sql` **silindi, commit edilmedi.** Gerekçe
ölçülmüş, tahmin değil:

1. Bu repo Prisma Migrate kullanmıyor. `prisma/migrations/` düz, elle yazılmış
   `add-<ad>.sql` + `add-<ad>.down.sql` çiftlerinden oluşuyor; şema `prisma db push` ile
   senkronlanıyor. `add_soft_delete/` klasörü Prisma'nın zaman damgalı biçimini de
   tutturmuyor, repo biçimini de.
2. **İçeriği zaten commit'li ve üstün bir sürümün eksik kopyası.** `add-soft-delete.sql`
   (commit `3a7a28c`) 8 tabloyu, 8 indeksi ve `IF NOT EXISTS` idempotency'sini kapsıyor
   ve `add-soft-delete.down.sql` geri-alma yolu var. Silinen dosya yalnız `User`'ı,
   `IF NOT EXISTS` olmadan (**iki kez koşarsa patlar**), geri-alma dosyası olmadan
   kapsıyordu.
3. **Aktif zarar veriyordu:** varken `prisma migrate status` onu "uygulanmamış migration"
   sayıyordu (kanıt §2.6). Biri `pnpm db:migrate` koşsaydı Prisma bu idempotent-olmayan
   dosyayı uygulamaya ya da `db push` ile yönetilen veritabanını **baseline için
   sıfırlamaya** çalışırdı.

Migration ELLE UYDURULMADI, düzeltilmedi — silinen dosyanın tam içeriği §5'te aynen
duruyor, geri gerekirse oradan alınır.

---

## 2. Kanıt (kopyalanmış komut çıktısı)

### 2.1 Taban çizgisi (iş öncesi, HEAD=`4bee05b`)

```
$ pnpm typecheck
$ tsc --noEmit
TYPECHECK EXIT=0

$ pnpm build
BUILD EXIT=0
```

### 2.2 Son durum — typecheck + build

```
$ pnpm typecheck
$ tsc --noEmit
TYPECHECK EXIT=0

$ pnpm build
✓ Compiled successfully in 872ms
BUILD EXIT=0
```

Build çıktısında yeni rotaların hepsi göründü:

```
├ ƒ /api/user/export
├ ƒ /api/user/export-data
├ ƒ /api/user/request-deletion
├ ƒ /calls/[region]
├ ƒ /compliance/dpa
├ ƒ /pricing
├ ƒ /privacy
└ ƒ /terms
```

### 2.3 pnpm test — 4 kırmızı, taban çizgisiyle aynı (regresyon YOK)

```
$ pnpm test
TEST EXIT=1
 Test Files  3 failed | 41 passed (44)
      Tests  4 failed | 317 passed (321)
   Duration  13.43s

FAIL  tests/k1-daily-calls.test.ts > K1 Adapters > SediaAdapter > SediaTopicSchema should validate topic structure     (5003ms — ağ timeout)
FAIL  tests/k1-daily-calls.test.ts > K1 Adapters > SediaAdapter > should return empty array on fetch failure gracefully (5003ms — ağ timeout)
FAIL  tests/sedia-adapter.test.ts  > should format framework programme filters correctly                                (10002ms — ağ timeout)
FAIL  tests/rls.spec.ts            > Row Level Security (RLS) > Tenant A cannot see Tenant B workspaces                 (28ms)
```

Dördü de bilinen taban çizgisi (`.agentspace/memory/shared/fabrika-known-failing-tests.md`);
3'ü SEDIA canlı API'sine giden ağ testi, 1'i yerel DB'nin BYPASSRLS rolüyle bağlanmasından
kaynaklanan RLS testi. **4'ü aşmadı.**

### 2.4 git log — yeni commit'ler

```
$ git log --oneline 4bee05b..HEAD
97b89e2 chore(memory): agent and shared memory notes from the E10/E11 wave
65b2ab7 docs(agent-results): S8 completion reports, DevOps Postgres setup, run log
a3649ef fix(a11y): accessible names for icon controls, contrast on the accent CTAs
3c6c4d1 chore(db): add the five E10 seed modules prisma/seed.ts already imports
b4cf47f feat(e10): marketing landing, pricing and public open-call pages
ee124a2 feat(e10): KVKK/GDPR legal pages, DPA and data-subject endpoints
4829804 feat(m6): evaluator panel scoring — saveEvaluation action, UI and i18n keys
1c54fa6 refactor(lint): prefer const for bindings that are never reassigned
dd17036 fix(env): treat blank optional URL variables as unset and name the offender
d04e657 chore(repo): drop one-off codemod scripts, tsc trace dump and orphan .bak

$ git diff --shortstat 4bee05b..HEAD
 73 files changed, 5632 insertions(+), 28820 deletions(-)
```

`git push` yapılmadı, `main`'e dokunulmadı, rebase/force yok.

### 2.5 git status --short — son hâl

```
$ git status --short --untracked-files=all
?? .agentspace/memory/shared/fabrika-docker-broken-symlink.md
```

Devraldığım 60 dosyanın tamamı temizlendi. Kalan tek satır, ben çalışırken **başka bir
ajanın** yazdığı yeni bir hafıza dosyası — sahibi aktif olduğu için dokunulmadı (bkz. §4).

### 2.6 Postgres — ayakta, ölçüldü

`docker` ve `pg_isready` komutları bu makinede PATH'te YOK, ama Docker Desktop 5432'yi
dinliyor ve Prisma bağlanıyor:

```
$ command -v psql   → psql YOK
$ command -v docker → docker YOK
$ lsof -nP -iTCP:5432 -sTCP:LISTEN
com.docke 1447 macbook  102u  IPv6 ... TCP *:5432 (LISTEN)

$ npx prisma db execute --file <select 1>
Script executed successfully.
```

**`prisma migrate status` — bogus klasör VARKEN:**

```
1 migration found in prisma/migrations
Following migration have not yet been applied:
add_soft_delete
```

**Klasör silindikten SONRA:**

```
No migration found in prisma/migrations
The current database is not managed by Prisma Migrate.
```

→ Veritabanı `db push` ile yönetiliyor. **`pnpm db:migrate` (= `prisma migrate dev`)
KOŞULMADI**: Prisma Migrate ile yönetilmeyen bir veritabanında bu komut baseline için
sıfırlama önerir/uygular — açık onay olmadan koşulacak yıkıcı bir işlem. Engel adıyla
raporlandı, uydurulmadı.

### 2.7 `pnpm db:seed` — çalışıyor ve idempotent (İKİ KEZ koşuldu)

Seed modülleri commit edilmeden önce `prisma/seed.ts` (commit'li) onları import ediyordu
ama dosyalar repoda yoktu → **temiz bir klondan `pnpm db:seed` ilk import'ta patlıyordu.**
Commit `3c6c4d1` bu kırığı kapattı.

```
$ pnpm db:seed
SEED RUN1 EXIT=0
Seeding Database...
Tenant and users seeded (Fabrika Beta, 10 seats + superadmin).
Calls and topics seeded (20 calls).
Opportunity seeded: District renovation pilot — İzmir (stage: G0)
Opportunity seeded: Industrial waste-heat recovery consortium (stage: G1)
Opportunity seeded: Grid flexibility platform (stage: G2)
Opportunity seeded: Citizen engagement for climate-neutral Bursa (stage: G3)
Opportunity seeded: SME-led R&D innovation — Eurostars (stage: G4)
Opportunities seeded (5 opportunities).
Gate decisions seeded (15 decisions).
Proposals seeded (3 proposals).
Efforts seeded (10 efforts).
M6 evaluator lens seeded (1 evaluation, 2 reviewers pending, 4 criteria, 0 scores).
✓ E11.2 feedback seed complete
Seeding completed with E10 data.

$ pnpm db:seed   # ikinci koşu
SEED RUN2 EXIT=0
```

**Değişmezlik doğrulaması — önce/sonra satır sayıları:**

| Tablo | ÖNCE | RUN 1 sonrası | RUN 2 sonrası |
|---|---|---|---|
| Call | 26 | 26 | 26 |
| Topic | 35 | 35 | 35 |
| Opportunity | 25 | 25 | 25 |
| GateDecision | 35 | 35 | 35 |
| Proposal | 23 | 23 | 23 |
| Effort | 10 | 10 | 10 |
| User | 24 | 24 | 24 |
| Tenant | 12 | 12 | 12 |

Tek satır çoğalmadı → beş seed modülünün tamamı doğal anahtar üzerinden `upsert`
kullanıyor, iki-kez-koşma güvenli. Mevcut veri bozulmadı.

### 2.8 RLS

`pnpm db:rls` = `psql -f prisma/rls.sql`; **psql bu makinede yok:**

```
$ pnpm db:rls
sh: psql: command not found
[ELIFECYCLE] Command failed.
```

Aynı SQL Prisma üzerinden uygulandı (`rls.sql` idempotent: `DROP POLICY IF EXISTS` +
`CREATE POLICY`):

```
$ npx prisma db execute --file prisma/rls.sql
Script executed successfully.

$ pnpm rls:check
Found 37 tenant-scoped models requiring RLS policies:
AddOn, AiUsageLog, ApiKey, ApplicationPart, ApprovalRequest, AuditEvent, Claim,
ConceptNote, ConsortiumSeat, CreditLedger, Criterion, Effort, Evaluation, Evidence,
Feedback, FollowupDoc, GateDecision, Interaction, Invitation, MarketplaceListing,
MeetingBrief, Membership, ModuleState, Opportunity, PartnerOrg, Proposal, ProposalUsage,
Relationship, Reviewer, SavedSearch, Score, SeatCandidate, Subscription, TenantProfile,
TopicMatch, TtoPortfolioItem, Workspace

✅ SUCCESS: All 37 tenant-scoped models have RLS policies registered.
```

DB'de `tenant_isolation` politika sayısı önce 37, sonra 37 — sapma yok.

### 2.9 Güvenlik taraması (commit öncesi, tüm değişen küme)

Canlı anahtar / özel anahtar / bağlantı dizesi / kişisel veri taraması yapıldı. Bulgular:

- `scripts/stripe-sync.ts:5` — `process.env.STRIPE_SECRET_KEY || 'sk_test_mock'`; sabit
  bir yer tutucu, gerçek anahtar değil, üstelik benim diff'imde değil.
- `admin@yasinaslan.com.tr` — `auth.ts` içindeki demo süperadmin profili; **5 geçtiği
  yerin hepsi zaten HEAD'de**, bu commit'lerle gelmedi.
- `postgresql://fabrika:fabrika@localhost:5432/fabrika` —
  `shared/fabrika-runtime-verification-recipe.md` içinde, yerel geliştirme DSN'i, zaten
  HEAD'de.

Yeni sır ya da kişisel veri sızıntısı **yok**.

---

## 3. Değişen dosyalar

**Silinen (commit `d04e657` — hepsi git geçmişinden geri alınabilir):**
`fix-all-ts.py`, `fix-final-errors.py`, `fix-final-ts.py`, `fix-final.py`,
`fix-inngest.py`, `fix-ts.py`, `patch_schema.py`, `patch_schema_c.py`,
`resolution.log` (5.3 MB `tsc --traceResolution` dökümü),
`src/app/[workspace]/dashboard/page.tsx.bak` (ölü rota ağacının tek dosyasıydı).
`.gitignore`'a `fix-*.py`, `patch_schema*.py`, `resolution.log`, `*.bak` eklendi.

**Silinen, commit edilmeyen:** `prisma/migrations/add_soft_delete/migration.sql` (§1, §5).

**Eklenen/değişen:** yukarıdaki tabloda gruplandı; tam liste `git log --stat 4bee05b..HEAD`.

### `scratch/` — çöp DEĞİL, korundu

Görev metni `scratch/`'i çöp adayı saydı. Okudum: `dereference_node_modules.js` ve
`flatten_pnpm_standalone.js`, `next build` standalone çıktısındaki pnpm sembolik
bağlarını düzleştiren **gerçek dağıtım araçları** — Docker imajı üretiminde işe yarayan,
yeniden yazılması zahmetli bilgi taşıyorlar. Zaten commit'liler, 4 KB'lar ve hiçbir şeyi
kırmıyorlar. Silmedim; §6'da açık soru olarak bıraktım.

---

## 4. Riskler

1. **`EvaluationDashboard.tsx` bozuk — kullanılmadan önce düzeltilmeli.** `'use client'`
   bileşeni `prisma`'yı `@/lib/db`'den import edip `getPanelScoresForProposal(prisma, …)`
   çağırıyor. Prisma tarayıcıda çalışmaz, üstelik ham client `withTenant`'ı da atlıyor
   (CLAUDE.md kural 1). Şu an hiçbir rota render etmediği için build yeşil kalıyor.
   Kaybolmasın diye commit'lendi ve kusur commit mesajına yazıldı; **düzeltmedim** —
   başkasının kodu. M6 sahibine iş: server action ya da route handler arkasına alınmalı.
2. **`src/app/(marketing)/` ikinci sayfa ağacı büyüdü.** Bu commit'ler onu 4 dosya
   büyüttü. TASK-MTQ602Y8V5QOK zaten bu ağacı kaldırmak için açık; commit'leme kararı
   "kaybolmasın, dedup görevi geçmişten çalışsın" gerekçesiyle alındı.
3. **Sabit metin i18n ihlali.** Yeni marketing/legal sayfalarında ve
   `PublicNavbar`/`UserMenu`'deki a11y etiketlerinde metin `t()` yerine
   `isTr ? '…' : '…'` ile gömülü — CLAUDE.md kural 8'e aykırı. Desen bu dosyalarda zaten
   vardı; kapsam dışı bıraktım, TASK-MTQ602Y8V5QOK'a ait.
4. **Hard-coded renk.** `#003D5C` iki CTA'da satır içi `style` ile pinlenmiş. Kontrast
   düzeltmesi doğru ama tema token'ının dışına çıkıyor; `bg-accent` token'ı düzeltilirse
   bu satırlar geri alınmalı.
5. **Yerel DB'de RLS testi kırmızı** çünkü uygulama BYPASSRLS'li rolle bağlanıyor.
   Politikalar kayıtlı (37/37) ama yerelde etkisiz — CI'da doğrulanması gerekir.
6. **Ben çalışırken paralel ajan aktif.** `.agentspace/memory/shared/fabrika-docker-broken-symlink.md`
   çalışma ağacında yeni belirdi; sahibi hâlâ yazıyor olabileceği için ellemedim. Bu,
   "temiz ağaç" hedefinin bir sonraki dalgada tekrar bozulacağını gösteriyor.

---

## 5. Silinen migration'ın tam içeriği (geri-alma yolu)

Gerekirse aynen geri konabilsin diye:

```sql
-- Add soft-delete columns to User table
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP;
ALTER TABLE "User" ADD COLUMN "deletionReason" TEXT;

-- Create index for efficient queries (find active users only)
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- Add comment for clarity
COMMENT ON COLUMN "User"."deletedAt" IS 'Soft-delete timestamp. NULL = active user. TIMESTAMP = deleted user. Hard-delete after 30 days.';
COMMENT ON COLUMN "User"."deletionReason" IS 'Reason for deletion: user request, policy violation, etc.';
```

Geri koymak isteyen olursa: bu SQL'i değil, `prisma/migrations/add-soft-delete.sql`'i
kullanın — aynı işi idempotent, 8 tabloyu kapsayarak ve geri-alma dosyasıyla yapıyor.

---

## 6. Açık sorular

1. **`scratch/` nereye ait?** İki dosya gerçek standalone-deploy aracı ama `package.json`
   içinden çağrılmıyor. `scripts/` altına taşınıp bir `deploy:standalone` script'ine mi
   bağlanmalı, yoksa `scratch/` adı bilinçli mi? (Karar lideri: taşıma yol değiştirir,
   ben dokunmadım.)
2. **`pnpm db:rls` psql'e bağlı, psql bu makinede yok.** Script `prisma db execute --file
   prisma/rls.sql` olarak değiştirilsin mi? Aynı SQL'i çalıştırıyor, ek bağımlılık
   istemiyor. (DevOps kararı — `package.json` değişikliği kapsamım dışıydı.)
3. **`pnpm db:migrate` bu repoda anlamlı mı?** Veritabanı `db push` + elle yazılmış SQL
   ile yönetiliyor; `prisma migrate dev` sıfırlama önerir. Script kaldırılsın ya da
   `db push`'a mı bağlansın?
4. **`cora-0c1f10/inngest-setup-complete.md`** hafıza indeksinde var, dosya yok. Sahibi
   yazmayı unuttu mu, yoksa indeks satırı mı fazla?

---

## 7. Sonraki adım

- **DALGA-1 kilit taşı açıldı:** çalışma ağacı temiz, taban çizgisi korunuyor
  (typecheck 0, build 0, test 4 kırmızı ve hepsi bilinen). Diğer ajanlar başlayabilir.
- M6 sahibi: §4.1'deki `EvaluationDashboard` client-Prisma kusurunu kapatsın.
- TASK-MTQ602Y8V5QOK: `src/app/(marketing)/` ağacını ve gömülü `isTr ? …` metinlerini
  tekilleştirsin — artık hepsi geçmişte.
- DevOps (TASK-MTQ32X4CFRMR5): §6.2 ve §6.3'teki iki script kararını versin.

---

## Ek — rapor commit'lendikten sonraki ağaç durumu (dürüstlük notu)

§2.5'teki snapshot alındıktan sonra, ben raporu yazarken paralel bir ajan çalışmaya
devam etti ve ağaçta yeni satırlar belirdi:

```
$ git status --short --untracked-files=all   # 7d3b690 sonrası
 M docs/.agent-notifications
 M package.json
?? .agentspace/memory/shared/fabrika-docker-broken-symlink.md
?? prisma/rls-app-role-rollback.sql
?? prisma/rls-app-role.sql
?? scripts/setup-rls-role.ts
```

Bunların **hiçbiri bana devredilen 60 dosyalık envanterin parçası değil** — hepsi ben
çalışırken doğdu ve sahibi hâlâ aktif. Başkasının yarım işini commit'lememek için
dokunulmadı. Devraldığım kümenin tamamı `4bee05b..7d3b690` arasındaki 11 commit'te.

Yeşil kapı çıktıları (§2.2, §2.3) `97b89e2`, yani benim son kod commit'im anındaki
ağaca ait; yukarıdaki yeni dosyalar o ölçümden sonra geldi ve benim commit'lerimin
kapsamında değil.
