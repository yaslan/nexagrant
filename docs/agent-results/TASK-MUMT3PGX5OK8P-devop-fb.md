# TASK-MUMT3PGX5OK8P: Inngest → graphile-worker geçişi (ADR-0008) · devop-fb

**Sonuç:** 10 zamanlanmış iş graphile-worker'da koşuyor, Inngest koddan tamamen çıktı.

- Faz 0'daki üç açık kapandı: Ö-1 (kredi idempotency), Ö-2 (dağıtım sırası ve kilit), Ö-3 (kaçırılmış tik alarmı).
- Her iş yerelde gerçekten koştu; log ve DB satırı var.
- Bir cron tiki üç instance'ta (2 mac süreci, 1 Linux konteyneri) tam bir kez koştu.
- Kapılar: typecheck ve lint 0 hata; tam vitest 219 dosya geçti, 2 atlandı; temiz worktree'de `pnpm build` exit 0; `docker build --target worker` exit 0.
- `/usr/bin/grep -rni inngest src package.json .env.example` hiçbir satır döndürmüyor.
- `.env` geçmişte **hiç commit'lenmemiş**. Entra satırları yerel `.env`'den silindi.
- Push yapılmadı.

## 1) Ne yapıldı

| Commit | İçerik |
|---|---|
| `2c20324f` | **Ö-1.** `CreditLedger.grantPeriod` + `@@unique([tenantId, grantPeriod])`, migration `credit-ledger-grant-period.sql`, `createMany … skipDuplicates`. RLS rolüyle test yazıldı. |
| `fbf23850` | İş gövdeleri `src/lib/inngest/jobs` → `src/lib/jobs/tasks`, `events.ts` → `src/lib/jobs/events.ts`. Saf taşıma ve yol güncellemesi (36 dosya). |
| `5ed2261a` | Worker, 10 iş sarmalayıcısı, `job-queue-health` (Ö-3), `JOBS_CRON_ENABLED` kilidi (Ö-2), `pnpm jobs:worker` / `jobs:enqueue`, Dockerfile `worker` hedefi ve compose servisi. **Inngest bu commit'te söküldü.** Worker ile Inngest route'u kodda hiç yan yana durmadı. |
| `fe7066bf` | ADR-0008 KABUL ve UYGULANDI, §9: Ö-1..Ö-3, dağıtım sırası, uygulanan tasarım. |
| `a40b6bf4` | Dockerfile deps aşamasına `pnpm-workspace.yaml` kopyası eklendi. Bu dosya olmadan pnpm 11 `ERR_PNPM_IGNORED_BUILDS` veriyor ve **hiçbir imaj derlenmiyordu** (önceden var olan kusur). Yalnız Inngest'in getirdiği `protobufjs` girdisi silindi. |

**Tasarım** (ayrıntı ADR-0008 §9):

- `src/lib/jobs/schedule.ts` tek tablodur. Crontab, görev listesi ve kaçırılmış tik kontrolü buradan türer.
  - Cron ifadeleri eskisinin aynısı (UTC).
  - `max=5` (eski varsayılan: 1 deneme + 4 tekrar).
  - `fill`: günlük işlerde `6h`, haftalık ve aylık işlerde `1d`.
  - `agency-monthly-report` `queue=agency` kuyruğunda (eski `concurrency: 1` karşılığı).
  - Yeni iş: `job-queue-health`, her saat :05'te.
- `src/lib/jobs/define.ts` iş sarmalayıcısıdır:
  - Tik zamanını `payload._cron.ts`'ten alır.
  - START/DONE loglar.
  - `{success:false}` sonucunu loglar ama tekrar denemez (eski davranış korundu).
  - Fırlatılan hatayı kuyruğa bırakır, kuyruk tekrar dener.
  - Son denemede `job-queue:<iş>:exhausted` alarmını yazar.
- k2, credits ve agency artık ayı "şimdi"den değil **tikten** alır. Geç koşan bir tekrar deneme bir sonraki aya kaymaz.
- Olay yolu: kodda `inngest.send` hiç yoktu. `agency/report.generate` olayı ve pano "Invoke" düğmesinin yerini `pnpm jobs:enqueue -- <iş> [--period|--month|--payload|--force]` aldı (`jobKey` + `unsafe_dedupe`). Ajans dönemi kuyruğa girmeden doğrulanır.
- **Kalkanlar:** `inngest` paketi, `src/lib/inngest/client.ts`, `/api/inngest`, `INNGEST_*` ortam değişkenleri, `assertInngestDevModeAllowed` ve testi, iki "export var mı" testi, `next.config` girdisi.
- Admin ayarlarındaki sabit "Inngest Cron Suite: 7 Aktif Görev" satırı artık i18n'li ve gerçek iş sayısını gösteriyor.
- `.env.example`: `JOBS_CRON_ENABLED`, `JOBS_DATABASE_URL`, `JOBS_CONCURRENCY`.
- Dockerfile tabanı `node:22-alpine` (graphile-worker ≥ 22.18 istiyor; CI zaten 22).

