# Zamanlanmış işler — Fabrika iş orkestrasyonu (dosya adı eski: INNGEST)

> **Bu dosyanın adı tarihsel.** Inngest 29.09.2026'da kaldırıldı (ADR-0008, `5ed2261a`). Zamanlanmış işleri bugün
> **graphile-worker** koşturur: Postgres üstünde, ayrı bir uzun yaşayan Node süreci (`pnpm jobs:worker`).
> Kararın gerekçesi, deneme sonuçları ve dağıtım sırası: [`docs/adr/ADR-0008-own-job-queue-graphile-worker.md`](adr/ADR-0008-own-job-queue-graphile-worker.md).
> Kurulum ve işletim adımları: [`INNGEST_SETUP.md`](INNGEST_SETUP.md).
> Kaynak doğruluk: işlerin listesi ve takvimi `src/lib/jobs/schedule.ts` içindeki `SCHEDULE` tablosudur; bu belge onu kopyalamaz.

## Nasıl çalışır

- **Takvim:** `src/lib/jobs/schedule.ts` — cron ifadeleri UTC. Worker crontab'ını, görev listesini ve `job-queue-health`
  kaçırılmış-tik kontrolünü bu tek tablodan türetir.
- **Görevler:** `src/lib/jobs/tasks/<iş-adı>.ts`; kayıt `src/lib/jobs/tasks/index.ts`. Her görev `defineJob` ile sarılır
  (`src/lib/jobs/define.ts`).
- **Süreç:** `pnpm jobs:worker` (`scripts/jobs-worker.ts` → `startJobsWorker`, `src/lib/jobs/worker.ts`). Next.js sürecinden
  bağımsızdır; HTTP ucu yoktur (`src/app/api/inngest` yok). Aynı veritabanına birden çok worker bağlanabilir: her cron tiki
  toplamda bir kez alınır (`graphile_worker._private_known_crontabs`), işler `SKIP LOCKED` ile alınır, `queue` tanımlı iş
  tüm worker'larda sırayla koşar.
- **Tekrar deneme:** iş hata fırlatırsa kuyruk üstel bekleyle yeniden dener. Cron işlerinde `maxAttempts` çoğunlukla 5,
  sık koşan bazılarında 3 (`schedule.ts`). Son denemede `defineJob` `source: job-queue` bir `SystemAlert` yazar.
- **`{ success: false }` dönen iş hata sayılmaz:** `define.ts` bunu `DONE (reported failure)` diye loglar, yeniden
  denemez. Bu işler kendi `SystemAlert`'lerini yazar (örn. `k2-monthly-cordis`, `alerts-sweep`).
- **Kaçırılan tik:** `fill` penceresi içinde (iş başına `6h` ya da `1d`) geriye dönük koşturulur. `fill`'i olmayan işler (`job-queue-health`, `alerts-ops-digest`, `m17-stale-runs`, `public-lead-stuck`, `notification-email-instant`, `evidence-scan-sweep`; `schedule.ts`) kaçan tiki geriye dönük koşmaz; tik zamanı
  `payload._cron.ts` ile işe gelir, aylık işler "şimdi"nin değil tikin ayını işler (`monthOf`). Pencereyi aşan kesintiyi
  `job-queue-health` (her saat :05 UTC) `job-queue:<iş>:missed-tick` alarmıyla bildirir. Sınırı ADR-0008 §9.3'te.
- **Elle tetikleme:** `pnpm jobs:enqueue -- <iş-adı> [--period YYYY-MM] [--month YYYY-MM] [--payload JSON] [--force]`
  (`scripts/jobs-enqueue.ts`); çalışan bir `pnpm jobs:worker` işi alır. Eski Inngest panosundaki "Run" düğmesinin ve
  `agency/report.generate` olayının yerini bu alır.
- **Cron anahtarı:** `JOBS_CRON_ENABLED` üretimde açıkça `true`/`false` olmalı, yoksa worker başlamaz (`src/lib/env.ts`).

## İşler

Tam liste ve cron'lar: `SCHEDULE` (`src/lib/jobs/schedule.ts`). Aşağıdakiler bu belgenin eskiden ayrıntılı anlattığı
işlerdir; takvimleri `schedule.ts`'ten alınmıştır. Her işin ayrıntısı kendi dosyasındadır.

