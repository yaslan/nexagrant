# spike-jobq — graphile-worker spike (TASK-MUMLFDTNQ53VJ)

**30.09 patron kararıyla referans olarak merge edildi, üretim kodu değil**
(TASK-MUOEY2GBFHY7U). Branch `spike/job-queue`, commit `d8a3a353`.

Bu dizin, `graphile-worker` 0.18.0'ın gerçek `runK2MonthlyCordis` işini iki
örnekle koşturduğu spike'ın kodunu ve kanıtını tutar: cron tick başına tek koşu,
backfill, kuyruk serileştirmesi, `jobKey`, denemesi biten işte `SystemAlert`.

- `worker.ts`, `enqueue.ts`, `mock-cordis-worker.ts` — spike betikleri; hiçbir
  üretim yolu bunları import etmez, CI koşturmaz.
- `run1.sh`, `run2.sh` — spike'ı yazan ajanın makinesine özgü yollar içerir;
  olduğu gibi koşmaz, kayıt içindir.
- `evidence/` — spike koşularının ham çıktıları.

Üretimdeki iş kuyruğu `src/lib/jobs/` altındadır; bu dizinden kod taşınacaksa
normal bir kartla, testleriyle taşınır.
