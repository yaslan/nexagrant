# TASK-MUOEY2GBFHY7U · crw2-fb: FB push blokçusu (live-skip-gate) + spike/job-queue merge

**Sonuç:** Blokçu gerçek bir CI kırmızısı değildi. `CI` ortam değişkeni verilmeden alınan yerel ölçümde bir yanlış alarmdı. CI eşdeğeri koşu (GitHub Actions `CI=true` verir) aynı commit'te gate yeşil veriyor. Temiz DB'de koşarken **ayrı ve gerçek bir kusur** buldum: `prisma db push` sonrası K1 `TopicMatch` anahtarı `NULLS NOT DISTINCT` olmuyor. Bu yüzden paralel recompute aynı çift için ikinci satırı yazıyor ve CI aralıklı kırmızı veriyor. Düzeltmesi dev'de. spike/job-queue da dev'de. Merge sonrası tam CI eşdeğeri yeşil. Push yapılmadı.

| | Hash |
|---|---|
| Bölüm A dalı `crw2-fb/live-skip-gate` | `70c448f7` (gate notu) + `3d15de69` (TopicMatch anahtarı) |
| Bölüm A dev merge | **`ac2ec5f3`** |
| Bölüm B spike merge | **`e8c6e7ca`** (ebeveynler `956124f3` dev + `d8a3a353` spike) |

## 1. Ne yapıldı

### Bölüm A: live-skip-gate

**1.1 Atlanan testler, isimleriyle.** Aynı DB'de ve aynı adımlarla (`00-ci-run.sh`) `CI` verilmeden koşunca devop-fb'nin sayıları birebir çıktı: 3858 passed / 115 skipped / 6 files skipped, gate "339 live tests passed … FAILED". Gate'in SKIPPED saydığı 64 test 5 dosyada (tam liste ek 02'de):

