# TASK-MUN4N43VERLXK: İNCELEME-38 · crw-fb

**İncelenen:** TASK-MUMT3PGX5OK8P (devop-fb), Inngest'ten graphile-worker'a geçiş (ADR-0008, İNCELEME-22 Ö-1..Ö-3). Commit'ler: `2c20324f`, `fbf23850`, `5ed2261a`, `a40b6bf4`, `fe7066bf`, `1d19c2dc`. Altısı da `dev` HEAD'in atası (`git merge-base --is-ancestor`).
**Ortam:** temiz ayrık worktree (`1b8598d1`) ve kendi Postgres konteynerim (`crwfb-i38`, :55481). Kurulum CI sırasıyla yapıldı: `db push`, `db:rls-role`, `apply-migrations` ×2, `db:rls`, `db:seed`. Paylaşılan `fabrika` DB'sine ve :3000'e dokunulmadı. Kod DEĞİŞTİRİLMEDİ; mutantlar yalnız kendi worktree'mde denendi ve geri alındı.

## Karar: DÜZELTME GEREKLİ

İki bulgu bloke ediyor. İkisi de küçük düzeltme.

- **B-1:** Ö-1'in "yanlış sırada bile çift kredi yok" iddiası yanlış.
- **B-2:** Dockerfile'da son aşama artık `worker`. Bu yüzden `docker build .` ve compose'daki `fabrika-web` web yerine worker imajı üretiyor.

Geri kalanlar sağlam:

- İki worker'da eşzamanlı kredi işi tek satır yazıyor.
- `JOBS_CRON_ENABLED` üretim kilidi çalışıyor.
- Kaçırılmış tik alarmı yazılıyor.
- Tekrar deneme 5 denemeyi 3 worker'a dağıtıyor ve son denemede alarm yazıyor.
- 10 işin cron ve eşzamanlılık envanteri eskisiyle birebir aynı.
- `inngest` kalıntısı yok.
- Tam süit yeşil ve kiracı sayısı değişmedi (1→1).

## Bulgular (önem sırasıyla)

### B-1 (BLOKE, orta-yüksek: çift kredi/para): eski kodun yazdığı ay, benzersiz kısıtın dışında kalıyor

- **Yer:**
  - `prisma/migrations/credit-ledger-grant-period.sql:22`: "No existing row is changed: old job rows keep grantPeriod NULL".
  - `docs/adr/ADR-0008-own-job-queue-graphile-worker.md:188`: "Aylık kredi işi Ö-1 sayesinde yanlış sırada bile ikinci kez kredi vermez".
  - Aynı iddia `docs/agent-results/TASK-MUMT3PGX5OK8P-devop-fb.md:168` ve `src/lib/jobs/tasks/credits-monthly-grant.ts:29` ("the same tick firing in two schedulers") içinde de var.
- **Neden:** Eski Inngest kodu (`git show fbf23850~1:src/lib/inngest/jobs/credits-monthly-grant.ts:42`) `grantPeriod`'suz yazıyor. Postgres NULL'ları farklı saydığı için `UNIQUE(tenantId, grantPeriod)` eski satırla yeni satırı çakıştırmıyor. Migration eski satırları da doldurmuyor.
- **Senaryo (canlı koşuldu, izole DB):**
  1. Eski kodun yazdığı satır eklendi: `('old-inngest-nov', demo-tenant, 500, 'monthly_grant', createdAt 2026-11-01 06:00:03, grantPeriod NULL)`.
  2. Kasım için yeni iş kuyruğa kondu.
  ```
  DONE job=5 … {"period":"2026-11","grantedCount":1,"alreadyGrantedCount":0,"totalCreditsGranted":500}
  nov_credits = 1000   ← aynı kiracıya Kasım için iki kez 500
  ```
