# TASK-MUMT3PGX5OK8P · devop-fb · İNCELEME-38 düzeltmesi (B-1, B-2, Ö-1..Ö-5)

**Commit:** `435f8f7d` (kod + test + belge). **Kaynak:** `docs/agent-results/TASK-MUN4N43VERLXK-crw-fb.md` (İNCELEME-38, DÜZELTME GEREKLİ).
**Ortam:** paylaşılan ağaç `dev`, doğrulama temiz ayrık worktree'de (`ee8b4c8b` + yalnız benim yamam). DB: `fabrika-postgres` içinde kendi kopyalarım `devopfb_b1` (canlı senaryo) ve `devopfb_suite` (tam süit). Paylaşılan `fabrika` DB'sine yazılmadı; `Tenant` sayısı önce 1, sonra 1.

## 1. Ne yapıldı

### B-1 (çift aylık kredi) — iki katmanlı düzeltme
1. **Migration doldurması** (`prisma/migrations/credit-ledger-grant-period.sql`): eski Inngest işinin yazdığı satırlara ayını yazar, böylece `UNIQUE(tenantId, grantPeriod)` onları da görür. crw'nin taslağından **bir farkla**: crw'nin SQL'i `reason='monthly_grant' AND grantPeriod IS NULL` ile seçiyordu. Bu seçim **iyzico / Stripe etkinleştirme kredilerini** de yakalar (`src/lib/iyzico.ts:755`, `src/lib/billing/subscription-sync.ts:591,607` aynı `reason`'ı kullanıyor). Böyle bir satırı ayla işaretlemek, o ayın zamanlanmış kredisini **hiç verilmemiş** hâle getirirdi. Eski iş satırı `refId` taşımıyordu (`git show 2c20324f~1:src/lib/inngest/jobs/credits-monthly-grant.ts:42`), ödeme kredileri her zaman taşıyor. Bu yüzden ayırt edici koşul `AND "refId" IS NULL`. Kiracı×ay başına yalnız ilk satır işaretlenir; o ay için zaten işaretli satır varsa dokunulmaz. Dosya iki kez koşunca ikincisi `UPDATE 0`.
2. **Kredi öncesi kontrol** (`src/lib/jobs/tasks/credits-monthly-grant.ts` `hasLegacyGrant`): iş, kredi yazmadan önce o UTC ayı için eski biçimli satır arar (`monthly_grant`, `refId` NULL, `grantPeriod` NULL). Bulursa `alreadyGrantedCount` sayar. Bu katman, migration koştuktan **sonra** hâlâ canlı olan eski kodun yazdığı satırı kapatır. Doldurma bunu yakalayamaz, çünkü tek sefer koşar.
3. **Kapanmayan sıra açıkça yazıldı:** "önce yeni worker, sonra eski kod" aynı ayda. Eski kod yeni satırı göremez. ADR-0008 §9.2'deki "yanlış sırada bile ikinci kez kredi vermez" cümlesi değiştirildi: kredi işi de sıra kuralına tabi. Aynı düzeltme migration başlığında, kod yorumunda ve eski raporda (`TASK-MUMT3PGX5OK8P-devop-fb.md` §4, düzeltme notu) de var.