| Dosya | Atlanan |
|---|---|
| `tests/stale-relationship-reminder.live.test.ts` | 23 (M4 stale reminder describe'ının tamamı) |
| `tests/public-lead.live.test.ts` | 16 (public lead form + retention) |
| `tests/k1-embeddings.live.test.ts` | 10 (fake provider + refused rows. REAL OpenAI olan zaten izinli) |
| `tests/topic-match-nightly.live.test.ts` | 9 |
| `tests/invitation-retention.live.test.ts` | 6 |

devop-fb yalnız 2 dosyayı tahmin etmişti. Kalan 3 dosya da aynı nedenle atlanıyor.

**1.2 Kök neden (ölçüldü).** Beş dosyanın hepsinde aynı yerel koruma satırı var:
```
tests/invitation-retention.live.test.ts:60:const SHARED = DB_NAME === 'fabrika' && !isCi();
tests/k1-embeddings.live.test.ts:48:const SHARED = DB_NAME === 'fabrika' && !isCi();
tests/public-lead.live.test.ts:66:const SHARED = DB_NAME === 'fabrika' && !isCi();
tests/stale-relationship-reminder.live.test.ts:52:const SHARED = DB_NAME === 'fabrika' && !isCi();
tests/topic-match-nightly.live.test.ts:59:const SHARED = DB_NAME === 'fabrika' && !isCi();
```
Bu testler geliştiricinin paylaşılan `fabrika` DB'sine yazmayı reddeder. Koşul `skipOrFailInCi`'den geçmez, bilerek sessizce skip eder. Yalnız `CI` yokken devreye girer. CI job'ında da DB adı `fabrika`. `CI` verilmemiş bir yerel "CI eşdeğeri" koşu bu yüzden 64 testi atlıyor ve gate haklı olarak FAILED diyor. GitHub Actions `CI=true`'yu her koşuda kendisi verir, dolayısıyla gerçek CI'da bu testler koşar. Koşulun geldiği commit'ler (`git log -S`): `b80d8360` (se-fb, stale-reminder + topic-match), `784836b7` (k1-embeddings), `284ecacb` (public-lead), `4a100e41` (invitation-retention).

Kanıt, aynı commit (`e860b035`) ve aynı DB ile:
- `CI=true`: `live-skip gate: 46 live files, 403 live tests passed, 43 allowed skip(s)` → exit 0 (ek 01).
- `CI` yok: `339 live tests passed … FAILED` ve 64 SKIPPED satırı (ek 02).

**1.3 Düzeltme 1: gate gevşetilmedi (`70c448f7`).** İzin listesine hiçbir şey eklenmedi, gate kararı ve çıkış kodu aynı kaldı. `scripts/check-live-skips.ts` yalnız şunu yapıyor: gate fail edip `CI` set değilse bir **not** satırı basıyor ("CI is not set … run vitest with CI=true against a throwaway database"). Amaç, bir sonraki yerel ölçümün aynı yanlış alarmı vermemesi. Pini `tests/live-skip-gate.test.ts`'e eklenen testte: CI yokken not basılır, `CI=true` iken basılmaz, çıkış iki durumda da 1. Mutant (koşulu `false` yapmak) testi kırdı.

**1.4 Temiz DB'de bulunan gerçek kusur ve Düzeltme 2 (`3d15de69`).** Gate notundan sonra sıfır DB'de koşunca test adımı kırmızı verdi (ek 03):
```
FAIL tests/k1-embeddings.live.test.ts > … > k1-topic-match now writes rows for the embedded tenants, none for the expired pilot
AssertionError: expected 9 to be 6
```
Kök neden: CI sırası (ve RELEASE_CHECKLIST §1) önce `prisma db push` koşuyor. Push `TopicMatch_tenantId_topicId_opportunityId_key`'i schema.prisma'dan kuruyor, ama Prisma `NULLS NOT DISTINCT` yazamıyor. Migration'daki `CREATE UNIQUE INDEX IF NOT EXISTS … NULLS NOT DISTINCT` aynı adlı index var diye no-op kalıyor. Ölçüm, CI sırasıyla kurulmuş DB'de:
```
TopicMatch_tenantId_topicId_opportunityId_key|f      ← indnullsnotdistinct
```
`opportunityId` NULL olan K1 satırında bu anahtar hiçbir şeyi engellemiyor. topic-match-nightly'nin daraltılmamış işi ile k1-embeddings'in sweep'i aynı anda `writePage`'in findMany → createMany penceresine girince aynı (tenant, topic, NULL) çifti iki kez yazılıyor. Kodun yorumu ("two overlapping runs cannot make a second row") yalnız migration'ın niyet ettiği anahtar için doğru.

Düzeltme `prisma/migrations/topicmatch-per-opportunity/migration.sql`'de. `indnullsnotdistinct = false` olan anahtar, tek bir `DO` ifadesi içinde düşürülüp doğrusuyla yeniden kuruluyor. İşlem atomik: mükerrer çift varsa CREATE hata verir, eski anahtar yerinde kalır ve `ON_ERROR_STOP` koşuyu durdurur. Sessiz veri silme yok. Ölçüm:
```
önce: …_key|f   → apply-migrations pass1: …_key|t → pass2: …_key|t (idempotent)
→ ardından pnpm exec prisma db push: "The database is already in sync with the Prisma schema." → …_key|t
```
Regresyon testi `tests/topic-match-nightly.live.test.ts`'de: ikinci K1 satırını elle eklemek `P2002` ile reddedilmeli ve satır sayısı 1 kalmalı. Yeni anahtarla 10/10 passed. Anahtarı elle eski NULLS DISTINCT haline döndürünce test **FAIL** verdi (kırmızı kontrolü yapıldı).

**1.5 A doğrulaması.** Sıfır DB, `3d15de69` (ek 04): lint 0, typecheck 0, `Tests 3924 passed | 51 skipped`, `live-skip gate: 46 live files, 404 live tests passed, 43 allowed skip(s)` (SKIPPED/PROBLEM yok), i18n passed, build 0, `== ALL GREEN`. Aynı DB'de 4 ek tam vitest koşusu yaptım. k1/topic-match çifti 4'ünde de temizdi. k1+topic-match dosyaları birlikte 8 kez koşuldu, 8'inde de `20 passed | 1 skipped`. İlgisiz bir flake için Riskler R-2'ye bakın.

### Bölüm B: spike/job-queue merge

- `git merge --no-ff spike/job-queue`: çakışma yalnız `pnpm-lock.yaml`'da. `git checkout --ours pnpm-lock.yaml` + `pnpm install --no-frozen-lockfile` → lockfile değişmedi. `git diff <dev> -- pnpm-lock.yaml package.json` boş (dev'de `graphile-worker 0.18.0` zaten var). `CI=true pnpm install --frozen-lockfile` → exit 0.
- **tsc kırıldı:** `scripts/spike-jobq/worker.ts(19,36): error TS2307: Cannot find module '../../src/lib/inngest/jobs/k2-monthly-cordis'`. Neden: `fbf23850` iş gövdelerini `src/lib/jobs/tasks/`'a taşıdı. En küçük çözüm olarak import yolunu yeni yere çevirdim. `tsconfig`/eslint ignore eklemedim, çünkü dosya tip kontrolünde kalmaya devam etsin istedim. Sonrasında tsc 0 ve lint 0. Lint zaten spike dosyalarında hata vermiyordu.
- `worker.ts` başlığındaki "Spike branch only — never merged into dev." notu şöyle değişti: "Merged into dev on 30.09 by patron decision as reference only — not production code". Yeni `scripts/spike-jobq/README.md` "30.09 patron kararıyla referans olarak merge edildi, üretim kodu değil" diyor. `run1.sh`/`run2.sh`'ın başka ajanın makinesine özgü yollar taşıdığını da not ediyor.
- Sır taraması: `scripts/spike-jobq/` içinde `://user:pass@` biçiminde URL yok, anahtar deseni yok.
- dev iki kez ilerledi (`3dfa77c1` docs, `956124f3` devop-fb HSTS). `update-ref` eski-değer kontrolü iki denemede de reddetti. Merge'ü her seferinde güncel dev üzerinde yeniden kurdum, son hali `e8c6e7ca`.

