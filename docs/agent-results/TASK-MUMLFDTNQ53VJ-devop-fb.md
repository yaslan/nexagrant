# TASK-MUMLFDTNQ53VJ — Inngest → kendi iş kuyruğumuz: ADR + spike (DEVOP-FB)

**Sonuç:** Öneri **graphile-worker 0.18** (Postgres dışında altyapı gerekmiyor). ADR: `docs/adr/ADR-0008-own-job-queue-graphile-worker.md` (durum: ÖNERİ, patron onayı bekliyor). Deneme gerçek `k2-monthly-cordis` işiyle, iki instance üzerinde uçtan uca koşturuldu. Tik başına tek koşu log + DB satırıyla kanıtlandı. Spike kodu yerel `spike/job-queue` dalında (`d8a3a353`), dev'e girmedi. Üretim kodu değişmedi.

## 1. Ne yapıldı

1. **Envanter** (ADR §2): Inngest'e kayıtlı 10 iş için tetikleyici, adımlar, tekrar deneme, eşzamanlılık ve not çıkarıldı. Hiçbir işte `retries` ayarı yok (adım başına varsayılan 5 deneme). `concurrency` yalnız `agency-monthly-report`'ta var. Inngest tarafında advisory lock yok. `agency/report.generate` olayını koddan gönderen yok. Süreler **tahmin**: Inngest çalışma geçmişi bizde değil, `SystemAlert`'te de süre satırı yok.
2. **1-3-1 karşılaştırma** (ADR §3): pg-boss 12.35 / graphile-worker 0.18 / node-cron + kendi tablomuz, 6 ölçüte göre. İlk taslakta "pg-boss'ta kaçan tik telafi edilmez" diye yazmıştım. pg-boss paketinin kaynağını okuyunca bunun yanlış olduğunu gördüm (`schedule(..., {missed:'once'})` var) ve metni yayından önce düzelttim. Gerekçeler ölçülenlere dayanıyor: tik başına tek koşu ve backfill bu repoda kanıtlandı; iş `payload._cron.ts` ile hangi tik için koştuğunu biliyor; `queue_name` = `concurrency: 1`.
3. **Spike** (ADR §5): üç koşu yapıldı (D1-D5 aşağıda).
4. **ADR-0008 + geçiş planı**: iş sırası (A altyapı → B1/B2/B3 işler → C Inngest sökümü), her iş için geri dönüş (`git revert`), tahmini 3-3,5 iş günü, kart A taslağı. Ayrıca barındırma kısıtı yazıldı: uzun yaşayan bir worker süreci gerekiyor ve Vercel'de koşamaz.
5. **Yan bulgu → kart TASK-MUMMQDJPXQH63** (todo, FB-GAP-1): `pnpm jobs:k2`, `.env`'deki DB'ye `SystemAlert` / `RawFetch` yazamıyor.

## 2. Kanıt

Ortam: mac, Node 26.5.0, Postgres 16.15 (`fabrika-postgres` docker). İzole DB `fabrika_devopfb_jobq` kullanıldı (yalnız şema kopyalandı). Loglar ve DB dökümleri `spike/job-queue` dalında, `scripts/spike-jobq/evidence/` altında.