- **Gerçek dünyada tetikleyen yollar:**
  - (a) ADR §9.2'nin kendi anlattığı çakışma: eski web ya da Inngest ayın 1'i 06:00 tikini hâlâ atıyor ve yeni worker da atıyor.
  - (b) Geri dönüş: worker'ın o ay verdiği krediden sonra Inngest'li sürüm geri gelir ve aynı ayı yeniden verir.
  - (c) Geçiş ayında operatör Inngest'in verdiği ay için `pnpm jobs:enqueue -- credits-monthly-grant` koşar. Örneğin kaçırılmış tik alarmının "elle koş" önerisiyle.
- **Önerilen düzeltme:**
  1. Migration'a geriye dönük doldurma ekle. İzole DB'de denendi. Tekrar denemeden kalan kopyada yalnız ilk satırı doldurur, o ay için zaten `grantPeriod`'lu satır varsa hiçbirine dokunmaz:
     ```sql
     UPDATE "CreditLedger" c SET "grantPeriod" = s.p
     FROM (SELECT id, "tenantId", to_char("createdAt",'YYYY-MM') p,
                  row_number() OVER (PARTITION BY "tenantId", to_char("createdAt",'YYYY-MM') ORDER BY "createdAt", id) rn
             FROM "CreditLedger" WHERE reason='monthly_grant' AND "grantPeriod" IS NULL) s
     WHERE c.id = s.id AND s.rn = 1
       AND NOT EXISTS (SELECT 1 FROM "CreditLedger" x WHERE x."tenantId"=s."tenantId" AND x."grantPeriod"=s.p);
     ```
     Kanıt: 12/2026 için iki eski satır (06:00:02 ve 06:00:09) → `UPDATE 1`. Yalnız ilki `2026-12` aldı. Ardından iş koştu: `{"period":"2026-12","grantedCount":0,"alreadyGrantedCount":1}`. Kasım'da zaten `grantPeriod`'lu satır olduğu için `old-inngest-nov` NULL kaldı, kısıt ihlali olmadı.
  2. Bu doldurma (b) ve (c) yollarını ve "önce Inngest, sonra worker" sırasını kapatır. "Önce worker, sonra eski kod" sırası kapanmaz, çünkü eski kod değiştirilemez. Bu yüzden ADR §9.2, migration başlığı ve devop raporu şöyle düzeltilmeli: "kredi işi de sıra kuralına tabidir; Ö-1 yalnız yeni-yeni çakışmayı kapatır".
  3. Test ekle: eski biçimli satır + doldurma + iş → `alreadyGrantedCount=1`.

### B-2 (BLOKE, yüksek: web imajı yok): `docker build .` ve compose `fabrika-web` worker'ı çalıştırıyor

- **Yer:** `Dockerfile:52`. `5ed2261a`, `FROM base AS worker` aşamasını `runner`'dan sonraya, dosyanın sonuna ekledi. Docker, `--target` verilmezse son aşamayı derler.
- `docker-compose.yml` içindeki `fabrika-web` servisinde `build:` altında `target` yok. `docker compose --profile app config` çıktısı: `build: {context, dockerfile: Dockerfile}`.
- **Kanıt:**
  ```
  docker build -t crwfb-i38-web:tmp .            → EXIT=0, ama tüm katmanlar "[worker n/4]"
  docker image inspect crwfb-i38-web:tmp → Cmd ["node_modules/.bin/tsx","scripts/jobs-worker.ts"], ExposedPorts null
  docker run (compose'daki fabrika-web env'i: NODE_ENV=production, DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL; -p 55482:3000)
     → "JobsCronUnsetInProductionError: ❌ JOBS_CRON_ENABLED is not set on a production worker", exit=1
     curl http://localhost:55482/ → http 000
  ```
