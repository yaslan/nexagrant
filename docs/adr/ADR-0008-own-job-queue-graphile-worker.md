# ADR-0008 — Inngest yerine kendi iş kuyruğumuz: graphile-worker (Postgres)

- **Durum:** KABUL (patron onayı 29.09.2026). **Uygulandı:** TASK-MUMT3PGX5OK8P (commit'ler `2c20324f`, `fbf23850`, `5ed2261a`; ayrıntı §9). "Inngest kalkıyor" kararı 29.09.2026'da verildi (ROADMAP açık karar #3). Barındırma kararı (§4) hâlâ açık.
- **Tarih:** 2026-09-29
- **Kart:** TASK-MUMLFDTNQ53VJ (FB-GAP-1, karar ve deneme). Taşıma: TASK-MUMT3PGX5OK8P (tek kart, §9).
- **Hazırlayan:** DEVOP-FB
- **Deneme dalı:** `spike/job-queue`. Deneme kodu dev'e girmez.

## 1. Bağlam

Patron 29.09'da "dış servis yok" dedi. Bu kararla Sentry, Resend ve Inngest üründen çıkıyor. Bugün 10 zamanlanmış iş Inngest bulutunda tetikleniyor. Inngest, `POST /api/inngest` ile Next.js sürecine gelip işi orada koşturuyor. Bu yüzden kod bizde koşuyor ama zamanlama, tekrar deneme, eşzamanlılık sınırı ve çalışma geçmişi Inngest'te tutuluyor.

Kaynaklar: `src/lib/inngest/client.ts`, `src/lib/inngest/jobs/*.ts`, `src/app/api/inngest/route.ts`, `docs/INNGEST.md`.

## 2. Envanter: Inngest'e kayıtlı işler

Kod `dev` `a9e6c4ac` üzerinde okundu. Hiçbir işte `retries` ayarı yok, yani her `step.run` Inngest varsayılanıyla **4 kez daha denenir (toplam 5 deneme)**. Tek istisna `agency-monthly-report` içindeki `NonRetriableError`. Hiçbir iş Inngest tarafında advisory lock kullanmıyor. `concurrency` ayarı yalnız bir işte var.

"Tipik süre" için ölçüm yok. Inngest çalışma geçmişi bizde değil. `SystemAlert` tablosunda süre bilgisi olan bir çalışma satırı da yok (29.09'da paylaşılan DB'de `source` bazında sayıldı). Bu yüzden süre sütunu koddan yapılmış bir **tahmindir**. Taşıma kartında her iş için ölçülmelidir.

| # | İş (`id`) | Tetikleyici (UTC) | Adımlar (`step.run`) | Tekrar deneme | Eşzamanlılık / kilit | Tahmini süre (ölçülmedi) | Not |
|---|---|---|---|---|---|---|---|
| 1 | `k1-daily-calls` | cron `0 2 * * *` | 4: sedia, eurostars, tubitak, normalize-and-upsert | varsayılan (5 deneme / adım) | yok | dakikalar (3 dış API + upsert) | Adım belleği önemli: son adım düşerse Inngest üç kaynağı yeniden çekmez |
| 2 | `k2-monthly-cordis` | cron `0 4 1 * *` | 1: trigger-cordis-worker | varsayılan, ama iş **hiç throw etmez** (hata → `SystemAlert` + `success:false`), yani fiilen hiç yeniden denenmez | yok | dakikalar-onlarca dakika (Python worker hattı bitirmeden cevap vermez) | HTTP isteği hat boyunca açık kalır |
| 3 | `alerts-daily` | cron `0 8 * * *` | 3: fetch, send-alerts, record-failure-alert | varsayılan | yok | saniyeler (bugün 2 kayıtlı arama) | Tüm kiracılar (`withSystemScope`) |
| 4 | `credits-monthly-grant` | cron `0 6 1 * *` | 2: fetch-active-tenants, grant-credits | varsayılan | yok | saniyeler (49 kiracı) | Tekrar koşarsa çift kredi riski: iş içi idempotency taşımada doğrulanmalı |
| 5 | `m4-weekly-summary` | cron `0 9 * * 1` | 2: fetch-pending-actions, group-and-notify | varsayılan | yok | saniyeler | E-posta gönderir |
| 6 | `users-scheduled-deletion` | cron `0 3 * * *` | 1: purge-due-users | varsayılan | yok | saniyeler | KVKK silme; olay girdisi `gracePeriodDays` yalnız test için |
| 7 | `feedback-weekly-digest` | cron `0 6 * * 1` | 1: build-and-send-digest | varsayılan | yok | saniyeler | E-posta gönderir |
| 8 | `alerts-sweep` | cron `15 4 * * *` | 1: sweep-orphan-tenant-alerts | varsayılan | yok | saniyeler | Art arda hata sayacı `SystemAlert` üzerinden (`ALERTS_SWEEP_FAILURE_THRESHOLD`) |
| 9 | `stripe-event-cleanup` | cron `0 2 * * *` | 2-3: delete-old-events, record-cleanup-stat / record-error-alert | varsayılan | yok | saniyeler | Stripe pilotta yok; iş kalabilir, maliyeti düşük |
| 10 | `agency-monthly-report` | cron `0 6 1 * *` **+ olay** `agency/report.generate` | 1: generate-agency-reports | varsayılan; dönem reddinde `NonRetriableError` | **`concurrency: { limit: 1 }`** | saniyeler-dakika (ajans sayısı) | Olayı koddan gönderen yok (`inngest.send` hiçbir yerde yok). Elle tetikleme yalnız Inngest panosundan yapılıyor |

Inngest dışındaki advisory lock'lar (`pg_advisory_xact_lock`) iş kuyruğundan bağımsızdır ve aynen kalır: `src/lib/iyzico.ts` (webhook olayı), `src/lib/billing/pilot.ts` (pilot satırı), `src/lib/k3-topic-stats/importer.ts` (içe aktarma).

Elle çalıştırma betikleri zaten var ve kuyruktan bağımsız: `pnpm jobs:k1`, `jobs:k2`, `jobs:alerts-sweep`, ayrıca `scripts/run-feedback-digest.ts`. İş gövdeleri çoğunlukla `runX()` / `sendX()` diye ayrılmış durumda. Taşımada yalnız sarmalayıcı değişir.

## 3. Seçenekler (1-3-1)

**Sorun:** Zamanlanmış ve elle tetiklenen işleri Inngest olmadan koşturmalıyız. Postgres dışında altyapı istemeyecek, tekrar deneyecek, aynı işi iki kez koşturmayacak, birden fazla instance'ta güvenli çalışacak ve `SystemAlert` ile izlenebilecek bir yol gerekiyor.

| Ölçüt | (a) pg-boss 12.35 | (b) graphile-worker 0.18 | (c) node-cron + kendi iş tablomuz |
|---|---|---|---|
| Postgres dışı altyapı | Yok. Kendi `pgboss` şeması | Yok. Kendi `graphile_worker` şeması | Yok |
| Cron | Var (`schedule()`) | Var (crontab satırı) | Var (node-cron), ama her instance kendi saatini tutar |
| Kaçırılan tik (sunucu kapalıyken) | `schedule(..., { missed: 'once' })`: kaçan tiklerden yalnız en sonuncusu için bir iş (varsayılan `skip`; `dist/types.d.ts` okundu, denenmedi) | `fill=<süre>`: pencere içindeki her kaçan tik bir kez, tik zamanı `payload._cron.ts` içinde | Kendimiz yazarız |
| Tekrar deneme | Var: `retryLimit`, `retryBackoff`, ölü mektup kuyruğu | Var: `max_attempts`, üstel bekleme (`exp(min(deneme,10))` sn) | Kendimiz yazarız |
| Aynı işin iki kez koşmaması | `singletonKey` ve kuyruk politikası (`singleton` / `stately`) | Cron: tik başına tek iş (`known_crontabs`). Elle: `jobKey` yalnız **bekleyen** işi tekilleştirir. Çalışan iş varken ikinci bir iş açılır; bunu önlemek için `jobKeyMode:'unsafe_dedupe'` kullanılır (§5 D4) | `UNIQUE(job, tick)` + advisory lock; doğruluğu bize kalır |
| Çoklu instance | `SKIP LOCKED` ile güvenli | `SKIP LOCKED` ve LISTEN/NOTIFY ile güvenli | Tasarıma bağlı |
| Eşzamanlılık 1 (agency) | Kuyruk politikası `singleton` | `queue_name`: aynı kuyruk tüm instance'larda sırayla koşar | advisory lock |
| Takılan iş (süreç öldü) | `expireInSeconds` (varsayılan 15 dk) sonra yeniden dener | Kilit 4 saat sonra düşer | Kendimiz yazarız |
| İzlenebilirlik (`SystemAlert`) | Sorgulanabilir `pgboss.job` tablosu; `SystemAlert` yazmayı biz ekleriz | Sorgulanabilir `_private_jobs`; başarısız iş tabloda `last_error` ile kalır; `SystemAlert` yazmayı biz ekleriz | Tamamen bizde |
| Bakım yükü | Kütüphane | Kütüphane | Tahminen 300-500 satır kod ve test, sahibi biz |
| Node sürümü | ≥22.12 (bizde 26.5) | ≥22.18 (bizde 26.5) | ≥20 |

İki kütüphane de `pg` ile bağlanır. `pg` bağımlılığı bizde zaten var (`@prisma/adapter-pg` kullanıyor). İki kütüphane de kendi şemasını ilk açılışta kendisi kurar. Prisma yalnız `public` şemasını yönetir, bu yüzden `prisma migrate` bu şemalara dokunmaz.

**Öneri: (b) graphile-worker.** İki kütüphane de ölçütlerin hepsini karşılıyor. Fark küçük olduğu için seçimi şu üç gerekçe belirliyor:

1. **Tik başına tek koşu ve geriye dönük koşturma bu repoda iki instance ile ölçüldü (§5).** pg-boss yalnız okundu ve denenmedi.
2. **İş, hangi tik için koştuğunu bilir.** graphile-worker her cron işine `payload._cron.ts` alanını ekler. Tekrar denenen ya da geriye dönük koşturulan bir iş, "şimdi"nin ayını değil, zamanlandığı tikin ayını işler. Bugün `k2` ve `agency` ayı `new Date()`'ten hesaplıyor. Ayın 1'inde gece yarısına yakın gecikmiş bir tekrar denemede bu yanlış aya kayabilir. pg-boss'ta kaçan tik için gönderilen işin tik zamanını taşıyıp taşımadığı doğrulanmadı.
3. **`queue_name`, Inngest'teki `concurrency: { limit: 1 }` ayarının doğrudan karşılığıdır.** Denemede ölçüldü (§5 D3). `jobKey`'in sınırı da denemede ortaya çıktı (§5 D4) ve §6.5'te kurala bağlandı.

pg-boss'un üstün olduğu yerler şunlar. Takılan bir iş `expireInSeconds` sayesinde 15 dakikada geri gelir; graphile-worker'da bu süre 4 saat. Ayrıca pg-boss'un hazır bir ölü mektup kuyruğu var. Bizim işlerimiz günlük ve aylık olduğu için 4 saat kabul edilebilir. Ölü mektup kuyruğunun yerini `job-queue-health` işi tutar (§6.4). Patron pg-boss'u seçerse ADR'nin geri kalanı (§4, §6, §7) aynen geçerlidir; yalnız A kartındaki kütüphane değişir.

(c) sıfır bağımlılık verir ama kilit, tekrar deneme, backfill ve takılan iş mantığını bize yazdırır. Bu mantığın doğruluğunu kanıtlamak, bir kütüphaneyi denemekten pahalıdır.

## 4. Kararın getirdiği kısıt: uzun yaşayan bir süreç gerekir

Inngest'te Next.js yalnız HTTP ile çağrılıyordu, bu da sunucusuz (Vercel) ortamda çalışıyordu. Hangi kütüphane seçilirse seçilsin, kuyruğu dinleyen **sürekli açık bir Node süreci** gerekir: `pnpm jobs:worker`. `docs/ARCHITECTURE.md` hâlâ "Next.js (Vercel)" diyor. Barındırma sağlayıcısı henüz belli değil (hukuk paketi 1.2 açık soru).

- Kendi sunucumuz ya da konteynerimiz varsa worker, Next.js'in yanında ikinci bir süreç olarak koşar (systemd/docker, `restart=always`). Birden çok kopya açmak güvenlidir (§5).
- Vercel'de kalınacaksa worker orada çalışamaz. Bu durumda ya ayrı bir makine gerekir ya da (c)'nin bir türevi gerekir (dış cron bir uca istek atar ve kilit DB'de tutulur). Bu da "dış servis yok" kararıyla çelişir.

**Patrondan istenen:** barındırma kararı (kendi sunucu mu, Vercel mi). Taşıma kartı A bu karar olmadan kod olarak yapılabilir, ama canlıya çıkamaz.

## 5. Deneme (spike) sonuçları

Ortam: mac (Darwin 27.0, Node 26.5.0, Postgres 16.15 docker `fabrika-postgres`). İzole DB `fabrika_devopfb_jobq` kullanıldı (paylaşılan `fabrika` DB'sinin yalnız şeması kopyalandı, veri yok). Dal: `spike/job-queue`, worktree. graphile-worker 0.18.0 kullanıldı. İş, **gerçek** `runK2MonthlyCordis()` fonksiyonudur (Inngest cron'unun bugün çağırdığı fonksiyon). Python worker yerine her çağrıyı sayan sahte bir HTTP sunucusu (`scripts/spike-jobq/mock-cordis-worker.ts`) koştu. Deneme için cron her dakika çalıştı. İki worker süreci (A, B) aynı DB'ye bağlandı; her birinde `concurrency: 2` ayarı vardı.

**D1 — iki instance, tik başına tek koşu, tekrar deneme (run 1, 12:05-12:07 UTC).** Mock'un ilk cevabı 503 idi.

```
[A] 12:06:00.014Z START job=1 attempt=1/3 tick=2026-09-29T12:06:00.000Z month=2026-09
[A] 12:06:03.174Z FAIL  job=1 attempt=1: Worker responded with status 503
[A] 12:06:05.910Z START job=1 attempt=2/3 tick=2026-09-29T12:06:00.000Z     <- ~2,7 sn üstel bekleme
[A] 12:06:08.931Z DONE  job=1 attempt=2
[A] 12:07:00.010Z START job=2 attempt=1/3 tick=2026-09-29T12:07:00.000Z
[A] 12:07:03.038Z DONE  job=2 attempt=1
mock: hit=1 -> 503, hit=2 -> 200, hit=3 -> 200           (2 tik = 2 iş = 3 çağrı; B aynı tik için iş almadı)
RawFetch (key 2026-09): 12:06:03 503 · 12:06:08 200 · 12:07:03 200
SystemAlert: warn k2_monthly_cordis "CORDIS worker returned HTTP 503" + her deneme için 1 jobq-spike satırı
```

**D2 — kapalıyken kaçan tik'lerin geriye dönük koşturulması (run 2).** İki worker 12:07:39 ile 12:09:14 arasında kapalıydı. Açılınca (`fill=2m`) kaçan iki tik birer kez koştu, biri B'de biri A'da. Sonraki canlı tik yine tek iş üretti:

```
[B] 12:09:15.330Z START job=3 tick=2026-09-29T12:08:00.000Z   DONE 12:09:20.469Z
[A] 12:09:20.859Z START job=4 tick=2026-09-29T12:09:00.000Z   DONE 12:09:26.035Z
[A] 12:10:00.010Z START job=9 tick=2026-09-29T12:10:00.000Z   DONE 12:10:05.036Z
_private_known_crontabs: k2-monthly-cordis last_execution 2026-09-29 12:10:00+00
```

**D3 — `queue=k2` iki instance boyunca sırayla koşar (Inngest `concurrency: 1`).** Backfill edilen iki iş ve elle eklenen iki iş (2026-08, 2026-07) aynı kuyruktaydı. Her worker'ın 2 boş yeri olmasına rağmen hiçbir iş bir öncekiyle çakışmadı (her iş 5 sn sürdü):
`job3 15.33→20.47 · job4 20.86→26.04 · job5 26.04→31.07 · job7 31.42→36.44`.

**D4 — `jobKey` ile tekilleştirme.** Diğer işler kuyrukta sırasını beklerken (run 2) aynı anahtarla iki kez eklenen iş tek iş kaldı: `[enqueue] first=5 second=5 same=true`. **Ama** ilk iş çoktan başlamışken (run 3, tek worker, boş kuyruk) ikinci ekleme yeni bir iş açtı: `first=10 second=11 same=false`. Kütüphanenin `add_job` SQL'i (varsayılan `replace` kipi) bunu doğruluyor. Kilitli işin anahtarı boşaltılıyor ve `attempts=max_attempts` yapılıyor; iş 10 tabloda `attempts=3` olarak kaldı ama yalnız 1 kez koştu. `unsafe_dedupe` kipi ise "kilitli ya da kalıcı başarısız dahil, aynı anahtarlı iş varsa ekleme" diyor (`dist/interfaces.d.ts:479`). Sonuç §6.5'te kurala bağlandı.

**D5 — son deneme `SystemAlert` yazar (run 3).** Mock hep 503 döndü, `max=3`:

```
job=11 attempt 1 12:11:05.5 · attempt 2 12:11:08.5 (+3 sn) · attempt 3 12:11:16.7 (+8 sn)
graphile_worker.jobs: id 11 attempts 3/3 last_error "Worker responded with status 503"   (başarısız iş tabloda kalıyor)
SystemAlert: error | job-queue | k2-monthly-cordis gave up after 3 attempts: Worker responded with status 503 | 2026-06
```

**Deneme sırasında çıkan hata (düzeltildi, ayrı kart açıldı).** İlk koşuda hiçbir `SystemAlert` ya da `RawFetch` satırı yazılmadı: `Authentication failed ... credentials for 'fabrika'`. Kök neden: `import dotenv; dotenv.config(); import ...` deseninde importlar `dotenv.config()`'ten önce değerlendiriliyor. `src/lib/db.ts:6` ise `DATABASE_URL`'i yükleme anında okuyor ve bulamayınca `localhost:5432` varsayılanına düşüyor. `import 'dotenv/config'` ile düzeldi. Aynı desen üretim betiği `scripts/run-k2-monthly.ts`'te de var ve etkisi yeniden üretildi (`pnpm jobs:k2` hatayı yutup exit 0 dönüyor). Kart: **TASK-MUMMQDJPXQH63**. Taşımada worker giriş dosyasının ilk satırı `import 'dotenv/config'` olmalı ya da ortam süreç yöneticisinden gelmeli.

**Ölçülmeyenler:** worker süreci `kill -9` ile öldüğünde kilitli işin 4 saat sonra geri gelmesi (kütüphane belgesine dayanıyor, denenmedi) · pg-boss (yalnız paket kaynağı okundu) · Linux ve Windows (§8).

## 6. Tasarım kuralları (taşıma kartları için)

1. **İş gövdesi kuyruktan bağımsız kalır.** `runK2MonthlyCordis()` gibi fonksiyonlar değişmez. Değişen tek şey sarmalayıcıdır: `inngest.createFunction(...)` yerine `taskList['k2-monthly-cordis']`. Elle çalıştırma betikleri (`pnpm jobs:*`) aynı fonksiyonu çağırmaya devam eder.
2. **`step.run` belleği yoktur.** graphile-worker'da tekrar denenen iş baştan koşar. Bu en çok `k1-daily-calls`'u etkiler: son adım düşerse üç kaynak yeniden çekilir. Upsert idempotent olduğu için bu kabul edilebilir. Gerekirse iş, sonunda bir sonraki işi `addJob` ile ekleyen zincirli işlere bölünür. `credits-monthly-grant` baştan koşarsa kredinin iki kez verilmediği taşıma kartında **testle** kanıtlanır.
3. **Hata semantiği işe göre korunur.** "Hiç throw etmez" diye yazılmış işler (k2, alerts-sweep) yine throw etmez. Bu yüzden kuyruk bu işleri yeniden denemez; bugünkü davranış da budur. Yeniden deneme isteniyorsa iş, `success:false` durumunda throw eder. Denemede k2 bu şekilde koşturuldu.
4. **Son deneme `SystemAlert` yazar.** İş, `job.attempts >= job.max_attempts` olduğunda `level:'error', source:'job-queue'` yazar ve `dedupeKey: job-queue:<iş>:exhausted` kullanır. Buna ek olarak günlük bir `job-queue-health` işi, `_private_jobs` içinde son denemesini tüketmiş ya da 4 saatten uzun kilitli kalmış işleri `SystemAlert`'e yazar. Bu, işin kendi `SystemAlert` yazmasının da başarısız olduğu durumu yakalar.
5. **Cron satırları.** `?id=<iş>&max=<n>&fill=<süre>` biçiminde yazılır. `fill` değerleri: günlük işlerde `6h`, haftalık ve aylık işlerde `1d`. `agency-monthly-report` için `queue=agency` kullanılır. Olay yolu (`agency/report.generate`) için `addJob('agency-monthly-report', {period}, {queueName:'agency', jobKey:'agency-report:<period>', jobKeyMode:'unsafe_dedupe'})` çağrılır. Varsayılan `replace` kipi, çalışan bir işin üstüne ikinci bir iş açar (§5 D4). `unsafe_dedupe` ise kalıcı olarak başarısız olmuş işi de "var" sayar. Bu yüzden elle yeniden tetiklemeden önce, eski iş `graphile_worker.remove_job(key)` ile silinir. Ayrıca **iş gövdesi tek başına idempotent kalır**: agency zaten "raporu olan dönemi atla" kuralıyla çalışıyor, kuyruk tek savunma hattı değildir. Bunu tetikleyen bir yönetici ucu ya da `pnpm jobs:agency-report -- --period` betiği yazılır, çünkü Inngest panosu gidiyor.
6. **DB rolü.** Worker, kendi şemasını ilk açılışta kurar. Bunun için şemayı sahiplenebilecek bir rolle bağlanması gerekir. Üretimde ya `graphile-worker` şeması migrate rolüyle bir kez kurulur ve `fabrika_app` rolüne yetki verilir, ya da worker migrate rolüyle bağlanır. Taşıma kartı A bu seçimi yapıp belgeler. İşler bugün de `withSystemScope` kullanıyor; RLS davranışı değişmez.

## 7. Geçiş planı

**Sıra.** İşler riski düşükten yükseğe doğru taşınır. Her adımda iş Inngest route'undan **aynı commit'te** çıkarılır, böylece iki sistem aynı işi hiçbir an birlikte koşturmaz.

| Kart | İçerik | Tahmini süre |
|---|---|---|
| A | Worker altyapısı: `graphile-worker` bağımlılığı, `src/lib/jobs/runner.ts` (taskList + crontab), `pnpm jobs:worker`, şema/rol kurulumu, `job-queue-health` işi, systemd/docker birimi, `docs/JOBS.md`, iki instance testi (vitest + canlı DB) | 1 gün |
| B1 | Düşük riskli işler: `alerts-sweep`, `stripe-event-cleanup`, `feedback-weekly-digest`, `users-scheduled-deletion` | 0,5 gün |
| B2 | Kiracıya e-posta ya da kredi dokunan işler: `alerts-daily`, `m4-weekly-summary`, `credits-monthly-grant` (baştan koşma testiyle) | 0,5 gün |
| B3 | Dış kaynaklı ve aylık işler: `k1-daily-calls`, `k2-monthly-cordis`, `agency-monthly-report` (olay yolu + yönetici ucu) | 0,5-1 gün |
| C | Inngest'i sökmek: `inngest` paketi, `src/lib/inngest/client.ts`, `src/app/api/inngest/route.ts`, `INNGEST_*` ortam değişkenleri ve `assertInngestDevModeAllowed` (`src/lib/env.ts`), `docs/INNGEST*.md`, `processing-register` §21 ve hukuk paketi satırı | 0,5 gün |

Toplam tahmin 3-3,5 iş günü. Buna barındırma kararı ve canlıya kurulum dahil değil.

**Geri dönüş yolu:**

- B kartlarında her iş taşıma commit'i tek başına geri alınabilir. `git revert <sha>` işi Inngest route'una geri koyar ve kuyruktan çıkarır. Inngest hesabı ve anahtarları C kartı canlıda bir tam ay (bir aylık tik dahil) sorunsuz koşana kadar **silinmez**.
- Worker'ın kendisi geri alınırken şema düşürülebilir: `DROP SCHEMA graphile_worker CASCADE`. Uygulama tabloları etkilenmez.
- C kartından sonra geri dönüş, paketi ve route'u geri getiren revert ile olur. Anahtarlar hâlâ duruyorsa aynı gün yapılabilir.

**Kart A taslağı (panoya açılacak):**

> **Ajan:** DEVOP-FB · **Tip:** feature · **Sprint:** FB-GAP-1 · **Bağımlılık:** ADR-0008 onayı (patron) · **Platform kapsamı:** mac'te doğrulanır. Worker saf Node + Postgres olduğu için Linux sunucuda aynı kod koşar. **Bkz:** `docs/adr/ADR-0008-own-job-queue-graphile-worker.md`, `spike/job-queue` dalı (`scripts/spike-jobq/`).
> **Misyon:** Inngest'in yerini alacak worker sürecini kurmak. İş gövdeleri YENİDEN YAZILMAZ, çağrılır.
> **Yapılacaklar:** (1) `pnpm add graphile-worker@0.18.x`. (2) `src/lib/jobs/runner.ts`: `taskList` ve crontab tek yerde, işler ADR §2'deki cron ifadeleriyle. (3) `scripts/jobs-worker.ts` ve `pnpm jobs:worker`, SIGTERM'de düzgün kapanma. (4) Şema/rol kurulumu (ADR §6.6). (5) `job-queue-health` işi. (6) `deploy/` altına systemd birimi ya da Dockerfile hedefi. (7) `docs/JOBS.md`.
> **Doğrulama:** İki worker süreci aynı DB'ye bağlanır. Bir cron tikinde iş tam bir kez koşar (log + `SystemAlert` satırı). Bir iş, son denemede `job-queue` alarmı yazar. `pnpm typecheck`, `lint` ve `test` temiz geçer.
> **Kurallar:** Bu kartta Inngest route'undan iş çıkarılmaz (bu B kartlarının işi). Sonuç `docs/agent-results/<kart>-devop-fb.md` dosyasına yazılır.
> **DoD:** [ ] iki instance kanıtı [ ] son deneme alarm kanıtı [ ] health işi alarm kanıtı [ ] geri alma talimatı [ ] platform beyanı.

## 8. Platform

Deneme **mac**'te koşuldu. Worker saf Node + `pg` + Postgres kullanır; dosya yolu, kabuk ya da ikili dosyaya bağlı kod yolu yoktur. Bu nedenle üretim hedefi olan **Linux**'ta aynı kod koşar (**koşulamadı**: elde Linux sunucu yok, barındırma kararı bekleniyor). **Windows** hedef değildir. Kodda platforma bağlı tek nokta düzgün kapanmadır: graphile-worker SIGTERM ve SIGINT'i dinler. Windows'ta SIGTERM gönderilemez, yalnız Ctrl+C (SIGINT) ile düzgün kapanır.

## 9. Uygulama ve inceleme ekleri (TASK-MUMT3PGX5OK8P, 29.09.2026)

İnceleme İNCELEME-22 (`docs/agent-results/TASK-MUMO33QXYL420-crw-fb.md`, Kart 3) üç açık bıraktı. Üçü de taşımadan **önce** kapatıldı. §7'deki A/B1/B2/B3/C kart bölmesi yerine taşıma tek kartta, üç commit'te yapıldı; B kartlarının amacı (iki sistemin aynı işi hiçbir an birlikte koşturmaması) §9.2 ile sağlanıyor.

### 9.1 Ö-1: `credits-monthly-grant` idempotent (commit `2c20324f`)

- `CreditLedger.grantPeriod` (`YYYY-MM`, işin yazdığı satırda dolu, diğer her satırda NULL) ve `@@unique([tenantId, grantPeriod])`. Migration: `prisma/migrations/credit-ledger-grant-period.sql` (idempotent, `apply-order.txt` sonunda).
- Kısmi index kullanılmadı: repo şemayı `db push` ile eşitliyor ve Prisma kısmi index ifade edemiyor (`add-soft-delete.sql`). Postgres NULL'ları ayrı saydığı için `refId`'yi tekrar kullanan satırlar (LLM kullanımı `proposalId`, Stripe/iyzico yeniden etkinleştirme `subscription.id`) kısıta takılmaz.
- İş `createMany … skipDuplicates` ile yazar; aynı ay ikinci koşu `alreadyGrantedCount` sayar, satır eklemez. Ay, cron tikinin ayıdır (`payload._cron.ts`); geç koşan bir tekrar deneme bir sonraki aya kaymaz.
- Kanıt: RLS rolüyle (`fabrika_app`) test, aynı ay iki kez ve paralel iki kez → kiracı başına 1 satır; mutant (yazımdan `grantPeriod` düşürülünce) testi düşürüyor.

### 9.2 Ö-2: dağıtım sırası ve kilit

Sorun: worker ile Next.js ayrı süreçler, ayrı zamanlarda dağıtılır; eski barındırılan zamanlayıcı da işin tanımını uygulama yeniden senkronlanana kadar tutar. Worker yeni crontab'la önce kalkar ve eski web sürümü hâlâ canlıysa aynı tik iki sistemde koşar.

**Kural (uygulandı):** `JOBS_CRON_ENABLED` üretimde **açıkça** `true` ya da `false` olmak zorunda. Değişken yoksa üretim worker'ı başlamaz (`JobsCronUnsetInProductionError`, `src/lib/env.ts` `jobsCronEnabled`). `false` iken worker yalnız elle eklenen işleri koşar, hiçbir cron tikini zamanlamaz ve `job-queue:cron-disabled` uyarı alarmı yazar. Üretim dışında değişken yoksa açık sayılır.

**Dağıtım sırası:**

1. Web uygulamasını bu sürümle dağıt (Inngest route'u kalkar; `/api/inngest` 404 döner).
2. Inngest panosunda uygulamayı yeniden senkronla ya da arşivle; "Functions" listesinin boş olduğunu ve son 10 dakikada koşu olmadığını gör. Bu adımdan önce eski zamanlayıcı hâlâ tetikleyebilir.
3. Worker'ı `JOBS_CRON_ENABLED=false` ile kaldır (şemayı kurar, elle eklenen işleri koşar).
4. 2. adım doğrulanınca worker'ı `JOBS_CRON_ENABLED=true` ile yeniden başlat.
5. İlk günlük tikten sonra (en geç 02:00 UTC) `SystemAlert`'te `job-queue` kaynağına ve worker loguna bak.

Geri dönüşte sıra tersine: önce worker'ı durdur (ya da `false` ile başlat), sonra Inngest'li sürümü geri al ve Inngest'te senkronla. Aylık kredi işi Ö-1 sayesinde yanlış sırada bile ikinci kez kredi vermez; diğer işler (e-posta gönderenler dahil) bu korumaya sahip değildir, bu yüzden sıra kuraldır.

### 9.3 Ö-3: kaçırılmış tik alarmı

`job-queue-health` (her saat :05 UTC, `src/lib/jobs/tasks/job-queue-health.ts`) üç şeyi `SystemAlert`'e yazar:

- **Kaçırılmış tik:** her iş için `now − 10 dk` anındaki son beklenen tik, `_private_known_crontabs.last_execution`'dan yeniyse ve crontab o tikten önce tescil edilmişse (`known_since`), `error` alarmı yazar (`job-queue:<iş>:missed-tick`). graphile-worker `last_execution`'ı tik zamanlanınca (canlı ya da `fill` içinde geriye dönük) yazar; `fill` penceresini aşan kesintide yazmaz. Bu yüzden sessiz kayıp artık görünür. Elle telafi: `pnpm jobs:enqueue -- <iş>`.
- **Tükenmiş iş:** son denemesini kullanmış, tabloda `last_error` ile kalan iş (`job-queue:<iş>:exhausted`; iş sarmalayıcısı son denemede aynı anahtarla zaten yazar, bu ikinci yazıcıdır).
- **Takılmış iş:** 4 saatten uzun kilitli iş (`job-queue:<iş>:stuck`, `warn`).

Sağlık işi her saat koştuğu için aylık bir işin kaçan tiki bir sonraki tike kadar her gün görünür kalır; günlük işlerde worker döndükten sonraki ilk saatte görünür.

### 9.4 Uygulanan tasarım (özet)

- Tek tablo: `src/lib/jobs/schedule.ts` (crontab, görev listesi ve kaçırılmış tik kontrolü buradan türer). Cron ifadeleri Inngest'tekiyle aynı; `max=5` (Inngest varsayılanı: 1 + 4 tekrar); `fill` günlükte `6h`, haftalık/aylıkta `1d`; `agency-monthly-report` `queue=agency`.
- Sarmalayıcı: `src/lib/jobs/define.ts` (`defineJob`). `{ success: false }` loglanır, tekrar denenmez (§6.3); fırlatılan hata tekrar denenir; son denemede `job-queue` alarmı.
- Elle tetikleme: `pnpm jobs:enqueue -- <iş> [--period|--month|--payload|--force]` (`jobKey` + `unsafe_dedupe`, §6.5). Inngest'in `agency/report.generate` olayı ve pano "Invoke"u bunun yerine geçti; ajans dönemi kuyruğa girmeden doğrulanır.
- Worker: `pnpm jobs:worker` (`scripts/jobs-worker.ts`, ilk satır `import 'dotenv/config'`). DB rolü (§6.6): worker kendi şeması için `JOBS_DATABASE_URL`'i (yoksa `DATABASE_URL`) kullanır; şemayı ilk açılışta kurabilecek bir rol gerekir. İş gövdeleri her zaman `DATABASE_URL` + `withSystemScope`/`withTenant` ile çalışır.
- Dağıtım: `Dockerfile` tabanı `node:22-alpine` (graphile-worker ≥ 22.18), `worker` hedefi (`docker build --target worker`); `docker-compose.yml` `fabrika-worker` servisi (`app` profili).
- Kalktı: `inngest` paketi, `src/lib/inngest/client.ts`, `/api/inngest`, `INNGEST_*` ortam değişkenleri ve `assertInngestDevModeAllowed`. Inngest hesabı ve anahtarları §7'deki kurala göre canlıda bir tam ay geçene kadar silinmez.