**EK (`.env`):**

- `git log --all --oneline -- .env` boş döndü. 997 commit'in hiçbirinde `.env` eklenmemiş (`--diff-filter=A` taraması boş). Dosya `.gitignore:34` (`.env*`) ile yok sayılıyor.
- **KRİTİK bulgu yok.**
- `AUTH_MICROSOFT_ENTRA_ID_ID` ve `_SECRET` satırları yerel `.env`'den silindi: önce 2 satır, sonra 0. Değerler basılmadı.
- Yerel `.env`'deki `INNGEST_EVENT_KEY` ve `INNGEST_SIGNING_KEY` artık hiçbir kod tarafından okunmuyor. ADR §7 kuralı gereği Inngest anahtarları canlıda bir ay geçene kadar silinmiyor; bu yüzden dokunmadım.

## 2) Kanıt

**Ö-1: test ve mutant.** RLS rolüyle, `fabrika_app` NOBYPASSRLS.

```
cron-tenant-scope.test.ts → Tests 11 passed (11)
  aynı ay 2× ve paralel 2× → kiracı başına 1 satır; sonraki ay +2; grantPeriod'suz satırlar serbest
Mutant (yazımdan grantPeriod düşürüldü) → × a second run for the same month grants nothing … 1 failed | 10 passed
migration paylaşılan DB'ye 2× uygulandı: 2. koşu "already exists, skipping" (idempotent)
```

**Faz 2: gerçek koşular.** İzole kopya DB `fabrika_devopfb_jobs` kullanıldı: `pg_dump fabrika -N graphile_worker` ile alındı, iş bitince `DROP` edildi. Paylaşılan `fabrika` DB'sine iş koşturulmadı. Tam loglar `docs/agent-results/TASK-MUMT3PGX5OK8P-evidence/` altında.

```
[jobs] queued: alerts-sweep job=1 … agency-monthly-report job=10 key=agency-report:2026-08
[jobs] enqueue failed: agency report period 2026-09 refused: only 2026-08, the last closed month, can be generated now
A: alerts-sweep{1} DONE {"success":true,"scanned":377,"closed":0}
A: k2-monthly-cordis{8} DONE (reported failure) {"success":false,"message":"fetch failed"}   ← Python worker kapalı: SystemAlert, tekrar deneme yok
A: agency-monthly-report{10} DONE {"success":true,"period":"2026-08","agencies":0,…}
B: stripe-event-cleanup{2} DONE {"success":true,"deletedCount":0}
B: feedback-weekly-digest{3} DONE {… "emailStatus":"skipped","emailReason":"no_recipient"}
B: users-scheduled-deletion{4} DONE {"success":true,"dueCount":0,"purgedCount":0,"failedCount":0}
B: alerts-daily{5} DONE (reported failure) {"totalSearches":2,"emailsFailed":2,"reason":"send_failed"}
B: m4-weekly-summary{6} DONE {"success":true,"totalPendingActions":0,…}
B: credits-monthly-grant{7} DONE {"period":"2026-09","grantedCount":1,"alreadyGrantedCount":0,"totalCreditsGranted":500}
B: k1-daily-calls{9} DONE {"totalProcessed":1044,"inserted":3,"updated":1041,"sediaCount":995,"eurostarsCount":1,"tubitakCount":54,…}
credits 2. kez (job 11) → {"grantedCount":0,"alreadyGrantedCount":1,"totalCreditsGranted":0}
```

DB satırları (`db-evidence.txt`):

```
CreditLedger: demo-tenant | 500 | monthly_grant | monthly_grant:2026-09 | 2026-09   (tek satır; 2. koşu yazmadı)
SystemAlert: alerts-daily warn "2 of 2 saved-search alerts failed"
             k2_monthly_cordis error "CORDIS worker unreachable: fetch failed"
             k1_daily_calls warn "K1 sources returned 6 identifier(s) more than once…"
RawFetch: sedia HORIZON-… 19:15:34 (k1)          graphile_worker.jobs: 0 kalan iş
```

**Ö-3: kaçırılmış tik, canlı.** Kopyada k2 kaydı `known_since=2026-08-01` ve `last_execution=2026-08-01 04:00` yapıldı, ardından `jobs:enqueue -- job-queue-health` çalıştırıldı.