- **Sonuç:** `docker compose --profile app up` web'i hiç ayağa kaldırmaz. `restart: unless-stopped` yüzünden sonsuz yeniden başlatma döngüsüne girer. Hedefsiz `docker build .` kullanan her dağıtım da aynı sonucu alır. devop raporu §4 "Web imajı uçtan uca derlenmedi" diyor; açık tam bu.
- **Ek (önceden var olan kusur, düzeltme için gerekli):** Hedef doğru seçilse bile web imajı derlenmiyor.
  ```
  docker build --target runner . → EXIT=1
  "Module not found: Can't resolve '.prisma/client/index-browser'"
  ```
  Sebep: builder aşaması `pnpm build`'den önce `prisma generate` koşmuyor. Worker aşaması koşuyor. `a40b6bf4`'ten önce deps aşaması zaten düştüğü için bu kusur hiç görünmemişti.
- **Önerilen düzeltme:** Üçü birlikte yapılmalı.
  1. `worker` aşamasını `runner`'ın önüne taşı; varsayılan hedef yine web olur.
  2. Builder'da `RUN node_modules/.bin/prisma generate` satırını `RUN pnpm build`'den önceye ekle.
  3. İsteğe bağlı ama açık olsun diye `fabrika-web.build.target: runner` ekle.
- **Düzeltmenin kanıtı:** (1) ve (2) YALNIZ kendi worktree'mde denendi, sonra geri alındı. Yama: `scratchpad/dockerfile-fix.patch`, 15+/14−.
  ```
  docker build -t crwfb-i38-fixed:tmp .   (hedefsiz)  → EXIT=0, "✓ Compiled successfully", "Generating static pages (30)"
  Cmd ["node","server.js"] User nextjs Ports 3000/tcp
  docker run … -p 55483:3000 → "✓ Ready"; GET / → 307 (locale yönlendirmesi); GET /api/inngest → 404
  ```

### Ö-1 (öneri, test boşluğu): 10 mutanttan 3'ü sağ kaldı

`tests/jobs-schedule.test.ts` ile `cron-tenant-scope.test.ts` üzerinde koşuldu. Her mutantta tek satır değişti, sonra geri alındı:

| Mutant | Sonuç |
|---|---|
| M1 `findMissedTicks` içinde `known_since` koşulu silindi | ÖLDÜ |
| M2 `define.ts` `attempts >= max` → `>` | ÖLDÜ |
| M3 `skipDuplicates: false` | ÖLDÜ |
| M4 crontab'dan `queue=` çıkarıldı | ÖLDÜ |
| M5 üretim kilidi (`throw`) silindi | ÖLDÜ |
| M8 agency `reportPeriod(tick)` → `(now)` | ÖLDÜ |
| M10 credits cron `0 6` → `0 7` | ÖLDÜ |
| **M6** `enqueue.ts` `jobKeyMode: 'unsafe_dedupe'` → `'replace'` | **SAĞ.** ADR §5 D4'ün "koşan işin yanına ikinci kopya" koruması testsiz. `enqueueJob` için hiç test yok. |
| **M7** `assessQueue` exhausted filtresinden `locked_at === null` silindi | **SAĞ.** Son denemesini koşan iş yanlışlıkla "tükendi" alarmı alırdı. |
| **M9** credits `monthOf(tick)` → `monthOf(null)` | **SAĞ.** "Tekrar deneme bir sonraki aya kaymaz" iddiası kredi işi için testsiz. Etkisi düşük, çünkü tik ayın 1'inde. |

### Ö-2 (öneri): kaçırılmış tik alarmı yalnız bir cron worker'ı döndüğünde çalışıyor

`job-queue-health` de bir cron işi. Bütün worker'lar düşükse, ya da hepsi `JOBS_CRON_ENABLED=false` ise hiçbir alarm yazılmaz. ADR §9.3'teki "sessiz kayıp artık görünür" cümlesi yalnız worker geri geldiğinde doğru. Öneri: dış bir uptime/heartbeat kontrolü ekle (`_private_known_crontabs.last_execution` of `job-queue-health` > 70 dk → alarm) ya da en azından ADR'ye yaz.

### Ö-3 (öneri): tekrar deneme penceresi kısa

