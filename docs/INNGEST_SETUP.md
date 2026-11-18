# Zamanlanmış işler kurulumu — graphile-worker (dosya adı eski: INNGEST_SETUP)

> **Bu dosyanın adı tarihsel.** Inngest kaldırıldı (29.09.2026, ADR-0008). Hesap, `INNGEST_*` anahtarı, `/api/inngest` ucu ve
> Inngest panosu **yoktur**. Zamanlanmış işleri `pnpm jobs:worker` süreci koşturur. Genel anlatım: [`INNGEST.md`](INNGEST.md).

## Hızlı kurulum (yerel)

1. Veritabanı hazır olsun (`pnpm db:setup`). Worker kendi `graphile_worker` şemasını ilk açılışta kendisi kurar; Prisma bu
   şemaya dokunmaz (ADR-0008 §3).
2. `.env.example` değişkenleri (`src/lib/env.ts`):
   - `JOBS_CRON_ENABLED` — boşsa üretim dışında açık sayılır; **üretimde `true` ya da `false` yazılmak zorunda**, yoksa worker başlamaz.
   - `JOBS_DATABASE_URL` — isteğe bağlı; yoksa `DATABASE_URL` kullanılır (`jobsConnectionString`).
   - `JOBS_CONCURRENCY` — bir worker'ın aynı anda koşturduğu iş sayısı; boşsa 2.
   - `WORKER_URL`, `WORKER_TOKEN` — yalnız K2 için Python worker.
3. Uygulama ile birlikte ayrı bir terminalde worker'ı başlat:
   ```bash
   pnpm dev            # Next.js :3000
   pnpm jobs:worker    # zamanlanmış işler (ayrı süreç)
   ```
   Çıktı `[jobs] worker up (pid …)` ve iş listesini yazar. `Ctrl-C` uçuştaki işler bitince durdurur.

Worker'ı Next.js ile aynı yerde çalıştırmak gerekmez; yalnız aynı veritabanını görmesi yeter. İstediğiniz kadar worker
açabilirsiniz, her cron tiki toplamda bir kez koşar (ADR-0008 §5).

## İşler

Liste ve cron'lar `src/lib/jobs/schedule.ts` içindeki `SCHEDULE` tablosundadır (UTC). İş gövdeleri
`src/lib/jobs/tasks/`. Özet tablo ve ayrıntılar: [`INNGEST.md`](INNGEST.md).

## Bir işi elle çalıştırmak

```bash
pnpm jobs:enqueue -- k1-daily-calls
pnpm jobs:enqueue -- agency-monthly-report --period 2026-10
pnpm jobs:enqueue -- <iş-adı> --force     # önceki elle eklenen iş kalıcı başarısız olduysa yeniden kuyruğa al
```
İşi çalışan bir `pnpm jobs:worker` alır; worker yoksa iş kuyrukta bekler. İş gövdesini kuyruksuz koşturan betikler:
`pnpm jobs:k1`, `pnpm jobs:k2 -- --month YYYY-MM`, `pnpm jobs:alerts-sweep`, `scripts/run-feedback-digest.ts`.

## İzleme ve uyarılar

- Worker logu (`[<iş>] START/DONE/FAIL …`).
- `SystemAlert` `source: job-queue`: tükenmiş iş, kaçırılmış tik, takılmış iş, `JOBS_CRON_ENABLED=false` ile kalkan üretim
  worker'ı. Bunları `job-queue-health` (her saat :05 UTC) yazar; sınırı: hiçbir cron'lu worker koşmuyorsa o da koşmaz
  (ADR-0008 §9.3).
- Dışarıdan kalp atışı kontrolü (`job-queue-health` satırının `last_execution` değeri 70 dakikadan eskiyse alarm) ADR-0008
  §9.3'te önerildi ve o yazıldığı sırada **yoktu**.

## Yeni iş eklemek

1. `src/lib/jobs/tasks/<ad>.ts` içinde `defineJob('<ad>', async ({ payload, tick }) => …)` ile görevi yaz; iş mantığını
   saf bir `runX()` fonksiyonuna ayır, böylece betik ve test aynı yolu çağırır.
2. `src/lib/jobs/schedule.ts`: `JOB_IDS`'e adı ekle; cron'lu ise `SCHEDULE`'a satır ekle (`cron`, `maxAttempts`, gerekirse
   `fill` ve `queue`). Cron'suz (yalnız elle/olay) iş `SCHEDULE`'a girmez.
3. `src/lib/jobs/tasks/index.ts`'e görevi kaydet.
4. Payload/çıktı şemaları `src/lib/jobs/events.ts`'te (Zod).
5. `src/lib/jobs/tasks/__tests__/` altına test ekle.

## Üretim kontrol listesi

- [ ] `pnpm jobs:worker` sürekli açık bir süreç olarak çalışıyor (`restart=always`); barındırma kararı ADR-0008 §4'te
      "açık" olarak işaretliydi.
- [ ] `JOBS_CRON_ENABLED` açıkça `true` (ya da bilinçli `false`).
- [ ] Dağıtım sırası ADR-0008 §9.2'ye uygun (worker, eski zamanlayıcı kapandıktan sonra `true` ile).
- [ ] K2 için `WORKER_URL` / `WORKER_TOKEN`; ve gerçek kaynak yoksa K2'nin hata vereceğinin bilinmesi (`INNGEST.md` K2 notu).
- [ ] `SMTP_*` doldurulmuş (alerts, digest e-postaları).
- [ ] İlk günlük tikten sonra `SystemAlert` `job-queue` kaynağına ve worker loguna bakıldı.

## Sorun giderme

- **Hiçbir iş koşmuyor:** worker çalışıyor mu, `JOBS_CRON_ENABLED` ne, `DATABASE_URL`/`JOBS_DATABASE_URL` doğru veritabanını
  gösteriyor mu.
- **Worker üretimde açılmıyor:** `JOBS_CRON_ENABLED` tanımsız (`JobsCronUnsetInProductionError`).
- **Kaçan tik:** `job-queue:<iş>:missed-tick` alarmı; elle telafi `pnpm jobs:enqueue -- <iş>`.

---

**Referanslar:** `docs/adr/ADR-0008-own-job-queue-graphile-worker.md` · `src/lib/jobs/schedule.ts` · `src/lib/jobs/worker.ts`
