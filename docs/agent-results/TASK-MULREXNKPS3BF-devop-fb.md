# TASK-MULREXNKPS3BF — FB CI YEŞİL (devop-fb)

Repo: `/Users/macbook/alan/FONBRIDGE` · dal `dev` · GitHub `yaslan/fonbridge` · Tarih: 29.09.2026
Kök neden kaynağı: `docs/agent-results/TASK-MULQJZNB7U3QN-devop-fb.md` §2.4

**Sonuç: CI henüz YEŞİL DEĞİL.** CI yapılandırmasından gelen bütün hatalar kapandı. Koşu artık `Install → Validate → Generate → Prepare database → Lint → Typecheck` adımlarının hepsini geçiyor. Kırmızı kalan tek adım `Test`. Nedeni bir test dosyası ile şema arasındaki uyumsuzluk (§4). Kart gereği bu bir uygulama/test hatası; düzeltilmedi, dosya:satır ile raporlandı. Kapı gevşetilmedi: `skip` ve `continue-on-error` eklenmedi.

## 1. Ne yapıldı

| #   | Kök neden                                                                                                                                                             | Düzeltme                                                                                                                                                                                                                                                                           | Dosya                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | `pnpm/action-setup` `version: 9` (i18n'de `8`), `packageManager` ise `pnpm@11.25.0`. pnpm 9 `pnpm-workspace.yaml`'ı reddediyordu (`packages field missing or empty`). | Dört workflow'da `version:` kaldırıldı ve `pnpm/action-setup@v4`'e geçildi. Sürüm artık `packageManager`'dan okunuyor.                                                                                                                                                             | ci, a11y-check, check-rls, i18n-check |
| 1b  | pnpm 11, Node ≥ 22.13 istiyor (`npm view pnpm@11.25.0 engines` → `{ node: '>=22.13' }`). Workflow'lar Node 20 kullanıyordu.                                           | `node-version` 20 → 22 (dört workflow).                                                                                                                                                                                                                                            | aynı dört dosya                       |
| 2   | `pnpm-workspace.yaml` → `protobufjs: set this to true or false` yer tutucusu                                                                                          | `protobufjs: false`, gerekçesi yorumda. Paket geçişli bağımlılık (inngest > @opentelemetry/sdk-node > @grpc/proto-loader). postinstall betiği (`scripts/postinstall.js`) yalnız protobufjs'e **doğrudan** bağımlı paketlere sürüm uyarısı basıyor; bizde böyle bir bağımlılık yok. | pnpm-workspace.yaml                   |
| 2b  | (CI'da ortaya çıktı) `ERR_PNPM_IGNORED_BUILDS: esbuild@0.28.2`. pnpm 11, karar verilmemiş derleme betiğini CI'da hata sayıyor.                                        | `esbuild: true`. postinstall betiği platform ikilisini doğruluyor ve gerekirse onarıyor; tsx (db:rls, db:seed, scripts) ve vitest bu ikiliye ihtiyaç duyuyor.                                                                                                                      | pnpm-workspace.yaml                   |
| 3   | `check-rls.yml` geçersiz YAML: template literal gövdesi 1. sütundan başlıyor ve `script: \|` blok skalerini kapatıyordu.                                              | Gövde `[...].join('\n')` ile kuruldu. Üretilen mesaj eskisiyle birebir aynı (§2.2). Yorum adımına `github.event_name == 'pull_request'` koşulu eklendi, a11y ve i18n ile tutarlı olsun diye.                                                                                       | check-rls.yml                         |
| 4a  | (kurulum sonrası çıktı) `pnpm dlx prisma validate` → `No command registered for 'validate'`. dlx, sabitlenmiş 7.10 yerine registry'deki en son prisma'yı indiriyor.   | `pnpm exec prisma validate`. Aynı sebeple `pnpm dlx playwright install` → `pnpm exec playwright install`, böylece tarayıcı sürümü `@playwright/test` 1.62.1 ile eşleşiyor.                                                                                                         | ci.yml                                |
| 4b  | (kurulum sonrası çıktı) `Test` adımında `DATABASE_URL` yoktu ve şema kurulmamıştı. DB kullanan testler "Authentication failed" ile düşüyordu (yerelde 40 test).       | Job düzeyinde `DATABASE_URL` tanımlandı. Yeni `Prepare database` adımı: `prisma db push` → `pnpm db:rls` → `pnpm db:seed` (README'deki kurulumun CI karşılığı).                                                                                                                    | ci.yml                                |

Commit'ler (`dev`'e push'landı):

- `6a89e764 ci: run the pinned pnpm 11 on Node 22 and prepare the CI database (TASK-MULREXNKPS3BF)`: 4 workflow ve pnpm-workspace.yaml
- `218abbab ci: decide the esbuild build script in allowBuilds (TASK-MULREXNKPS3BF)`: pnpm-workspace.yaml

## 2. Kanıt

### 2.1 CI koşuları (push / dev)

| Koşu                                                                        | Commit     | Sonuç                                                                                                              |
| --------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| [36486306027](https://github.com/yaslan/fonbridge/actions/runs/36486306027) | `130a44d6` | ❌ "Use Node.js" (`packages field missing or empty`). Başlangıç durumu                                             |
| [36487054398](https://github.com/yaslan/fonbridge/actions/runs/36487054398) | `6a89e764` | ❌ "Install dependencies": `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2` → düzeltme 2b         |
| [36487348931](https://github.com/yaslan/fonbridge/actions/runs/36487348931) | `218abbab` | ❌ yalnız "Test": `1 failed \| 161 passed \| 10 skipped (172)`, tek dosya `tests/plan-entitlement-version.spec.ts` |

Son koşunun adım dökümü (`gh run watch 36487348931 --exit-status`):

```
✓ Install pnpm
✓ Use Node.js
✓ Install dependencies
✓ Validate Prisma schema
✓ Generate Prisma client
✓ Prepare database
✓ Lint
✓ Typecheck
X Test
- Install Playwright browsers
- E2E Test
```

`check-rls.yml` başlangıçta her push'ta 0 saniyelik bir "failure" üretiyordu (run 36484781634, 36486304564). `6a89e764` ve `218abbab` push'larından sonra bu sahte koşu artık oluşmuyor, yani GitHub dosyayı ayrıştırıp `pull_request`-only tetikleyiciyi doğru okuyor.

### 2.2 Yerel doğrulama (temiz klon + yalıtılmış geçici DB)

Temiz klon scratchpad'de açıldı. Yalnız bana ait geçici bir `pgvector/pgvector:pg16` konteyneri 55432 portunda koştu (paylaşılan `fabrika-postgres`'e dokunulmadı). İş bitince konteyner silindi.

```
$ for f in .github/workflows/*.yml; do python3 -c "import yaml; yaml.safe_load(open('$f'))"; done
ok .github/workflows/a11y-check.yml
ok .github/workflows/check-rls.yml
ok .github/workflows/ci.yml
ok .github/workflows/i18n-check.yml

$ CI=true pnpm install          → Done in 31.6s using pnpm v11.25.0 (EXIT 0)
$ pnpm dlx prisma validate      → CLI.UNKNOWN_COMMAND "No command registered for `validate`" (EXIT 2)   ← kök neden 4a
$ pnpm exec prisma validate     → The schema at prisma/schema.prisma is valid 🚀 (EXIT 0)
$ pnpm db:generate / lint / typecheck → EXIT 0 / 0 / 0
$ pnpm test (DB yok)            → 40 failed — "Authentication failed … credentials for `fabrika`"      ← kök neden 4b
$ prisma db push                → 30 failed — enter_system_scope() yok, demo tenant / M6 modülü yok
$ db push + db:rls + db:seed    → Policies in public: 0 → 114 · Seeding completed with E10 data.
  pnpm test                     → Test Files 1 failed | 158 passed | 10 skipped (169)
                                  FAIL tests/plan-entitlement-version.spec.ts                          ← CI ile birebir aynı
```

check-rls.yml yorum betiği YAML'dan çıkarılıp sahte bir `github`/`context` ile Node'da çalıştırıldı. Üretilen gövde, eski template literal'in metniyle aynı: başlık, 4 maddelik "Action Required", 3 maddelik "RLS Pattern" ve SECURITY_COMPLIANCE linki.

## 3. Değişen dosyalar

- `.github/workflows/ci.yml`
- `.github/workflows/a11y-check.yml`
- `.github/workflows/check-rls.yml`
- `.github/workflows/i18n-check.yml`
- `pnpm-workspace.yaml`
- `docs/agent-results/TASK-MULREXNKPS3BF-devop-fb.md` (bu rapor)

`src/` ve testlere dokunulmadı. se-fb/fe-fb/cs-fb'nin commit'lenmemiş dosyaları (`messages/*.json`, `src/lib/auth.ts`, `docker-compose.yml` …) commit'e girmedi. Her commit `git commit -- <yollar>` ile atıldı ve `git show --stat` ile doğrulandı.

## 4. CI'ı kırmızı tutan uygulama/test hataları (DÜZELTİLMEDİ, sahibine)

### 4.1 `tests/plan-entitlement-version.spec.ts:57-59`: `PlanVersion.updatedAt` için DB default'u yok

```
Raw query failed. Code: `23502`. Message: `null value in column "updatedAt" of relation "PlanVersion" violates not-null constraint`
 ❯ seedPlanFixture tests/plan-entitlement-version.spec.ts:57:3
 ❯ tests/plan-entitlement-version.spec.ts:79:3
```

- Test, ham `INSERT INTO "PlanVersion"` ile `updatedAt` vermeden satır ekliyor.
- `prisma/schema.prisma:224` `model PlanVersion` → `updatedAt DateTime @updatedAt` (DB default'u yok). Bu yüzden `db push` ile kurulan şemada sütun `NOT NULL` ve default'suz.
- `prisma/migrations/add-plan-versioning/migration.sql:48,62,74` ise `DEFAULT CURRENT_TIMESTAMP` tanımlıyor. Geliştirme DB'si bu migration'la kurulduğu için test yerelde geçiyor (`fabrika-postgres` → `column_default = CURRENT_TIMESTAMP`).
- İki çözüm yolu var: (a) şemada `@default(now()) @updatedAt` ile migration'ı hizalamak, ya da (b) test INSERT'ine `"updatedAt"` eklemek. Karar sahibi be-fb/se-fb (billing/plan versiyonlama). Bu kartın kapsamı dışında.

### 4.2 Migration'lar idempotent değil, CI'da yeniden oynatılamıyor

`db push` sonrasında tüm ileri migration'lar sırayla uygulandı (`psql -v ON_ERROR_STOP=1`). RELEASE_CHECKLIST §1 "her biri idempotent" diyor, ancak 3 dosya ikinci kez koşunca düşüyor:

```
prisma/migrations/add-calendar-connections/migration.sql       ERROR: relation "CalendarConnection" already exists
prisma/migrations/add-feedback.sql                              ERROR: column "sentryStatus" of relation "Feedback" does not exist
prisma/migrations/add-m10-dual-approval-persistence/migration.sql  ERROR: constraint "DualApprovalStep_followupDocId_fkey" … already exists
```

Bu yüzden CI şemayı migration'lardan değil `db push`'tan kuruyor. Sonuç olarak `schema.prisma` ile migration SQL'leri arasındaki sapmalar (4.1 gibi) CI'da görünür hâle geliyor. Bu iyi bir sinyal, ancak sahibinin kapatması gerekiyor.

### 4.3 Sıradaki kapı: E2E (ön bilgi, CI'da henüz koşmadı)

`Test` kırmızı olduğu için CI `E2E Test` adımına ulaşmıyor. Yerelde, CI sırasıyla hazırlanmış DB'ye karşı bir kez koşuldu: `25 passed · 128 failed · 27 did not run`. Hataların 117'si yerel ortamdan geldi: playwright 1.62.1 chromium build 1234 istiyor, makinede 1243 var. CI bu tarayıcıyı `playwright install` ile kendisi kurduğu için bu hatalar CI'da çıkmayacak. Tarayıcı kurulup yeniden koşmak, AgentSpace kill-guard (R8, canlı uygulama açıkken e2e) tarafından engellendi; onaysız tekrar denenmedi. Tarayıcıdan bağımsız hatalar sıradaki kapının habercisi:

- `tests/e2e/plan-entitlement-from-version.spec.ts:120`: `demo-tenant has no subscription; run pnpm db:seed`
- `tests/e2e/plan-storefront.spec.ts:160, 236, 264`: assertion ve Prisma hataları
- `tests/e2e/price-lock.spec.ts:71`, `price-lock-deeper-campaign.spec.ts:68`: `prisma.subscription.update()`
- `tests/e2e/evidence-fabrication.spec.ts:58`, `evidence-unverified-badge.spec.ts:88`, `m8-matching.spec.ts:212`: Prisma hataları (ör. `PlanAssignment_tenantId_fkey` FK ihlali)
- `tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:67, 82`: beklenen HTTP durumu tutmuyor

Bu listenin bir kısmı, vitest'in aynı DB'de bıraktığı artıklara bağlı olabilir; bu durum CI'da da aynen geçerli, çünkü CI'da da önce vitest koşuyor. Kesin liste, 4.1 kapandıktan sonraki ilk CI koşusundan çıkarılmalı.

## 5. Riskler

- **Node 22:** CI artık Node 22, ancak `Dockerfile:3` hâlâ `FROM node:20-alpine`. pnpm 11 imajda da kullanılırsa imaj derlemesi aynı sebeple kırılır. Kapsam dışı; ayrı kart önerilir.
- `package.json` içindeki `pnpm.onlyBuiltDependencies` alanını pnpm 11 artık okumuyor (her komutta WARN). Tek geçerli kaynak `pnpm-workspace.yaml#allowBuilds`. Alan kaldırılmadı çünkü `package.json` bu kartın kapsamında değil.
- a11y-check ve i18n-check yalnız `pull_request` ile tetikleniyor ve `main`'de workflow yok. Bu yüzden bu iki workflow'un yeni ayarı henüz GitHub'da koşmadı; yalnız YAML ayrıştırması ve aynı kurulum zinciri (ci.yml'de yeşil) ile doğrulandı. İlk PR'da görülecek.
- GitHub uyarıları: Node 20 action'ları Node 24'e zorlanıyor; `ubuntu-latest`, 19.10.2026'dan itibaren Ubuntu 26'ya geçiyor.

**Geri alma:** `git revert 218abbab 6a89e764` ve dev'e push. Tek etki, CI'ın eski (zaten kırmızı) durumuna dönmesi. Veri veya ortam değişikliği yok.

## 6. Açık sorular

- 4.1 için şema mı (`@default(now())`), test mi düzeltilecek? be-fb/se-fb kararı.
- Migration'ların gerçekten idempotent hâle getirilmesi (4.2) ayrı bir kart olarak açılsın mı? RELEASE_CHECKLIST §1 bu varsayıma dayanıyor.

## 7. Sonraki adım

1. 4.1 düzeltilince dev'e push → yeni CI koşusu `Test`'i geçip `E2E Test`'e ulaşır. Oradaki gerçek hatalar dosya:satır ile yeni kart(lar)a bölünür.
2. `Dockerfile` Node 20 → 22 ve `package.json#pnpm` alanının temizlenmesi için ayrı DevOps kartı.

**Platform beyanı:** Doğrulama **macOS** (darwin, Apple Silicon, yerel temiz klon ve Docker'da pgvector) ve **Linux** (GitHub Actions `ubuntu-latest`, 3 gerçek koşu) üzerinde yapıldı. Değişiklikler yalnız CI YAML'ı ve pnpm ayarı; platforma bağlı kod yolu yok. `esbuild: true` kararı her platformda aynı postinstall'ı çalıştırıyor (`@esbuild/<os>-<arch>` ikilisini doğruluyor). **Windows koşulamadı:** CI yalnız `ubuntu-latest` kullanıyor ve makinede Windows yok.