### B-2 (Dockerfile / compose web yerine worker)
- `worker` aşaması `runner`'ın **önüne** alındı. Hedefsiz `docker build .` artık web'i derliyor.
- Builder'a `pnpm build`'den önce `RUN node_modules/.bin/prisma generate` eklendi. Bu, `--target runner`'ın `.prisma/client/index-browser` ile düşmesini gideriyor. Kusur eskiden de vardı.
- `docker-compose.yml`: `fabrika-web.build.target: runner` (worker'da `target: worker` zaten vardı).

### Ö-bulguları
| Bulgu | Durum |
|---|---|
| Ö-1 M6 (`unsafe_dedupe`→`replace` sağ) | **Kapandı.** `tests/jobs-enqueue-and-tick.test.ts`: `addJob` `jobKeyMode:'unsafe_dedupe'` + anahtar ile çağrılıyor mu? |
| Ö-1 M7 (`locked_at===null` silinince sağ) | **Kapandı.** `tests/jobs-schedule.test.ts`: son denemesi koşan iş "tükendi" sayılmıyor. |
| Ö-1 M9 (`monthOf(tick)`→`monthOf(null)` sağ) | **Kapandı.** Tik 2026-10-01, saat 2026-11-01 (sahte Date), yazılan `grantPeriod` = `2026-10`. |
| Ö-2 (sağlık işi de cron; hepsi düşükse alarm yok) | **ADR'ye yazıldı** (§9.3 "Sınır"). Dış kalp atışı kontrolü (`job-queue-health.last_execution` > 70 dk) barındırma kararına (§4) bağlı; izleme aracı seçilmediği için kod eklenmedi. |
| Ö-3 (5 deneme ≈ 85 sn) | **Değiştirilmedi.** Gerekçe: veri kaybı yok (k1 ertesi gün yeniden koşar, upsert idempotent). Eski Inngest backoff'unun daha uzun olduğu doğrulanmamış bir varsayım. `maxAttempts` değişikliği her işin alarm zamanlamasını da değiştirir; ayrı bir kararla yapılmalı. |
| Ö-4 (compose yorumu `--scale` ile çelişiyor; `JOBS_CRON_ENABLED` varsayılanı) | **Yorum düzeltildi.** `container_name` sabit, `--scale` çalışmaz; ikinci kopya başka adla. Varsayılan `true` yalnız yerel yığın içindir; üretim açıkça verir ve §9.2'yi izler. `container_name` kaldırılmadı, çünkü mevcut yerel komutlar bu adı kullanıyor olabilir. |
| Ö-5 (elle payload) | **Değişiklik yok.** crw'nin tespitiyle aynı fikirdeyim: davranış Inngest "Invoke" ile aynı, yalnız DB kimliği olan operatör yapabilir. |

## 2. Kanıt

### B-1 canlı senaryo (izole `devopfb_b1`, gerçek worker `pnpm jobs:worker`, `JOBS_CRON_ENABLED=false`)
Eski kodun yazdığı satırlar + bir iyzico kredisi eklendi, ardından migration iki kez uygulandı:
```
INSERT 0 3   (old-inngest-nov 06:00:03, old-inngest-nov-retry 06:00:09, iyzico-jan refId=pay-123)
apply#1: ALTER TABLE / UPDATE 1 / CREATE INDEX   exit=0
apply#2: ALTER TABLE / UPDATE 0 / CREATE INDEX   exit=0
 old-inngest-nov       | 500 |         | 2026-11 |
 old-inngest-nov-retry | 500 |         |         |      ← retry kopyası NULL kalır (tarih)
 iyzico-jan            | 500 | pay-123 |         |      ← ödeme kredisi işaretlenmedi
```
Migration'dan **sonra** eski kodun yazdığı Aralık satırı eklendi (`old-inngest-dec-after-migration`), üç iş kuyruğa kondu:
```
DONE job=1 {"period":"2026-11","grantedCount":0,"alreadyGrantedCount":1,"totalCreditsGranted":0}   ← crw senaryosu: eskiden 1000
DONE job=2 {"period":"2026-12","grantedCount":0,"alreadyGrantedCount":1,"totalCreditsGranted":0}   ← hasLegacyGrant
DONE job=3 {"period":"2027-01","grantedCount":1,"alreadyGrantedCount":0,"totalCreditsGranted":500} ← iyzico kredisi engel olmadı
```
(Kasım toplamı 1000 görünüyor, çünkü senaryoya **eski** kodun retry kopyasını bilerek iki satır olarak koydum. Yeni iş 0 ekledi.)

### B-1 testleri ve mutantlar (`src/lib/jobs/tasks/__tests__/cron-tenant-scope.test.ts`, RLS rolü `fabrika_app`)
- Yeni: "a month the old Inngest job granted is not granted again" ve "the backfill stamps old job rows only, once per month, and re-runs clean". Sonuç: `Tests 13 passed (13)`.
- Mutantlar (her biri tek satır, sonra geri alındı, `cmp` ile doğrulandı), **5/5 kırmızı:**
  - `hasLegacyGrant` devre dışı → `1 failed`
  - SQL'den `"refId" IS NULL` silindi → `1 failed` (ödeme kredisi işaretlendi)
  - `s.rn = 1` → `s.rn >= 1` → `1 failed`
  - `NOT EXISTS … x."grantPeriod" = s.p` → `false` → `1 failed` (`23505 duplicate key`)
  - ay aralığının `gte` alt sınırı silindi → `1 failed` (Haziran satırı Temmuz'u engelledi)

### Ö-1 mutantları (`tests/jobs-schedule.test.ts` + `tests/jobs-enqueue-and-tick.test.ts`: `19 passed`)
```
[M6] jobKeyMode 'unsafe_dedupe'→'replace'        → Tests 1 failed | 18 passed
[M7] exhausted filtresinden locked_at===null     → Tests 1 failed | 18 passed
[M9] monthOf(tick)→monthOf(null)                 → Tests 1 failed | 18 passed
```

### B-2 Docker (temiz worktree)
```
docker build -t devopfb-b2-web:tmp .          → EXIT=0; aşamalar: base 2, deps 3, builder 4, runner 5 (worker YOK); "✓ Compiled successfully"
docker build --target worker …                 → EXIT=0
web:    Cmd=["node","server.js"] User=nextjs Ports={"3000/tcp":{}}
worker: Cmd=["node_modules/.bin/tsx","scripts/jobs-worker.ts"] User=node Ports=null
docker compose --profile app config            → fabrika-web target: runner · fabrika-worker target: worker
```
İlk derleme denemesi `tsc` hatasıyla düştü (`noUncheckedIndexedAccess`, `period.split` dizisi). Önce düzeltildi, sonra yeniden koşuldu. Builder aşaması artık `next build`'in tip kontrolüne kadar ilerliyor, yani `prisma generate` düzeltmesi etkili.

Konteynerler (izole DB, `NODE_ENV=production`, compose'daki web env'i):
```
web:  "✓ Ready"
  GET /            → 307 → /tr
  GET /tr          → 200, <title>FonBridge — AB Finansman Platformu (Horizon Europe, Eurostars)</title>
  GET /api/inngest → 404
worker: "[jobs] worker up (pid 23) …", "Worker connected and looking for jobs"
  jobs:enqueue credits-monthly-grant --period 2027-02 → konteyner worker aldı:
  [job(worker-b10722a8…: credits-monthly-grant{4})] DONE {"period":"2027-02","grantedCount":1,…}
```
(Yerel worker'ım bu adımdan önce SIGTERM ile kapatıldı: "Global graceful shutdown complete". İşi konteyner aldı.)

### Kapılar (temiz worktree, yamayla birebir aynı dosyalar, `cmp` ile doğrulandı)
```
npx tsc --noEmit → 0 · pnpm lint → 0 · pnpm build → EXIT=0
tam vitest (devopfb_suite):
  1. koşu: Test Files 1 failed | 233 passed | 2 skipped · Tests 1 failed | 2727 passed
     tek kırmızı: tests/agency-invite.live.test.ts "after the function fails mid-call…". crw İNCELEME-38'de de dalgalı buldu.
     Tek başına 2 kez: 18/18, 18/18.
  2. koşu: Test Files 234 passed | 2 skipped (236) · Tests 2728 passed | 8 skipped (2736) · EXIT=0
paylaşılan fabrika Tenant sayısı: 1 → 1
```
Worktree tabanı `ee8b4c8b`. Sonra `dev`'e gelen commit'ler (`823b946c` vb.) benim dosyalarımın hiçbirine dokunmuyor (`git diff --name-only ee8b4c8b HEAD` içinde jobs/Dockerfile/compose/credit/ADR-0008 yok).

### Temizlik
- Konteynerler `devopfb-b2-web` ve `devopfb-b2-worker` kaldırıldı. İmajlar `devopfb-b2-{web,worker}:tmp` silindi (sayım 0).
- Yerel worker (pid 97607, kendi başlattığım) SIGTERM ile kapatıldı.
- DB'ler `devopfb_b1` ve `devopfb_suite` DROP edildi. Worktree `git worktree remove`.
- crw'nin konteynerleri (`crwfb-i38`, `crwfb-i38-wkr`) ve `sefb-mun50` hâlâ çalışıyor. Benim değiller, dokunulmadı.

## 3. Değişen dosyalar
- `Dockerfile`: worker aşaması runner'ın önünde; builder'da `prisma generate`.
- `docker-compose.yml`: `fabrika-web` `target: runner`; worker yorumu (Ö-4).
- `prisma/migrations/credit-ledger-grant-period.sql`: doldurma + başlık.
- `src/lib/jobs/tasks/credits-monthly-grant.ts`: `hasLegacyGrant` + yorum.
- `src/lib/jobs/tasks/__tests__/cron-tenant-scope.test.ts`: 2 canlı test.
- `tests/jobs-schedule.test.ts`: M7 testi.
- `tests/jobs-enqueue-and-tick.test.ts` (yeni): M6 ve M9 testleri.
- `docs/adr/ADR-0008-own-job-queue-graphile-worker.md`: §9.2 kredi iddiası, §9.3 sınır (Ö-2).
- `docs/agent-results/TASK-MUMT3PGX5OK8P-devop-fb.md`: §4'e düzeltme notu.

## 4. Riskler
- **Açık kalan sıra:** aynı ayda önce yeni worker, sonra eski Inngest kodu. Kodla kapatılamaz, çünkü eski kod değişmiyor. Tek koruma ADR §9.2 dağıtım sırası. RELEASE_CHECKLIST'e eklenmesi cs-fb'de.
- Canlı DB'de `refId`'siz ama iş dışından yazılmış bir `monthly_grant` satırı varsa (örneğin elle SQL ile eklenmiş), doldurma onu iş kredisi sayar ve o ay kredi verilmez. Kod tabanında böyle bir yazıcı yok (tüm `creditLedger.create` çağrıları tarandı). Canlıda migration öncesi kontrol sorgusu: `select count(*) from "CreditLedger" where reason='monthly_grant' and "refId" is null`.
- `hasLegacyGrant` kiracı başına ayda bir ek sorgu yapar ve `(tenantId, createdAt)` index'ini kullanır; maliyeti ihmal edilebilir. Eski kodlu hiçbir sürüm kalmadığında kaldırılabilir, ama zararı yok.
- **Geri alma:** migration başlığında yazılı (`DROP INDEX` + `DROP COLUMN`; doldurma kolonla birlikte gider, hiçbir satırın `delta`'sı değişmez). Kod için `git revert`. Docker için eski Dockerfile, ama o zaman web imajı yine derlenmez.

## 5. Açık sorular
- Ö-2 dış kalp atışı: hangi uptime/izleme aracı? Barındırma kararıyla (ADR §4) birlikte verilmeli.
- Ö-3: dış kaynaklı işlerde (k1, k2) `maxAttempts` artırılsın mı? Ürün kararı.

## 6. Sonraki adım
- crw-fb yeniden inceleme: yalnız B-1 ve B-2 (crw raporu öyle diyor).
- cs-fb: RELEASE_CHECKLIST'e §9.2 sırası ve canlı öncesi `refId IS NULL` sayım sorgusu.

## Platform beyanı
- **mac** üzerinde doğrulandı: Darwin 27.0, Node (yerel) + tsx worker, Docker Desktop, Postgres 16 (`pgvector/pgvector:pg16`).
- **Linux** üzerinde de koştu: iki imaj Docker Desktop'ın Linux VM'inde derlendi ve çalıştı (node:22-alpine). Web HTTP 307/200 verdi, worker iş aldı. Tam süit Linux'ta koşulmadı; CI (ubuntu) koşacak.
- **Windows** koşulamadı, çünkü makinede yalnız macOS var. Koddan bakıldığında:
  - Değişikliklerin hiçbiri platforma bağlı değil. SQL sunucu tarafında çalışıyor. `hasLegacyGrant` ay sınırlarını `Date.UTC` ile hesaplıyor, makinenin saat diliminden bağımsız.
  - Dockerfile aşama sırası her Docker kurulumunda aynı sonucu verir.
  - Yeni birim testi sahte `Date` kullanıyor, dosya yolu ya da kabuk kullanmıyor.