**B doğrulaması, merge sonrası tam CI eşdeğeri** (sıfır DB, `e8c6e7ca`, ek 05): install frozen, prisma validate/generate, db push, rls-role, migrations ×2, rls, seed, lint 0, typecheck 0, `Test Files 301 passed | 2 skipped`, `Tests 4025 passed | 51 skipped`, `live-skip gate: 46 live files, 406 live tests passed, 43 allowed skip(s)`, i18n passed, build 0, `== ALL GREEN`.

## 2. Kanıt

Ekler `docs/agent-results/TASK-MUOEY2GBFHY7U-crw2-fb-ekler/` altında. İzin verilen 43 skip satırı ve NOTICE satırları çıkarıldı, ANSI temizlendi:
- `00-ci-run.sh`: ci.yml'nin birebir eşdeğeri. `env -i`, iş seviyesindeki `DATABASE_URL`/`DATABASE_URL_RLS_TEST`, Test adımındaki `AUTH_SECRET` ve `CI=true` veriyor. Her koşudan önce ve test adımında `DATABASE_URL` basılıyor (`postgresql://fabrika:fabrika@127.0.0.1:55120/fabrika`, izole `crw2fb-gate-pg`, pgvector/pgvector:pg16). Tek bilinçli fark şu: ci.yml `pnpm install` diyor, ben `--frozen-lockfile` verdim. CI'da `CI=true` iken pnpm zaten frozen davranır.
- `01-…e860b035-CI=true.txt`: blokçu commit'in CI eşdeğeri, gate yeşil.
- `02-…CI-yok-devop-fb-tekrari.txt`: aynı commit `CI` olmadan. 3858/115/6 ve 64 SKIPPED satırı.
- `03-…k1-embeddings-9-satir.txt`: sıfır DB'deki `expected 9 to be 6`.
- `04-…A-3d15de69.txt`, `05-…merge-sonrasi-e8c6e7ca.txt`: yeşil tam koşular.

Temizlik: `docker rm -f crw2fb-gate-pg` → sonra `docker ps -a | grep -c crw2fb` = 0. `git worktree remove` wtgate → bu oturumun worktree sayısı 1 (rapor commit'i için kalan merge worktree'si). O da rapor commit'inden sonra kaldırılıyor, son satır cevapta. Dal `crw2-fb/live-skip-gate` merge edildi ve duruyor.

## 3. Değişen dosyalar