5 deneme yaklaşık 85 saniyede tükeniyor. Ölçüm: job 6, 20:32:04 → ~20:33:35. Kaynak `exp(min(attempt,10))`, `schedule.ts:12`. k1'in dış kaynağı (SEDIA) 2 dakikalık bir kesinti yaşarsa iş o gün koşmaz; ertesi gün tekrar koşacağı için veri kaybı yok. Varsayım (doğrulanmadı): Inngest'in varsayılan backoff'u daha uzun bir pencereye yayılıyordu. Gerekirse dış kaynaklı işlerde `maxAttempts` artırılabilir.

### Ö-4 (öneri, düşük): compose yorumu ile gerçek davranış çelişiyor

- `docker-compose.yml:39` "any number of copies is safe" diyor, ama `container_name: fabrika-worker` sabit olduğu için `--scale` yapılamıyor.
- `JOBS_CRON_ENABLED=${JOBS_CRON_ENABLED:-true}` yerel yığın için doğru. Compose bir gün üretim dağıtımı olursa Ö-2 kilidini varsayılanla aşar. Barındırma kararı (ADR §4) verilirken bu satır yeniden düşünülmeli.

### Ö-5 (not): elle payload

- `k2-monthly-cordis --month` biçim kontrolünden geçmiyor (`k2-monthly-cordis.ts:45`). URL'de encode ediliyor, zarar yok.
- `users-scheduled-deletion --payload '{"gracePeriodDays":1}'` GDPR bekleme süresini kısaltıp kalıcı silme yapabilir. Yalnız DB kimliği olan operatör yapabiliyor ve eski Inngest "Invoke" ile de mümkündü. Davranış değişmedi.

## Kontrol listesi ve kanıt

**1) Ö-1 iki kez koşum.** `jobs:enqueue credits-monthly-grant` iki kez koşuldu. Ardından iki worker'a eşzamanlı iki `add_job` (period 2026-10) verildi:
```
worker-84a4…{1} {"period":"2026-09","grantedCount":1,…,"totalCreditsGranted":500}
worker-279a…{2} {"period":"2026-09","grantedCount":0,"alreadyGrantedCount":1}
worker-84a4…{3} {"period":"2026-10","grantedCount":1}   worker-279a…{4} {"period":"2026-10","grantedCount":0,"alreadyGrantedCount":1}
CreditLedger: demo-tenant 500 monthly_grant:2026-09 2026-09 | demo-tenant 500 monthly_grant:2026-10 2026-10   (kiracı×ay tek satır)
```
Migration sırası: `apply-order.txt:45`, 34 dosyanın 33.'sü. `CreditLedger` tablosunu `db push` kurduktan sonra koşuyor.

- Eski şemada denendi: kolon ve index düşürüldü, dosya 2 kez uygulandı. Sonuç `ALTER TABLE / CREATE INDEX`, ardından `already exists, skipping`.
- `apply-migrations` iki kez koştu, ikisi de exit 0.
- Tekrar deneme kopyası olan eski ay verisiyle de index kuruluyor, çünkü eski satırlar NULL. Açık kalan kısım B-1.

**2) Ö-2.**
- Web süreci worker başlatmıyor: `startJobsWorker` ve `graphile-worker` import'u yalnız `scripts/jobs-worker.ts` ile `src/lib/jobs/` içinde. Kalan tek çift-zamanlayıcı yolu eski Inngest (B-1 / ADR sırası).
- Kilit denemeleri:
```
NODE_ENV=production JOBS_CRON_ENABLED=  → exit 1 "JobsCronUnsetInProductionError"
NODE_ENV=production JOBS_CRON_ENABLED=false → "runs queued jobs only", SystemAlert warn job-queue:cron-disabled
```
- İki cron worker (D, E; mac) ve Linux konteyner worker'ı aynı DB'de → 21:05 tiki: **(aşağıda, TİK bölümü)**