| İş | Cron (UTC) | Görev dosyası | Not |
|---|---|---|---|
| `k1-daily-calls` | `0 2 * * *` | `tasks/k1-daily-calls.ts` | K1 çağrı toplama (Sedia, Eurostars, Tübitak adaptörleri); elle: `pnpm jobs:k1` |
| `k2-monthly-cordis` | `0 4 1 * *` | `tasks/k2-monthly-cordis.ts` | Python worker'ı çağırır — aşağıdaki K2 notuna bak; elle: `pnpm jobs:k2 -- --month YYYY-MM` |
| `evidence-scan-sweep` | `*/15 * * * *` | `tasks/evidence-scan.ts` | NG-239: taranmamış/`ERROR` kanıt dosyalarına tarama kuyruğa koyar; `evidence-scan` (cron'suz, yüklemede kuyruğa girer) aynı dosyada |
| `alerts-daily` | `0 8 * * *` | `tasks/alerts-daily.ts` | Kayıtlı arama e-postaları (SMTP, `src/lib/email/mailer.ts`); gönderim sabit 08:00 UTC, kiracı/kullanıcı saat dilimine göre değil (`alerts-daily.ts`'te saat dilimi işleme yok) |
| `credits-monthly-grant` | `0 6 1 * *` | `tasks/credits-monthly-grant.ts` | Aylık kredi (`CreditLedger`, `reason: 'monthly_grant'`); `(tenantId, grantPeriod)` benzersiz, aynı ay ikinci koşu satır eklemez (ADR-0008 §9.1) |
| `m4-weekly-summary` | `0 9 * * 1` | `tasks/m4-weekly-summary.ts` | `nextStepDue`'u önümüzdeki 7 gün içinde olan ilişkiler (`m4-weekly-summary.ts:87-94`) |
| `feedback-weekly-digest` | `0 6 * * 1` | `tasks/feedback-weekly-digest.ts` | Aşağıda |
| `alerts-sweep` | `15 4 * * *` | `tasks/alerts-sweep.ts` | Aşağıda; elle: `pnpm jobs:alerts-sweep` |
| `agency-monthly-report` | `0 6 1 * *` | `tasks/agency-monthly-report.ts` | `queue: agency`; elle: `pnpm jobs:enqueue -- agency-monthly-report --period YYYY-MM` |
| `agency-report-retention` | `0 5 1 1,7 *` | `tasks/agency-report-retention.ts` | NG-341: 12 aydan eski ajans raporlarını 6 ayda bir siler, `AgencyReportDeletionLog` yazar; NG-345: aynı koşuda 3 yıldan eski imha kayıtlarını budar; NG-349: ardından kalıcı silinmiş ajansların 3 yıldan eski kayıtlarını tek çağrıyla budar; hata tek `SystemAlert` (`dedupeKey` = koşu id); `queue: agency`, `fill: 1d`; elle: `pnpm jobs:agency-report-retention` |
| `job-queue-health` | `5 * * * *` | `tasks/job-queue-health.ts` | Kaçırılmış, tükenmiş, takılmış iş alarmı (ADR-0008 §9.3) |

### K2 notu (`k2-monthly-cordis`)

Aylık iş yalnız Python worker'ın `POST {WORKER_URL}/jobs/cordis?month=YYYY-MM` ucunu çağırır (`WORKER_URL`,
`WORKER_TOKEN`). Gerçek CORDIS ZIP'ini indirip yazan kod ise `runCordisImport` (`src/lib/k2-cordis/importer.ts`); o ayrı
bir yoldur (`scripts/cordis-import.ts`, yönetici eylemi, `POST /api/admin/cordis/import` — `src/app/api/admin/cordis/import/route.ts`) ve bu aylık işe bağlı **değildir**. `CORDIS_WORKER_ALLOW_MOCK`
açık değilken worker'da gerçek kaynak olmadığı için koşu hata verir (`workers/cordis/main.py`). Yani aylık işin
zamanlanmış olması, CORDIS verisinin her ay yenilendiği anlamına gelmez; aylık işi `runCordisImport`'a bağlama işi
NG-225'tir ve bu belge yazılırken yapılmamıştır.

### `feedback-weekly-digest` — E11.2 beta geri bildirim özeti

| | |
|---|---|
| **Tetik** | Cron `0 6 * * 1` (pazartesi 06:00 UTC) |
| **Okur** | `Feedback` (son 7 gün + hâlâ açık olan hepsi), `Tenant` (adlar) |
| **Gönderir** | `FEEDBACK_DIGEST_TO` adresine tek HTML özet, kendi SMTP'miz (`SMTP_*`) üzerinden |
| **Çıktı** | `{ newCount, openCount, overdueCount, byPriority, emailStatus }` |

Rapor bilerek iki pencereyi kapsar: son yedi günde açılanlar **ve** yaşına bakmadan yanıt süresini aşmış açık olanlar.
Gönderim en iyi çabadır: alıcı yoksa iş yine koşar ve `emailStatus: "skipped"` döner; alıcı var, `SMTP_HOST` yoksa
üretimde `emailStatus: "failed"` + `source: mail` bir `SystemAlert`, başka yerde `"skipped"`. Mantık
`src/lib/feedback/digest-run.ts`'te durur, elle koşulabilir:

```bash
pnpm tsx scripts/run-feedback-digest.ts                     # üret + yazdır, gönderme
pnpm tsx scripts/run-feedback-digest.ts --out digest.html   # dosyaya yaz
pnpm tsx scripts/run-feedback-digest.ts --send --to ops@example.org
```

### `alerts-sweep` — sahipsiz uyarı süpürücüsü ve kendi sağlığı

| | |
|---|---|
| **Tetik** | Cron `15 4 * * *` |
| **Okur** | `SystemAlert` (1 saatten eski açık satırlar), `Tenant` |
| **Yazar** | Silinmiş kiracıyı adlandıran uyarılarda `resolvedAt` |
| **Çıktı** | `{ success, scanned, closed }` |

`meta.tenantId`'si silinmiş bir kiracıyı gösteren açık uyarıları kapatır (`SystemAlert`'in `Tenant`'a FK'si yok, `pnpm alerts:check` bunları geçersiz sayar); satır silmez, kiracısı duran uyarıya dokunmaz.
1 saatlik yaş tabanı bilerek konmuştur: `pnpm alerts:check` `pnpm gate`'in sonunda koşar, aynı koşunun bıraktığı sızıntıyı süpürücü kapatıp kapıya yeşil vermesin (`alerts-sweep.ts`, `MIN_AGE_MS`). **Kendi hatası görünür.** İş fırlatmaz, `{ success: false }` döner; kuyruk bunu başarısız saymaz ve yeniden denemez
(`define.ts`). Bu yüzden sağlığını kendi bakımını yaptığı tabloda tutar; operatör `/admin/alerts` altında
`alerts-sweep` kaynağında görür:

| Satır | Seviye | Ne zaman |
|---|---|---|
| `Orphan-alert sweep did not complete` | `info` | Her başarısız koşu. Tekrarlar bu tek satırda birleşir; `×N` ardışık hata sayısıdır. |
| `Orphan-alert sweep has failed N or more consecutive runs` | `error` | Sayı `ALERTS_SWEEP_FAILURE_THRESHOLD`'a (varsayılan 3) ulaşınca. |

Başarılı koşu ikisini de çözer. `meta` hatanın aşamasını (`scan` / `tenant-lookup` / `close`) ve hata *sınıfını* taşır,
sürücü mesajını taşımaz (bağlantı dizesi sızabilir; `SystemAlert`'te RLS yok). Tam mesaj worker logunda kalır.

## Test

`src/lib/jobs/tasks/__tests__/` altında iş başına birim testler var (örn. `cron-tenant-scope.test.ts`,
`alerts-daily.test.ts`). `pnpm test` hepsini koşar; tek dosya için `pnpm test -- src/lib/jobs`.

## Çok kiracılılık

İşler Fabrika sunucu bağlamında koşar, tek bir kiracı bağlamında değil. Kiracıları açıkça listeleyin ve her sorguda
`tenantId` kullanın; kiracılar arası okuma gereken yerde `withSystemScope` kullanılır (ADR-0008 §2, `alerts-daily`).
Ayrıntı için ilgili görev dosyasına ve `src/lib/jobs/tasks/__tests__/cron-tenant-scope.test.ts`'e bakın.

## İzleme ve hata ayıklama

- **Log:** `pnpm jobs:worker` sürecinin çıktısı (`[<iş>] START/DONE/FAIL job=… attempt=…/… tick=…`).
- **Uyarılar:** `SystemAlert` `source: job-queue` (tükenmiş, kaçırılmış tik, takılmış iş, `cron-disabled`).
- **Kuyruk tablosu:** `graphile_worker._private_jobs` (başarısız iş `last_error` ile kalır),
  `graphile_worker._private_known_crontabs` (`last_execution`).

| Belirti | Olası neden | Çözüm |
|---|---|---|
| Hiçbir cron koşmuyor | Cron'lu worker yok ya da hepsi `JOBS_CRON_ENABLED=false` | Worker'ı `JOBS_CRON_ENABLED=true` ile başlat. Bu durumda `job-queue-health` de koşmadığı için alarm yazılmaz (ADR-0008 §9.3 "Sınır") |
| Üretim worker'ı başlamıyor | `JOBS_CRON_ENABLED` tanımsız | `true` ya da `false` yaz (`JobsCronUnsetInProductionError`) |
| K2 çağrısı hata veriyor | Python worker'a ulaşılamıyor ya da gerçek kaynak yok | `WORKER_URL`/`WORKER_TOKEN`'ı kontrol et; K2 notuna bak |
| Mail gitmiyor (alerts, digest) | `SMTP_HOST` boş ya da sunucu reddediyor | `.env`'de `SMTP_*` doldur (yerelde Mailpit `localhost:1025`); üretimde boşsa `source: mail` uyarısı yazılır |
| `alerts-sweep` konsolda hata uyarısı | Süpürücü `ALERTS_SWEEP_FAILURE_THRESHOLD` kez art arda başarısız | `info` satırındaki `meta.stage`'e, sonra worker logundaki tam mesaja bak |
| İş "Run" ile tetiklenmek isteniyor | Pano yok | `pnpm jobs:enqueue -- <iş-adı>` |

## Referanslar

- ADR-0008 (karar, deneme, dağıtım sırası, kaçırılmış-tik alarmı): `docs/adr/ADR-0008-own-job-queue-graphile-worker.md`
- Takvim: `src/lib/jobs/schedule.ts` · sarmalayıcı: `src/lib/jobs/define.ts` · worker: `src/lib/jobs/worker.ts`
- Mimari: `docs/ARCHITECTURE.md` · Faturalama ve kredi: `docs/BILLING.md`