**D1 — iki instance (A, B), cron her dakika, mock'un ilk cevabı 503:**
```
[A] 12:06:00.014Z START job=1 attempt=1/3 tick=2026-09-29T12:06:00.000Z month=2026-09
[A] 12:06:03.174Z FAIL  job=1 attempt=1: Worker responded with status 503
[A] 12:06:05.910Z START job=1 attempt=2/3 tick=2026-09-29T12:06:00.000Z
[A] 12:06:08.931Z DONE  job=1 attempt=2
[A] 12:07:00.010Z START job=2 attempt=1/3 tick=2026-09-29T12:07:00.000Z
[A] 12:07:03.038Z DONE  job=2 attempt=1
[mock] hit=1 -> 503 · hit=2 -> 200 · hit=3 -> 200        (B.log: yalnız "up", iş yok)
RawFetch 2026-09: 12:06:03.156 503 | 12:06:08.925 200 | 12:07:03.029 200
```
**D2 — iki worker 12:07:39-12:09:14 arasında kapalı; açılınca kaçan tik'ler birer kez koştu (`fill=2m`):**
```
[B] 12:09:15.330Z START job=3 tick=2026-09-29T12:08:00.000Z
[A] 12:09:20.859Z START job=4 tick=2026-09-29T12:09:00.000Z
[A] 12:10:00.010Z START job=9 tick=2026-09-29T12:10:00.000Z   (canlı tik, tek iş)
```
**D3 — `queue=k2`, iki instance, her birinde 2 boş yer; işler çakışmadı:** `job3 15.33→20.47 · job4 20.86→26.04 · job5 26.04→31.07 · job7 31.42→36.44`
**D4 — jobKey:** kuyruk meşgulken `first=5 second=5 same=true`. İlk iş başlamışken `first=10 second=11 same=false`, yani **çalışan işin üstüne ikinci bir iş açılıyor**. Kütüphane `add_job` SQL'inden doğrulandı; kural ADR §6.5'e yazıldı (`unsafe_dedupe` + idempotent gövde).
**D5 — son deneme alarmı:**
```
job=11 attempt 1 12:11:05.5 · 2 12:11:08.5 · 3 12:11:16.7
SystemAlert: error | job-queue | k2-monthly-cordis gave up after 3 attempts: Worker responded with status 503
```
**Yan bulgu yeniden üretimi:** `env -u DATABASE_URL pnpm jobs:k2 -- --month 2026-09 --worker-url http://127.0.0.1:1` → `[recordAlert] could not write SystemAlert: ... Authentication failed ... credentials for 'fabrika'`, exit 0. `import 'dotenv/config'` ile aynı zincir `current_database() = fabrika_devopfb_jobq` döndü.

## 3. Değişen dosyalar

- dev: `docs/adr/ADR-0008-own-job-queue-graphile-worker.md` (yeni), `docs/agent-results/TASK-MUMLFDTNQ53VJ-devop-fb.md` (bu dosya).
- `spike/job-queue` (yalnız yerel, push yok, `d8a3a353`): `package.json` + `pnpm-lock.yaml` (graphile-worker 0.18.0), `scripts/spike-jobq/{worker,enqueue,mock-cordis-worker}.ts`, `run1.sh`, `run2.sh`, `evidence/`.
- Üretim kodu: değişiklik yok.

## 4. Riskler

- **Barındırma:** Worker sürekli açık bir süreç ister. Vercel'de kalınırsa bu plan canlıya çıkamaz (ADR §4). Karar patronda.
- **`step.run` belleği yok:** tekrar denenen iş baştan koşar. `credits-monthly-grant`'in baştan koşunca çift kredi vermediği taşıma kartında testle kanıtlanmalı. Kodu okumadım; idempotent olduğunu varsaymıyorum.
- **Takılan iş 4 saat kilitli kalır** (kütüphane belgesine dayanıyor, `kill -9` ile denenmedi). Günlük ve aylık işler için kabul edilebilir.
- **jobKey sınırı (D4):** elle tetiklenen yol yanlış kiple yazılırsa iş iki kez koşar.
- Envanterdeki süreler ölçülmedi.

## 5. Açık sorular (patron)

1. graphile-worker onayı mı, yoksa pg-boss mu? (ADR §3; plan iki kütüphanede de aynı.)
2. Barındırma: kendi sunucu/konteyner mi, Vercel mi? (ADR §4)
3. `stripe-event-cleanup` taşınsın mı, yoksa Stripe pilotta olmadığı için silinsin mi?

## 6. Sonraki adım

ADR onayından sonra kart A (ADR §7'deki taslak) panoya açılır, ardından B1 → B2 → B3 → C. Inngest hesabı ve anahtarları, C'den sonra canlıda bir aylık tik dahil bir tam ay sorunsuz geçene kadar silinmez. `spike/job-queue` dalı push edilmedi; incelemeci isterse push, patron onayıyla yapılır.

**Platform beyanı:** Deneme **mac**'te (Darwin 27.0, Node 26.5.0) koşuldu. **Linux koşulamadı** (elde Linux sunucu yok, barındırma kararı bekleniyor). Koddan bakıldığında worker saf Node + `pg` kullanıyor ve dosya yolu, kabuk ya da ikili dosyaya bağlı değil, bu yüzden Linux'ta aynı davranmalı. **Windows** hedef değil ve koşulmadı: kodda platforma bağlı tek nokta düzgün kapanma. graphile-worker SIGTERM/SIGINT dinliyor; Windows'ta yalnız Ctrl+C (SIGINT) ile düzgün kapanır.
