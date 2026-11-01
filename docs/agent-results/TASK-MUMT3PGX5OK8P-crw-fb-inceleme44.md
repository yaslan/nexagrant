# TASK-MUMT3PGX5OK8P: İNCELEME-44 · crw-fb

**İncelenen:** `435f8f7d`, devop-fb'nin İNCELEME-38 (`TASK-MUN4N43VERLXK-crw-fb.md`) B-1 ve B-2 düzeltmesi. Rapor: `TASK-MUMT3PGX5OK8P-devop-fb-2.md`.
**Ortam:** temiz ayrık worktree (`b17d2ed2` = `dev` HEAD, `435f8f7d` onun atası) ve kendi Postgres konteynerim (`crwfb-i44`, `pgvector/pgvector:pg16`, :55491). Kurulum CI sırasıyla yapıldı: `db push`, `db:rls-role`, `apply-migrations` ×2, `db:rls`, `db:seed`. Paylaşılan `fabrika-postgres`'e ve :3000'e dokunulmadı. Kod DEĞİŞTİRİLMEDİ. Mutantlar yalnız kendi worktree'mde denendi, `git checkout` ile geri alındı ve `git status` boş çıktı.

## Karar: DÜZELTME GEREKLİ (tek bloke, küçük düzeltme)

- **B-1 (asıl senaryo) KAPANDI.** Önce eski kod ayı yazıyor, sonra migration uygulanıyor, sonra yeni iş aynı ay koşuyor. Sonuç tek kredi. Migration ikinci koşuda `UPDATE 0`.
- **B-2 KAPANDI.** `docker build .` web imajını üretiyor: `node server.js`, :3000, `/tr` 200. Worker imajı iş alıyor. Compose'da her servis kendi target'ını kullanıyor.
- **Yeni bloke N-1:** migration başlığındaki geri dönüş yolu, yeni işin kendi satırlarının ay damgasını siliyor. Yeniden ileri alındıktan sonra aynı ay tekrar koşarsa ikinci kredi yazılıyor. Canlı olarak koşuldu: Ekim için **1000**. Düzeltme tek `UPDATE`; izole DB'de denendi ve **500** verdi.

## Bulgular (önem sırasıyla)

### N-1 (BLOKE, orta: çift kredi/para): geri dönüş, yeni işin kendi satırlarını anahtarın dışına düşürüyor

- **Yer:** `prisma/migrations/credit-ledger-grant-period.sql`.
  - Başlıktaki "Rollback: DROP INDEX …; ALTER TABLE … DROP COLUMN "grantPeriod"" ve "(the backfill goes with the column; no row's credits are changed by it)" satırları.
  - Doldurma koşulu `"refId" IS NULL` (satır 55). `hasLegacyGrant` içinde de aynı koşul var: `refId: null` (`credits-monthly-grant.ts:43`).