- `scripts/check-live-skips.ts`: CI yokken fail durumunda not satırı.
- `tests/live-skip-gate.test.ts`: notun ve çıkış kodunun testi.
- `prisma/migrations/topicmatch-per-opportunity/migration.sql`: NULLS DISTINCT anahtarı atomik olarak değiştiriliyor.
- `tests/topic-match-nightly.live.test.ts`: ikinci K1 satırının reddedildiğini sınayan test.
- `scripts/spike-jobq/**` (merge), `scripts/spike-jobq/worker.ts` (import yolu + not), `scripts/spike-jobq/README.md` (yeni).
- `pnpm-lock.yaml`, `package.json`: değişmedi (dev ile birebir).

## 4. Riskler

- **R-1 (prod, önemli).** RELEASE_CHECKLIST aynı sırayı kullanıyor (§1 `db push`, §3 migrations). `db push` ile kurulmuş her ortamda K1 anahtarı büyük olasılıkla NULLS DISTINCT ve mükerrer K1 satırları olabilir. Bu durumda yeni migration §3'te **hata verip durur**, veri silmez. Yayından önce prod'da (salt-okur) şu iki sorgu koşulmalı:
  `SELECT i.indnullsnotdistinct FROM pg_index i WHERE i.indexrelid = to_regclass('"TopicMatch_tenantId_topicId_opportunityId_key"');`
  `SELECT "tenantId","topicId",count(*) FROM "TopicMatch" WHERE "opportunityId" IS NULL GROUP BY 1,2 HAVING count(*)>1;`
  İkincisi satır dönerse mükerrerleri temizleme kararı ürün sahibinin. K1 satırı türetilmiş veri, yeniden hesaplanır.
- **R-2 (ilgisiz flake).** 4 ek tam koşunun 1'inde `tests/invitation-mail-limit.live.test.ts > … an address inside its cooldown is recently_sent even when the tenant is at the daily limit` kırmızı verdi (`AssertionError: expected { success: true, …(3) } to match object { emailSent: false, …(1) }`). Diğer 3 koşuda ve 3 tam CI koşusunda yeşildi. Benim diff'im davet rotasına ya da audit'e dokunmuyor. Kök nedeni ölçmedim. Paralel testlerin paylaşılan DB'de yarışması olası bir aday, ama bu tahmin. CI'da aralıklı kırmızı verebilir.
- **R-3 (kalan pencere).** Anahtar artık ikinci satırı engelliyor. Ancak `writePage`'de yarışı kaybeden satır `createMany … skipDuplicates` ile sessizce atlanıyor ve created/updated/unchanged sayılarının hiçbirine girmiyor. k1-embeddings testindeki `created+updated+unchanged === 6` beklentisi aynı dar pencerede 5 görebilir. Satır sayısı beklentisi doğru kalır. 4 tam koşu ve 8 çift koşuda görülmedi. Olursa `writePage`'e bir `raced` sayacı eklemek doğru çözüm olur, testi gevşetmek değil.

## 5. Açık sorular

- R-1 sorgularını prod'da kim koşacak (devop-fb mi, patron mu)? Mükerrer varsa temizleme kararını kim verecek?
- Yerel "CI eşdeğeri" koşular için ekip notu: `CI=true` vermeden alınan gate sonucu CI'ı temsil etmez. Gate artık bunu kendisi söylüyor.

## 6. Sonraki adım

- devop-fb 1 Ekim push'unu `e8c6e7ca` (ya da üstü) ile yapabilir. Önce R-1 kararı alınmalı.
- R-2 için ayrı kart: invitation-mail-limit flake'inin kök nedeni.

**Platform beyanı:** Tüm koşular macOS'ta (darwin, Apple Silicon, Docker ile `pgvector/pgvector:pg16`) yapıldı. Dokunduğum kod platformdan bağımsız: SQL migration Postgres ≥15'te aynı şekilde çalışır. TS değişikliği yalnız `process.env.CI` okuyor, süreç, yol ya da kabuk kullanmıyor. Gerçek CI Linux'ta (ubuntu-latest) koşar. Linux'ta ve Windows'ta koşulamadı, çünkü bu makinede o ortamlar yok. `00-ci-run.sh` bash betiği ve ci.yml'nin Linux adımlarını taklit ediyor.
