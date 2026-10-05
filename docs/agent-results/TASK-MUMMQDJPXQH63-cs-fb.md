# TASK-MUMMQDJPXQH63 — cs-fb — FB betikleri: dotenv importlardan sonra koşuyor

**Durum:** tamamlandı · **Dal:** dev · **Platform:** mac (Darwin 27, Node v26.5.0, tsx 4.23.13, dotenv 17.4.2)

## 1. Ne yapıldı
- **Kök neden kanıtlandı:** ES import'ları modül gövdesinden önce değerlendirilir. `src/lib/db.ts` bağlantı dizesini yükleme anında okur (`process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika'`), `src/lib/env.ts` de öyle. Gövdedeki `dotenv.config()` bu yüzden geç kalıyor. Bu makinede `localhost:5432` **başka bir projenin** Postgres'i (`yuyt-postgres`). `.env` ise `localhost:5433/fabrika`'yı (`fabrika-postgres`) gösteriyor. Yani `pnpm jobs:k2` gibi betikler shell'de DATABASE_URL yokken yanlış sunucuya gidiyordu. Parola farklı olduğu için bağlantı "Authentication failed" hatasıyla düşüyordu; parola eşleşseydi yazma yanlış veritabanına gidecekti.
- **Tek tip çözüm:** Uygulama koduna (`../src/…` ya da `@/…`) runtime import yapan her `scripts/*.ts` dosyası artık **ilk import** olarak `import 'dotenv/config';` içeriyor. Değişen 15 betik var:
  - Gövdede `dotenv.config()` çağıranlar (6): run-k2-monthly, run-alerts-sweep, cordis-import, beta-onboarding, beta-pricing-survey, esr-calibration.
  - Hiç .env yüklemeyenler (9): run-k1-daily, backfill-subscription-plan-version, clean-orphan-topic-matches, create-superadmin, efatura-preflight, rescore-g0, stripe-sync, task-mts9cedcwkqqk-audit, task-mts9cedcwkqqk-delete. Bunlar da `jobs:k1`, `jobs:g0-rescore`, `efatura:preflight` gibi pnpm komutlarıyla aynı sorunu yaşıyordu.
  - `jobs-worker.ts` ve `jobs-enqueue.ts` zaten doğru kalıptaydı (devop-fb, 5ed2261a). **Onlara dokunulmadı.** Dockerfile ve docker-compose'a da dokunulmadı.
- **Neden `tsx --env-file=.env` değil:** (a) Node, `.env` yoksa çöküyor: `node: .env: not found`, exit=9. Worker imajında `.env` yok. (b) Bu seçenek yalnız `pnpm <script>` yolunu kapsıyor; `pnpm tsx scripts/x.ts` ile doğrudan çalıştırmayı kapsamıyor. (c) Repoda 20+ betik zaten `import 'dotenv/config'` kullanıyordu; tutarlılık bu yönde. dotenv, dosya yoksa sessizce devam ediyor ve ortamda tanımlı bir değişkeni ezmiyor (kanıt aşağıda). Bu yüzden package.json'da değişiklik **gerekmedi**.
- **Bekçi testi:** `tests/scripts-dotenv-first.test.ts`. Uygulama koduna import yapan her betiğin ilk import'u `import 'dotenv/config';` olmalı. Gövdede `dotenv.config(` çağrısı yasak; yorumlar taramadan önce ayıklanıyor. Boş taramanın sessizce geçmesine karşı bir "kapsam" testi, dedektör için de 5 birim testi var.

## 2. Kanıt
**Önce (düzeltme öncesi)** — `env -u DATABASE_URL pnpm -s beta:esr-preflight`. Salt-okuma bir kapı, paylaşılan DB'ye yazmıyor. Çalıştırma sonrası `git status` değişmedi:
```
  [db] unreachable —
Invalid `prisma.gateDecision.count()` invocation in .../scripts/esr-calibration.ts:454:25
Authentication failed against the database server, the provided database credentials for `fabrika` are not valid
⚠️  Fixture rows in the database — database unreachable — cannot verify
```
Portların sahipleri (`docker ps`): `yuyt-postgres 0.0.0.0:5432->5432` · `fabrika-postgres 0.0.0.0:5433->5432`. `.env`: `DATABASE_URL host=localhost:5433 db=fabrika`.

**Sonra** — aynı komut, aynı shell (DATABASE_URL tanımsız):
```
❌ Fixture rows in the database — opportunities 0, proposals 0, gateDecisions 0, SAMPLE-* projects 20 — expected 20 of each
```
DB okundu: 5433'teki 20 SAMPLE-* satırı görüldü. Komutun exit=1 vermesinin nedeni önceden var olan E11.3 blocker'ları (roster, anket vb.); bu işle ilgisi yok.

**dotenv/config davranışı** (probe, `import 'dotenv/config'` + DATABASE_URL yazdır):
```
1) repo cwd, shell unset:            DATABASE_URL -> localhost:5433/fabrika
2) cwd without .env (prod-like):     DATABASE_URL -> <unset>   exit=0   (sessizce devam)
3) env explicitly set (prod):        DATABASE_URL -> prod-db:5432/prod  (ortam kazanır)
node --env-file=.env (dosya yok):    node: .env: not found  exit=9
```

**Bekçi + mutant döngüsü:**
```
--- mutant1 (run-k2-monthly eski kalıba döndü)
+     "file": "scripts/run-k2-monthly.ts",
+     "problem": "calls dotenv.config() in the module body — it runs after every import",
      Tests  1 failed | 6 passed (7)
--- mutant2 (run-k1-daily: dotenv/config importlardan sonraya taşındı)
+     "problem": "first import is `import { SediaAdapter } from '../src/lib/adapters/sedia';`, not `import 'dotenv/config';`",
      Tests  1 failed | 6 passed (7)
--- geri alındı
      Tests  7 passed (7)
```
İlk yazımda bekçi `jobs-worker.ts`'i yanlışlıkla işaretledi, çünkü yorum satırında `dotenv.config()` geçiyordu. Bunun üzerine yorum ayıklama eklendi ve buna özel bir birim testi yazıldı.

**Kapılar:** `pnpm typecheck` exit=0 · `eslint` (değişen 15 betik + yeni test) exit=0 · `vitest run tests/scripts-dotenv-first.test.ts tests/cordis-import.test.ts tests/cordis-k2-job.test.ts` → 3 dosya, 22/22 geçti. Duman testi: `env -u DATABASE_URL pnpm -s efatura:preflight` yükleniyor ve hükmünü basıyor. Verdiği exit=1, eksik fatura ayarlarından kaynaklanıyor; önceden de vardı.

## 3. Değişen dosyalar
- `scripts/{run-k2-monthly,run-alerts-sweep,cordis-import,beta-onboarding,beta-pricing-survey,esr-calibration,run-k1-daily,backfill-subscription-plan-version,clean-orphan-topic-matches,create-superadmin,efatura-preflight,rescore-g0,stripe-sync,task-mts9cedcwkqqk-audit,task-mts9cedcwkqqk-delete}.ts`: yalnız ilk import satırı eklendi ve eski `import dotenv` / `dotenv.config()` satırları silindi.
- `tests/scripts-dotenv-first.test.ts` (yeni)
- `docs/agent-results/TASK-MUMMQDJPXQH63-cs-fb.md`

## 4. Riskler
- Daha önce .env yüklemeyen 9 betik artık yüklüyor. Shell'de değişken tanımlıysa davranış aynı kalır, çünkü dotenv ortamdaki değeri ezmez. Değişken tanımlı değilse artık 5432'ye değil `.env`'deki DB'ye giderler; bu zaten amaçlanan davranış.
- dotenv 17 her yüklemede stdout'a tek bir `[dotenv@17…] injecting env` satırı basabilir. Bu, mevcut 20+ betikte zaten olan bir davranış.
- `db.ts`'deki `localhost:5432` varsayılanı yerinde duruyor. .env olmadan yerelde koşan bir betik hâlâ yuyt-postgres'e gidebilir. Bu bir tasarım kararı olduğu için kapsam dışı bırakıldı; bkz. Açık sorular.

## 5. Açık sorular
- `src/lib/db.ts`'deki sabit `localhost:5432` varsayılanı kaldırılsın mı? Alternatif: DATABASE_URL yoksa açık bir hata. Bu makinede o port başka bir projeye ait. Karar be-fb/lidere ait.
- `prisma/seed-*.ts` alt modülleri kapsam dışı kaldı. `seed.ts` ve `seed-tenant-workspace.ts` zaten dotenv'i ilk sırada yüklüyor; alt modüllerin tek başına çalıştırılması bu bekçinin kapsamında değil.

## 6. Sonraki adım
- Yukarıdaki db.ts varsayılanı için ayrı bir kart açılabilir.
- Bekçi `pnpm test` içinde koşuyor; yeni bir betik eklendiğinde kalıp otomatik olarak zorlanacak.

**Platform beyanı:** Doğrulama yalnız **mac** üzerinde yapıldı. Değişiklik platformdan bağımsız: bir ES side-effect import ve bir dosya okuma. dotenv `.env` dosyasını `process.cwd()` üzerinden `path.resolve` ile bulur, dolayısıyla Windows'ta ve Linux'ta (Docker worker) davranış aynıdır. Linux imajında `.env` yoksa betik sessizce devam eder (senaryo 2'deki kanıt). Windows ve Linux'ta ayrıca **koşulmadı**, çünkü bu makinede o ortamlar yok.