- **Neden:** `DROP COLUMN`, yeni işin yazdığı satırın (`refId='monthly_grant:2026-10'`) `grantPeriod` değerini de siliyor. Yeniden ileri alındığında doldurma bu satırı atlıyor, çünkü `refId` dolu. `hasLegacyGrant` de onu görmüyor. Sonuçta o ay için anahtarda satır kalmıyor.
- **Senaryo (canlı, gerçek `pnpm jobs:worker` + `jobs:enqueue`):**
  ```
  R1 yeni iş Ekim'i verir     DONE job=2 {"period":"2026-10","grantedCount":1,…,"totalCreditsGranted":500}
  R2 rollback (başlıktaki SQL) DROP INDEX / ALTER TABLE
  R3 yeniden ileri (migration) ALTER TABLE / UPDATE 1 / CREATE INDEX
     cmun5ypty0001…|500|monthly_grant:2026-10|NULL      ← kendi satırı damgasız kaldı
  R4 aynı ay yeniden koşu      DONE job=3 {"period":"2026-10","grantedCount":1,…,"totalCreditsGranted":500}
     ekim_toplam=1000
  ```
  (`UPDATE 1`, Eylül'ün eski-iş satırıdır. Ekim satırına dokunulmadı.)
- **Tetikleyen yollar:** geri dönüşten sonra aynı ay için:
  - elle `pnpm jobs:enqueue -- credits-monthly-grant --period …` koşulması. Kaçırılmış tik alarmı bunu öneriyor.
  - `--force`.
  - tekrar deneme.
  - aynı tikte iki worker'ın çalışması.

  Ö-1'in asıl vaadi olan "tekrar koşu ikinci kredi vermez", geri dönüşün ardından o ay için geçersiz oluyor.
- **Önerilen düzeltme (izole DB'de denendi):** eski-iş doldurmasının **önüne** yeni işin kendi satırlarını `refId`'den geri dolduran bir `UPDATE` ekle.
  ```sql
  UPDATE "CreditLedger"
     SET "grantPeriod" = substr("refId", 15)
   WHERE reason = 'monthly_grant' AND "grantPeriod" IS NULL
     AND "refId" ~ '^monthly_grant:[0-9]{4}-(0[1-9]|1[0-2])$';
  ```
  Kanıt: aynı R2 durumuna dönüldü, düzeltilmiş dosya iki kez uygulandı.
  ```
  1. koşu: ALTER TABLE / UPDATE 1 / UPDATE 1 / CREATE INDEX
  2. koşu: ALTER TABLE / UPDATE 0 / UPDATE 0 / CREATE INDEX
  cmun5ypty0001…|500|monthly_grant:2026-10|2026-10
  DONE job=4 {"period":"2026-10","grantedCount":0,"alreadyGrantedCount":1,…}   ekim_toplam=500
  ```
  - Yeni satır önce damgalandığı için eski-iş doldurmasının `NOT EXISTS` koşulu aynı aydaki eski satırı atlar. Kısıt ihlali olmaz. Yeni-iş satırları eski index sayesinde zaten ay başına tektir.
  - Test: `cron-tenant-scope.test.ts` içindeki doldurma testine `refId:'monthly_grant:2031-10'` ve `grantPeriod` NULL olan bir satır ekle, beklenen değer `'2031-10'`.
  - **Alternatif** (kod yerine belge düzeltmesi): başlıktaki rollback'i "yalnız kod geri alınır, kolon düşürülmez" diye değiştir. Kolon kalırsa eski kod onu görmez ve zarar yok. Bu da kabul edilebilir, ama yazılı prosedür bugün çift krediye götürüyor.

### Ö-1 (öneri, test boşluğu): `hasLegacyGrant` ay üst sınırı testsiz (mutant MA sağ)

- `credits-monthly-grant.ts:45` içindeki `lt: Date.UTC(year, month, 1)` silindiğinde `cron-tenant-scope` sonucu `13 passed` oluyor.
- Etki: geçmiş bir ay elle koşulursa (`--period 2026-08`) ve sonraki bir ayın eski-iş satırı varsa, o ay "zaten verildi" sayılır. Sonuç eksik kredidir, çift kredi değil. Düşük risk.
- Öneri: mevcut testteki kiracı b'ye sonraki aydan bir eski-iş satırı eklenebilir, örneğin `2031-08-01`.

### Ö-2 (öneri, regresyon koruması yok): Dockerfile aşama sırası hiçbir kapıda denetlenmiyor (mutant MD sağ)

- Worker aşaması tekrar sona taşındığında hedefsiz `docker build .` → `Cmd=["node_modules/.bin/tsx","scripts/jobs-worker.ts"]` üretiyor ve hiçbir test ya da CI adımı kırılmıyor. `tests/`, `src/`, `scripts/`, `.github/` içinde Dockerfile'a başvuran dosya sayısı 0.
- Compose artık `target: runner` kullandığı için korunuyor. Açıkta kalan yalnız hedefsiz `docker build .`, yani B-2'nin kendisi.
- Öneri: CI'a ucuz bir kontrol eklenebilir. Örneğin son `FROM` satırının `AS runner` olduğunu doğrulayan tek satır, ya da `docker build` + `image inspect .Config.Cmd`.

### Ö-3 (not): iyzico `refId` teorik olarak NULL olabilir

- `iyzico.ts:633`: `paymentId = detail.paymentId ?? notification.token`. `token` alanı isteğe bağlı (`token?: string`, satır 393).
- İkisi de yoksa etkinleştirme kredisi `refId` NULL olarak yazılır. Doldurma ve `hasLegacyGrant` bu satırı eski-iş satırı sayar ve o ayın zamanlanmış kredisi verilmez.
- Gerçek bir iyzico bildiriminde en az biri dolu olmalı. Bu bir varsayım, canlı veriyle doğrulanmadı. devop raporundaki canlı öncesi `refId IS NULL` sayım sorgusu bu durumu da ortaya çıkarır.

## Kanıt

### B-1: geçiş senaryosu (izole DB, gerçek worker, `JOBS_CRON_ENABLED=false`)
```
0. dağıtım öncesi: DROP INDEX / ALTER TABLE DROP COLUMN → grantPeriod kolonu sayısı 0
1. eski Inngest kodunun create'i (tenantId, delta, reason; refId yok — `git show 2c20324f~1:…/credits-monthly-grant.ts:42`):
   i44-old-sep | demo-tenant | 500 | monthly_grant | 2026-09-01 06:00:03
2. scripts/apply-migrations.sh (34/34) + dosya tekrar: ALTER TABLE / UPDATE 0 / CREATE INDEX
   i44-old-sep|500|-|2026-09
3. pnpm jobs:enqueue -- credits-monthly-grant  (aynı ay, 2026-09)
   DONE job=1 {"period":"2026-09","grantedCount":0,"alreadyGrantedCount":1,"failedCount":0,"totalCreditsGranted":0}
   eylul_toplam=500      ← İNCELEME-38'de aynı senaryo 1000 idi
```
- Eski kodun satırı SQL ile yazıldı, çünkü güncel Prisma istemcisi `grantPeriod` kolonu olmayan tabloda `RETURNING` ile düşer. Satırın kolonları eski `create` çağrısıyla birebir aynı.
- Migration sırası: `apply-order.txt:45`, 34 dosyanın 33.'sü, `db push`'tan sonra. `db push` kolonu ve index'i zaten kurduğunda dosya `already exists, skipping` verir ve doldurma yine koşar (CI hazırlığı, `PREP_EXIT=0`).

### Mutantlar (her biri tek değişiklik, sonra `git checkout`)
| # | Mutant | Sonuç |
|---|---|---|
| MB | `hasLegacyGrant` içinde `refId: null` silindi | ÖLDÜ (`1 failed \| 12 passed`) |
| MC | `hasLegacyGrant` çağrısı `false &&` ile devre dışı | ÖLDÜ (`1 failed \| 12 passed`) |
| M6 | `enqueue.ts` `unsafe_dedupe` → `replace` (İNCELEME-38 Ö-1'in bağımsız tekrarı) | ÖLDÜ (`1 failed \| 18 passed`) |
| **MA** | `hasLegacyGrant` üst sınırı `lt` silindi | **SAĞ** (`13 passed`) → Ö-1 |
| **MD** | Dockerfile'da worker aşaması sona taşındı | **SAĞ.** Hedefsiz derleme worker imajını veriyor, hiçbir kapı kırılmıyor → Ö-2 |

Baseline, üç dosya birlikte: `Tests 32 passed (32)`.

### B-2: iki imaj gerçekten derlendi ve çalıştırıldı
```
docker build -t crwfb-i44-web:tmp .            → WEB_EXIT=0; aşamalar: base, deps, builder, runner — [worker] satırı 0
  "✔ Generated Prisma Client (v7.10.0)" (builder), "✓ Compiled successfully", "Generating static pages (0/30)"
docker build --target worker -t crwfb-i44-worker:tmp . → WKR_EXIT=0
web    Cmd=["node","server.js"] User=nextjs Ports={"3000/tcp":{}}
worker Cmd=["node_modules/.bin/tsx","scripts/jobs-worker.ts"] User=node Ports=null
docker compose --profile app config → fabrika-web target: runner · fabrika-worker target: worker
```
Konteynerler izole DB'ye bağlandı (compose'daki web env'i: `NODE_ENV=production`, `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`; web `-p 55492:3000`):
```
web: "✓ Ready"
  GET /            -> 307 http://localhost:55492/tr
  GET /tr          -> 200   <title>FonBridge — AB Finansman Platformu (Horizon Europe, Eurostars)</title>
  GET /api/inngest -> 404
worker: "Worker connected and looking for jobs... (task names: … 'credits-monthly-grant', … 'job-queue-health')"
  jobs:enqueue credits-monthly-grant --period 2026-11 → job=5
  [credits-monthly-grant] DONE job=5 {"period":"2026-11","grantedCount":1,…}  → CreditLedger 2026-11|500
```
Yerel worker'ım bu adımdan önce SIGTERM ile kapatıldı ("Global graceful shutdown complete"). İşi konteyner aldı.

### Kapılar (temiz worktree, izole DB)
```
npx tsc --noEmit → TSC_EXIT=0
tam vitest 1. koşu: Test Files 1 failed | 233 passed | 3 skipped · Tests 1 failed | 2738 passed
  tek kırmızı: tests/agency-invite.live.test.ts "after the function fails mid-call…" (PrismaClientKnownRequestError)
  İNCELEME-38'de ve devop raporunda da dalgalı. Bu commit o alana dokunmuyor (agency dosya sayısı 0). Tek başına: 18/18, 18/18.
tam vitest 2. koşu: SUITE2_EXIT=0 · Test Files 234 passed | 3 skipped (237) · Tests 2739 passed | 14 skipped (2753)
```

### İNCELEME-38 Ö-bulgularının akıbeti
| Bulgu | Akıbet | Doğrulama |
|---|---|---|
| Ö-1 M6/M7/M9 sağ | Testler eklendi | M6 bağımsız olarak yeniden koşuldu ve ÖLDÜ. M7/M9 için devop'un 3/3 kırmızı kanıtı var. Test dosyaları mevcut ve yeşil (`19 passed`). |
| Ö-2 sağlık işi de cron | ADR §9.3'e "Sınır" paragrafı eklendi, dış kalp atışı kontrolü yok | Diff'te okundu. Barındırma kararına bağlanması makul. **Açık.** |
| Ö-3 5 deneme ≈ 85 sn | Gerekçeyle değiştirilmedi (veri kaybı yok) | Kabul edildi. |
| Ö-4 compose yorumu | Düzeltildi (`--scale` çalışmaz; varsayılan `true` yalnız yerel yığın için) | Diff'te okundu. |
| Ö-5 elle payload | Değişiklik yok | Kabul edildi. |

### Temizlik
- `crwfb-i44`, `crwfb-i44-web` ve `crwfb-i44-wkr` konteynerleri kaldırıldı. `crwfb-i44-{web,worker,mut}:tmp` imajları silindi (Untagged 3).
- İNCELEME-38'den kalan kendi `crwfb-i38`, `crwfb-i38-wkr` konteynerlerim ve `crwfb-i38-{web,fixed,worker}:tmp` imajlarım da kaldırıldı.
- Kalan `crwfb*` konteyner sayısı 0, imaj sayısı 0.
- Yerel worker SIGTERM ile kapatıldı. `wt44` süreci kalmadı. Worktree `git worktree remove` ile kaldırıldı.
- `sefb-mun50` ve `fabrika-postgres` başkalarına ait, dokunulmadı.

## Değişen dosyalar
Yalnız bu rapor. Kod değiştirilmedi.

## Riskler
- N-1 düzeltilmezse: migration başlığındaki rollback izlendiğinde ve ardından aynı ay yeniden koşulduğunda kiracı başına ikinci aylık kredi yazılır.
- "Önce yeni worker, sonra eski kod" sırası kodla kapatılamıyor, ADR §9.2'de yazılı. Tek koruma dağıtım sırası. RELEASE_CHECKLIST'e henüz eklenmedi (cs-fb'de).

## Açık sorular
- N-1 için hangi yol seçilecek: kod (`refId`'den geri doldurma) mı, belge (kolonu düşürmeyen rollback) mı? Önerim kod, çünkü rollback SQL'i zaten yazılı ve birinin koşması muhtemel.

## Sonraki adım
- devop-fb: N-1 düzeltmesi ve test. İsteğe bağlı olarak Ö-1 testi ve Ö-2 CI kontrolü.
- crw-fb: yalnız N-1'in yeniden incelemesi.

## Platform beyanı
- **mac** üzerinde doğrulandı: Darwin 27.0, yerel Node v26.5 + tsx worker, Docker Desktop, Postgres 16 (`pgvector/pgvector:pg16`).
- **Linux** üzerinde de koştu: iki imaj Docker Desktop'ın Linux VM'inde (`node:22-alpine`) derlendi ve çalıştı. Web 307/200 verdi, worker iş aldı. Tam süit Linux'ta koşulmadı; CI (ubuntu) koşacak.
- **Windows** koşulamadı, çünkü makinede yalnız macOS var. Koddan bakıldığında:
  - SQL doldurması sunucu tarafında çalışıyor.
  - `hasLegacyGrant` ay sınırlarını `Date.UTC` ile hesaplıyor, `createdAt` saat dilimsiz UTC. Yani makinenin saat diliminden bağımsız.
  - Dockerfile aşama sırası her Docker kurulumunda aynı sonucu verir.
  - Platforma bağlı kod yolu (süreç, dosya yolu, kabuk) değişmedi.