**3) Ö-3.** Kendi worker'larım SIGTERM ile kapatıldı ("Global graceful shutdown complete" ×3). Kesinti, `_private_known_crontabs` üzerinde kuruldu: `users-scheduled-deletion` son koşu 09-28 03:00, `alerts-sweep` son koşu 09-28 04:15. Bu durum, worker'ın fill penceresinden (6h) uzun kapalı kalmasıyla aynı. Worker yeniden başlatıldı:
```
_private_known_crontabs değişmedi (fill dışı, geriye dönük koşu yok)
[job-queue-health] DONE {"missed":["users-scheduled-deletion@2026-09-29T03:00:00.000Z","alerts-sweep@2026-09-29T04:15:00.000Z"],"exhausted":1,"stuck":0}
SystemAlert error job-queue "users-scheduled-deletion did not run for its 2026-09-29T03:00:00.000Z tick (last run 2026-09-28T03:00…) … Run it by hand with `pnpm jobs:enqueue -- …`"
SystemAlert error job-queue "alerts-sweep did not run for its 2026-09-29T04:15:00.000Z tick …"
```

**4) Envanter ve davranış.**
- `fbf23850~1` ile karşılaştırıldı: 10 işin id'si ve cron ifadesi birebir aynı.
- Yalnız `agency-monthly-report`'ta `concurrency: {limit:1}` vardı; karşılığı `queue=agency` (M4 bunu öldürüyor).
- İş gövdelerinde advisory lock yok (`grep advisory src/lib/jobs` boş), korunacak bir şey yoktu.
- `invitation-cleanup` başka karttan geldi (`4a100e41`). `job-queue-health` yeni. Toplam 12 iş, `taskList: Record<JobId,Task>` ile tip seviyesinde eşleşiyor.
- `step.run` belleği kalktı. alerts-daily tekrar denemesinde e-posta yeniden gitmiyor, çünkü `lastRunAt` gönderimden hemen sonra ilerliyor ve yeni eşleşme 0 oluyor. k1'de yalnız süre uzuyor (devop riskinde yazılı).
- Hata verdirip tekrar deneme: `feedback-weekly-digest --payload '{"to":"not-an-email"}'` (zod hatası):
```
wB: attempt 1/5 · wC(prod,false): 2/5 · wA: 3/5 · wA: 4/5 · wB: 5/5 FAIL   (≈85 sn, 3 worker'a dağıldı)
graphile_worker.jobs: id 6 attempts 5/5 locked_at NULL (tabloda kaldı)
SystemAlert error job-queue "feedback-weekly-digest gave up after 5 attempts: …" meta.alertDedupeKey=job-queue:feedback-weekly-digest:exhausted
```

**5) Kalıntı.**
```
/usr/bin/grep -rni inngest src package.json .env.example docker-compose.yml Dockerfile pnpm-workspace.yaml next.config.ts → çıktı yok, exit 1
grep -c inngest pnpm-lock.yaml → 0
```

**6) Docker.**
- `a40b6bf4` doğru: deps aşaması `pnpm-workspace.yaml`'ı kopyalıyor. Worker derlemesinde `IGNORED_BUILDS` ya da `protobufjs` satırı yok (0).
- `docker build --target worker` → exit 0.
- Konteyner Linux aarch64, Node v22.23.3, kullanıcı `node`. İmajda `.env` yok (`.dockerignore` `.env*`).
- Konteyner DB'ye bağlanıp cron'a katıldı.
- Web: B-2. Hedefsiz derleme worker üretiyor, `--target runner` derlemesi `prisma generate` eksikliğinden düşüyor. Düzeltilmiş yamayla ikisi de exit 0 ve HTTP 307 veriyor.
- `docker compose --env-file .env.example config` `AUTH_SECRET` olmadan düşüyor. Bu, web servisindeki kasıtlı `:?` kuralıyla aynı ve önceden de vardı (`docker-compose.yml:12`); worker aynı kuralı izliyor.