```
[job-queue-health] DONE {"success":true,"missed":["k2-monthly-cordis@2026-09-01T04:00:00.000Z"],"exhausted":0,"stuck":0}
SystemAlert error job-queue: "k2-monthly-cordis did not run for its 2026-09-01T04:00:00.000Z tick (last run 2026-08-01T04:00:00.000Z): no worker was up within the job's backfill window. Run it by hand with `pnpm jobs:enqueue -- k2-monthly-cordis` …"
```

**Tekrar deneme ve son deneme alarmı, canlı.** Geçersiz yükle bir iş eklendi: `users-scheduled-deletion --payload '{"gracePeriodDays":-1}'`.

```
attempt 1/5 (w-a71660) FAIL · 2/5 (w-47d8b2) · 3/5 (w-47d8b2) · 4/5 (w-16d0fe) · 5/5 (w-47d8b2) FAIL   ~88 sn, üstel bekleme
SystemAlert error job-queue "users-scheduled-deletion gave up after 5 attempts: …"
graphile_worker.jobs: 13 | users-scheduled-deletion | 5 | 5 | last_error …   (tabloda kalıyor)
aynı anahtarla yeniden ekleme → "already present (not added)"  (unsafe_dedupe; --force gerekir)
```

**Ö-2: kilit, canlı.**

```
NODE_ENV=production JOBS_CRON_ENABLED=  → exit 1, "JobsCronUnsetInProductionError: ❌ JOBS_CRON_ENABLED is not set on a production worker…"
NODE_ENV=production JOBS_CRON_ENABLED=false → "[jobs] JOBS_CRON_ENABLED=false: this worker runs queued jobs only…", worker up;
   SystemAlert warn job-queue "A production job worker started with JOBS_CRON_ENABLED=false…"
```

**Cron tiki, üç instance'ta tek koşu.**

- A: mac, pid 13174. B: mac, pid 13175. C: Linux aarch64, Node 22.23.3, `docker build --target worker` imajı.
- Üçü aynı DB'ye bağlıydı.
- 20:05:00 UTC `job-queue-health` tiki (gerçek crontab satırı):

```
A: (yok)   C (linux): (yok)
B: [job-queue-health] START job=26 attempt=1/3 tick=2026-09-29T20:05:00.000Z
B: [job-queue-health] DONE  job=26 … {"success":true,"missed":["k2-monthly-cordis@2026-09-01T04:00:00.000Z"],"exhausted":1,"stuck":0}
_private_known_crontabs: job-queue-health | last_execution 2026-09-29 20:05:00+00 · graphile_worker.jobs (health): 0
SystemAlert: aynı iki job-queue satırı, yeni satır yok → alertRepeatCount 2, alertLastSeenAt 20:05:00   (dedupe)
```

Elle eklenen işler üç instance'a dağıldı: A 3, B 8, C (Linux) 1 (`stripe-event-cleanup{20} DONE`). Hiçbir iş iki kez koşmadı. İki mac worker'ı SIGTERM ile düzgün kapandı ("Global graceful shutdown complete").

**Kapılar.**

```
npx tsc --noEmit (paylaşılan ağaç ve temiz worktree)        → exit 0, 0 hata
pnpm -s lint (temiz worktree)                               → exit 0
npx eslint <değişen dosyalar>                               → exit 0
pnpm rls:bypass-check → ✅ no new tenant bypass (33 sanctioned) · pnpm rls:check → ✅ · pnpm i18n:check → ✅
vitest (iş dosyaları, paylaşılan ağaç)                      → 10 dosya, 127/127
TAM vitest, temiz worktree, DB = izole kopya                → Test Files 219 passed | 2 skipped (221) · Tests 2524 passed | 8 skipped
   paylaşılan fabrika "Tenant" sayısı önce/sonra: 2 / 2
temiz worktree (HEAD 84003f29): pnpm install --frozen-lockfile exit 0 · prisma generate exit 0 · pnpm build exit 0 (rota listesinde /api/inngest yok)
docker build --target worker → ilk deneme ERR_PNPM_IGNORED_BUILDS (önceden var olan kusur) → a40b6bf4 sonrası exit 0
/usr/bin/grep -rni inngest src package.json .env.example → çıktı yok (exit 1)
```

## 3) Değişen dosyalar

- **Yeni:**
  - `src/lib/jobs/{schedule,define,enqueue,worker}.ts`
  - `src/lib/jobs/tasks/job-queue-health.ts`
  - `scripts/jobs-worker.ts`, `scripts/jobs-enqueue.ts`
  - `tests/jobs-schedule.test.ts`
  - `prisma/migrations/credit-ledger-grant-period.sql`
  - `docs/agent-results/TASK-MUMT3PGX5OK8P-evidence/*`