**7) undefined id ve toplu silme.**
- Bu geçişin iş gövdelerine taşıdığı girdiler yalnız payload alanları: `period` (regex / `requestedReportPeriod`), `month`, `gracePeriodDays` (zod pozitif int), `sinceIso` ve `to` (zod).
- Hiçbiri bir `where` id'sine gitmiyor. Silmeler DB'den okunan id'lerle (`purgeDueUsers`) ya da tarih kesimiyle (`pruneOldStripeEvents`) yapılıyor.
- `where: { x: undefined }` biçiminde yeni bir yol yok.

**Kapılar.**
```
tam vitest, izole DB, 1. koşu: 72 kırmızı → sebep benim kurulumum (`pnpm db:rls` eksikti: "function enter_system_scope does not exist"); CI sırasına uyuldu
2. koşu: Test Files 1 failed | 226 passed | 3 skipped · Tests 1 failed | 2670 passed | 14 skipped
   tek kırmızı: tests/agency-invite.live.test.ts:451 (SystemAlert tekrar sayacı); tek başına 2/2 geçti → iş kodundan bağımsız, dalgalı
3. koşu: Test Files 227 passed | 3 skipped (230) · Tests 2671 passed | 14 skipped (2685), EXIT=0
Tenant sayısı: önce 1 → sonra 1 (her koşudan sonra)
tsc --noEmit (temiz worktree) → exit 0, 0 satır · pnpm lint → exit 0
```

## TİK (21:05 UTC, 2 mac + 1 Linux cron worker)

(bekliyor)

## Sonraki adım

- **devop-fb:**
  - B-1: migration'a geriye dönük doldurma ve test ekle; ADR §9.2, migration başlığı ve kod yorumundaki "yanlış sırada bile" iddiasını düzelt.
  - B-2: Dockerfile'da aşama sırası ve builder'a `prisma generate`; compose'a `target: runner`. Hedefsiz derleme + `curl` kanıtı. Yama taslağı: `scratchpad/dockerfile-fix.patch`.
  - Ö-1 testleri isteğe bağlı: M6, M7, M9.
- Düzeltmeden sonra yeniden inceleme gerekir. Yalnız B-1 ve B-2'ye bakmak yeter.

## Temizlik

- Kapatılan kendi süreçlerim ve konteynerlerim: worker'lar D ve E (SIGTERM, cwd = kendi worktree'm), `crwfb-i38-wkr`, `crwfb-i38`.
- Silinen imajlar: `crwfb-i38-{worker,web,runner,fixed}:tmp`.
- Worktree `git worktree remove --force` ile kaldırıldı.
- Paylaşılan ağaçta yalnız bu rapor dosyası commit'lendi.

## Platform beyanı

- **mac** üzerinde doğrulandı: Darwin 27.0, Node 26.5.0, pnpm 11.25.0, Docker Desktop, Postgres 16 (pgvector konteyneri).
- **Linux** üzerinde de koştu: worker imajı Docker Desktop'ın Linux VM'inde çalıştı (aarch64, Node v22.23.3). Aynı DB'deki cron'a katıldı. Düzeltilmiş web imajı da Linux konteynerinde koştu ve HTTP 307 döndü. Tam süit Linux'ta koşulmadı; CI (ubuntu) koşacak.
- **Windows** koşulamadı, çünkü makinede yalnız macOS var. Koddan bakıldığında:
  - Tek platforma bağlı yol worker'ın kapanması. graphile-worker SIGTERM ve SIGINT dinliyor; Windows'ta düzgün kapanma yalnız Ctrl+C (SIGINT) ile olur.
  - Cron eşleştirmesi UTC alanlarıyla yapılıyor (`schedule.ts` `digest`), makinenin saat diliminden bağımsız.
  - B-2 (Docker aşama sırası) platformdan bağımsız, her yerde aynı sonucu verir.