- **Taşınan ve değişen:** `src/lib/jobs/tasks/*.ts` (10 iş), `src/lib/jobs/events.ts`.
- **Silinen:** `src/lib/inngest/client.ts`, `src/app/api/inngest/route.ts`, `tests/inngest{,-jobs,-dev-mode}.test.ts`.
- **Değişen:**
  - Kök ve yapılandırma: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.env.example`, `Dockerfile`, `docker-compose.yml`, `next.config.ts`.
  - Prisma: `prisma/schema.prisma`, `prisma/migrations/apply-order.txt`.
  - Kaynak: `src/lib/env.ts`, `src/instrumentation.ts`, `src/app/[locale]/admin/settings/page.tsx`, `messages/{tr,en}.json`, `src/lib/feedback/digest{,-run}.ts`, `src/lib/agency/report.ts`, `src/lib/k2-cordis/raw-fetch.ts`, `src/lib/saved-search-filters.ts`.
  - Betikler: `scripts/run-{k1-daily,k2-monthly,alerts-sweep,feedback-digest}.ts`, `scripts/tenant-bypass-baseline.json`.
  - Import yolu güncellenen testler: `src/modules/m8/server/schema-contract.test.ts` ve `tests/*`.
  - `docs/adr/ADR-0008-own-job-queue-graphile-worker.md`.
- **Yerel ve commit'siz:** `.env` (2 Entra satırı silindi).
- **Paylaşılan dev DB:** yalnız additive migration uygulandı (`grantPeriod` sütunu ve index). İş koşturulmadı.

## 4) Riskler

- **Dağıtım sırası (Ö-2) bir kuraldır, kod bunu tek başına garanti edemez.** Kod yalnız üretimde bayrağın açıkça verilmesini zorluyor. Eski Inngest bulut uygulaması senkronlanmadan worker `true` ile kalkarsa e-posta gönderen işler (alerts-daily, feedback digest) bir tik boyunca iki kez koşabilir. Kredi işi Ö-1 sayesinde çift yazmaz. **[Düzeltme, İNCELEME-38 B-1: yanlış. Eski kodun yazdığı satır anahtarın dışında kalıyordu; doldurma + `hasLegacyGrant` eklendi, "önce worker, sonra eski kod" sırası yine açık. Bkz. `TASK-MUMT3PGX5OK8P-devop-fb-2.md`.]** Sıra ADR §9.2'de yazılı; canlıya çıkarken RELEASE_CHECKLIST'e eklenmeli (cs-fb).
- **Barındırma kararı hâlâ açık** (ADR §4). Worker uzun yaşayan bir süreç; Vercel'de koşamaz. Kod hazır, canlıya çıkması barındırma kararına bağlı.
- **`step.run` belleği yok.** k1'in tekrar denemesi üç kaynağı baştan çeker. Upsert idempotent olduğu için veri kaybı yok, yalnız süre uzar.
- **Takılmış iş** graphile-worker'da 4 saat kilitli kalır. `kill -9` ile denenmedi. `job-queue-health` 4 saati aşanı alarm olarak yazıyor.
- **Web imajı** (`docker build` varsayılan hedef) bu turda uçtan uca derlenmedi; yalnız `worker` hedefi derlendi. İkisini ortak etkileyen deps kusuru düzeldi.
- **be-fb'nin commit'lenmemiş iki değişikliği yeni yola taşındı** (teardown-guard): `src/lib/jobs/tasks/__tests__/cron-tenant-scope.test.ts` ve `tests/gdpr-data-subject.live.test.ts`. Bunlar çalışma ağacında duruyor, benim commit'lerime girmedi. Göreli import derinliği değişmediği için kırılmıyor. be-fb bunları eski yol `src/lib/inngest/jobs/...` ile commit'lemeye çalışırsa yol artık yok; **yeni yolu kullanmalı.** Pane listesinden hangi oturumun be-fb olduğu anlaşılamadı, doğrudan mesaj gönderemedim.

## 5) Açık sorular (patron / diğer ajanlar)

1. **Barındırma:** kendi sunucu mu, Vercel mi (ADR §4)?
2. **`stripe-event-cleanup`:** Stripe pilotta olmadığı için iş taşındı. Silinsin mi?
3. **Belgeler (cs-fb'ye):** Inngest geçen dosyalar, parantez içi grep eşleşme sayısıyla:
   - `docs/INNGEST_SETUP.md` (41) ve `docs/INNGEST.md` (33): kaldırılmalı ya da yerine `docs/JOBS.md` yazılmalı.
   - `README.md` (13), "Yerel Inngest" bölümü.
   - `docs/ROADMAP.md` (11).
   - `docs/legal/HUKUK-SORULARI-2026-09.md` (7).
   - `docs/ARCHITECTURE.md` (3).
   - `docs/DATA_MODEL.md` (2); ayrıca yeni `CreditLedger.grantPeriod` sütunu.
   - `PROJECT.md`, `workers/README.md`, `docs/SECURITY_COMPLIANCE.md`, `docs/kamu/VERI-YERLESIMI.md` (birer).
   - `CLAUDE.md` Komutlar bölümü (`pnpm jobs:worker`, `jobs:enqueue`).
   - `docs/RELEASE_CHECKLIST.md` (ADR §9.2 dağıtım sırası).
   - `631c7d4c` envanteri zaten güncelledi.
4. **Kod içinde kalan açıklanan kalıntı** (kabul grep'inin kapsamı dışında, yalnız yorum): `tests/agency-report.live.test.ts:9`, `tests/stripe-event-retention.live.test.ts:258`, `tests/m4-weekly-summary.test.ts:13`, `tests/e2e/alerts-sweep-failure-console.spec.ts:16`. Bunlar "eski zamanlayıcı" anlamında tarihsel yorumlar; test dosyaları başkalarının aktif işi olduğu için dokunmadım. ADR-0008'de Inngest adı karar kaydı olarak kalıyor.

## 6) Sonraki adım

- cs-fb: yukarıdaki belge listesi ve RELEASE_CHECKLIST'e dağıtım sırası.
- be-fb: teardown değişikliklerini yeni yolla commit'lesin.
- Patron: barındırma kararı. Karar gelince canlı kurulum ADR §9.2 sırasıyla yapılır: web → Inngest app arşivle → worker `false` → `true`. Inngest hesabı ve anahtarları canlıda bir tam ay sorunsuz geçene kadar silinmez.
- İnceleme: crw-fb için öneri. `jobs-schedule.test.ts` ve iki mutant fikri:
  - `findMissedTicks` içinde `known_since` koşulunu kaldır; "registered" testi düşmeli.
  - `define.ts` içinde `attempts >= max` koşulunu `>` yap; exhausted testi düşmeli.

**Geri alma:**

- Kod: `git revert a40b6bf4 fe7066bf 5ed2261a fbf23850` Inngest route'unu, client'ı ve paketi geri getirir; ardından `pnpm install`.
- Ö-1'i geri almak isteğe bağlı: `git revert 2c20324f` + `DROP INDEX IF EXISTS "CreditLedger_tenantId_grantPeriod_key"; ALTER TABLE "CreditLedger" DROP COLUMN IF EXISTS "grantPeriod";`.
- Worker şeması: `DROP SCHEMA graphile_worker CASCADE`. Uygulama tabloları etkilenmez.
- Sıra: önce worker durdurulur, sonra Inngest'li sürüm dağıtılıp senkronlanır.

**İzleme ve uyarı:**

- `SystemAlert source='job-queue'`: tükenmiş iş (`exhausted`), kaçırılmış tik (`missed-tick`), 4 saatten uzun kilit (`stuck`), üretimde cron kapalı (`cron-disabled`).
- İşlerin kendi alarmları değişmedi: `k1_daily_calls`, `k2_monthly_cordis`, `alerts-daily`, `stripe-event-cleanup`, `agency-monthly-report`.
- Worker stdout'u her iş için START ve DONE/FAIL satırı yazar.

**Platform beyanı:**

- **mac** üzerinde doğrulandı: Darwin 27.0, Node 26.5.0, pnpm 11.25.0, Docker Postgres 16 (`fabrika-postgres`).
- **Linux** üzerinde de koştu: worker imajı Docker Desktop Linux VM'inde (aarch64, Node 22.23.3) üçüncü instance olarak cron'a katıldı ve bir iş tamamladı. Tam test süiti ve build Linux'ta koşulmadı; CI (ubuntu, Node 22) bunu yapacak.
- **Windows** hedef değil ve koşulmadı, çünkü makinede yalnız macOS var.
- Koddan bakıldığında platforma bağlı tek nokta düzgün kapanma: graphile-worker SIGTERM ve SIGINT dinliyor. Windows'ta SIGTERM gönderilemez, yalnız Ctrl+C (SIGINT) ile düzgün kapanır.
- Dosya yolu, kabuk ya da ikiliye bağlı iş kodu yok. Cron eşleştirmesi UTC alanlarıyla yapılıyor, makinenin saat diliminden bağımsız.
