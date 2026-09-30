# TASK-MUNSBP474W7JQ — M4 60-gün özeti: günde tek özet, kullanıcı düzeyinde (İNCELEME-56 Y-1) — se-fb

**Durum: TAMAM**

Dal: `se-fb/munsbp-digest-once` (dev `701706ef`'ten), düzeltme commit'i `6a7844eb`. Dev'e merge edildi: `62ce8770`. Push yapılmadı.
Ortam: kendi worktree'm. İzole Postgres `sefb-sbp-pg` (pgvector/pg16, 127.0.0.1:55492) ve mailpit `sefb-sbp-mailpit` (SMTP :11192, API :18092). Kurulum CI'ın "Prepare database" adımıyla aynı: `db push` → `db:rls-role` → `apply-migrations.sh` iki kez (38/38 dosya, iki geçiş de exit 0) → `db:rls` (112 politika) → `db:seed`. Paylaşılan fabrika DB'sine (:5433) hiç yazılmadı.

## 1. Ne yapıldı

**Kök neden:** "Bugün özet gönderildi mi" bilgisi (`Membership.staleDigestOn`) kiracı başına okunuyordu. Bu okuma `collectTenant` içinde pilot ve M4 kapılarının **arkasında** kalıyordu (`:126-139` → `:158`). Kiracı hata verdiğinde de (`:349`) hiç okunmuyordu. `claimDigest` ise yalnız özetin kapsadığı kiracıların üyeliklerine bakıyordu. Sonuç: bugünkü claim, bu koşuda atlanan bir kiracıdaysa kullanıcıya aynı gün ikinci özet gidiyordu.

**Düzeltme:** İNCELEME-56'nın önerdiği (b) yolu seçildi; (a) yolu kiracı hatasını kapatmıyordu.
- `src/lib/relationships/stale-reminder.ts`
  - Yeni `claimedElsewhere(userId, claimedNow, now)`: `withSystemScope('cross-tenant-job', 'm4-stale.claimedElsewhere')` altında tek bir `membership.findFirst({ where: { userId, tenantId: { notIn: claimedNow }, staleDigestOn: { gte: bugün } }, select: { tenantId } })` çağrısı. Dönen tek alan tenantId; başka satır içeriği okunmuyor.
  - Kontrolün yeri: kiracı-kapsamlı CAS claim'leri alındıktan **sonra**, gönderimden **önce**. Başka bir üyelikte bugünün claim'i varsa bu koşunun claim'leri geri verilir (`release`), `skippedMailedToday++`, özet gitmez.
  - Neden sonra: iki koşu aynı anda farklı kiracıları claim ederse, en az biri ötekinin claim'ini görür ve geri çekilir. İkisi de geri çekilebilir; o zaman kullanıcı o gün özet almaz, ama iki özet asla gitmez. Bu, kodun mevcut "çökme bir günlük özete mal olur" ilkesiyle aynı yöne düşüyor.
  - Hata olursa kapalı kalır (fail-closed): system-scope okuması hata verirse mevcut `catch` yoluna düşülür (`digestsFailed`, claim'ler geri verilir, özet gitmez).
- `scripts/tenant-bypass-baseline.json`: CHECK D için gerekçeli bir `system-scope:cross-tenant-job` girdisi eklendi. Gate, yeni kaçışı gerekçe yazılana kadar kırmızı tuttu (kanıt aşağıda). Gate gevşetilmedi.
- `tests/stale-relationship-reminder.live.test.ts`: İnceleme'deki i56x/i56d/i56e senaryosu iki canlı regresyon testine çevrildi (`fabrika_app`, NOBYPASSRLS):
  1. 07:00'de yalnız Y1.b'de due satır var → özet gider, Y1.b claim edilir. Y1.a'daki satır 07:20'de stale olur. Y1.b'de M4 `OFF` yapılır, 07:22'de ikinci koşu → **0 mail**, satır damgasız, Y1.a claim'i geri verilmiş. Ertesi sabah geç satır tek özetle gider.
  2. Aynısı, ikinci koşuda Y1.b'nin `runTenant`'ı hata verecek şekilde (kiracı hatası, `tenantsFailed 1`).

  Fikstür kiracıları ayrı ve dar bir koşuda (`runY1`, `tenantIds: [Y1.a, Y1.b]`) çalışıyor. Paylaşılan `run`'a eklendiklerinde mevcut çökme testi 5 sn sınırını aşıyordu; test gevşetilmedi, fikstür ayrıldı.

## 2. Kanıt

**TDD — düzeltme öncesi KIRMIZI (dev kodu + yeni testler):**
```
× a tenant skipped on the second run (M4 closed) ... (İNCELEME-56 Y-1)
× a tenant whose read fails on the second run ... (İNCELEME-56 Y-1)
AssertionError: expected [ { …(4) } ] to have a length of +0 but got 1   ← ikinci özet
      Tests  2 failed | 14 passed (16)
```
Mevcut 14 test dev'de de yeşildi (`Tests 14 passed (14)`, orijinal dosya).

**Düzeltme sonrası:** `Tests 16 passed (16)`.

**Mutantlar (5/5 öldü, her biri sonrası `git checkout`, ağaç temiz):**

| Mutant | Sonuç |
|---|---|
| M1 düzeltme satırı silindi (claimedElsewhere çağrılmıyor) | 2 failed / 14 passed |
| M2 system scope yok, çıplak `prisma` (fabrika_app altında RLS 0 satır döndürür) | 2 failed / 14 passed |
| M3 `notIn: claimedNow` düşürüldü (kendi claim'ini görür) | 13 failed / 3 passed |
| M4 `gte: bugün` → `not: null` (dünkü claim de engeller) | 8 failed / 8 passed |
| M5 atlamada `release()` yok (claim takılı kalır) | 2 failed / 14 passed |

M2 önemli: testlerin RLS yolunu gerçekten sınadığını gösteriyor. System scope olmadan kontrol hiçbir şey görmüyor ve hata geri geliyor.

**Gerçek worker + mailpit (canlı, gerçek saat).** Worker'ın uygulama sorguları `DATABASE_URL=fabrika_app` ile, graphile şeması `JOBS_DATABASE_URL=fabrika` ile, cron kapalı, iş elle eklendi. Kullanıcı `sbpx` iki kiracıya üye: `sbp-d` ve `sbp-e`. `d-X65` şu an stale. `e-XLATE` 08:03:05 UTC'de stale oluyor.
```
Koşu 1 (08:01:37, düzeltilmiş kod)   DONE job=1 {"tenants":3,"tenantsModuleClosed":0,"relationshipsDue":1,"skippedMailedToday":0,"digestsSent":1,...}
  mailpit total 1   2026-09-30T08:01:38.59Z sbpx@example.test "FonBridge: 1 ilişkiyle 60 gündür temas yok"
  claim: sbp-d|2026-09-30   sbp-e|(null)
— 08:03:10 sonrası sbp-d M4 → OFF —
Koşu 2 (08:03:26, düzeltilmiş kod)   DONE job=2 {"tenantsModuleClosed":1,"relationshipsDue":0,"skippedMailedToday":1,"digestsSent":0,...}
  mailpit total 1   (değişmedi)
  claim: sbp-d|2026-09-30   sbp-e|(null)   ← deneme claim'i geri verildi
  e-XLATE staleRemindedAt: (null)          ← yarın gidecek
— worker SIGTERM, düzeltme geri alındı (canlı mutant), worker yeniden —
Koşu 3 (08:04:30, MUTANT)            DONE job=3 {"tenantsModuleClosed":1,"relationshipsDue":1,"skippedMailedToday":0,"digestsSent":1,...}
  mailpit total 2   2026-09-30T08:04:33.795Z sbpx@example.test  ← aynı gün 2. özet (İNCELEME-56'daki hata)
  claim: sbp-d|2026-09-30   sbp-e|2026-09-30
```
Mutant sonrası `git checkout`, HEAD `6a7844eb`, ağaç temiz. `graphile_worker._private_jobs` 0 satır.

**Kapılar (dal, izole DB):**
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0, çıktı boş
- `pnpm build` → exit 0. Tek uyarı, önceden var olan `src/instrumentation.ts:18` Edge `process.exit` uyarısı; bu işte dokunulmadı.
- `pnpm rls:bypass-check`:
  - baseline girdisinden önce `❌ 1 tenant bypass(es) this baseline has never seen … CHECK D … stale-reminder.ts:263`
  - girdi eklendikten sonra exit 0
  - dev'de de exit 0
- `pnpm rls:check` → exit 0
- Bekçiler: `teardown-where-guard`, `where-guard-src`, `system-scope.live`, `stale-relationship-reminder.live` → `Test Files 4 passed (4) · Tests 31 passed (31)`
- Tam `npx vitest run`, iki koşu:
  - 1. koşu: `Test Files 5 failed | 253 passed | 2 skipped (260) · Tests 5 failed | 3129 passed | 22 skipped (3156)`
  - 2. koşu: `Test Files 3 failed | 255 passed | 2 skipped (260) · Tests 3 failed | 3131 passed | 22 skipped (3156)`
  - Kırmızılar yalnız süre ve CPU bütçeli testler: `invoice-writer`, `withholding-rounding`, `vat-by-country` ("Test timed out in 5000ms"), `rag-pdf-real-parse`, `rag-pdf-worker-isolation` (CPU bütçesi).
  - Yük ortalaması o sırada **54.9**. Bu beş dosya tek başına: `Test Files 5 passed (5) · Tests 97 passed (97)`.
  - Hiçbiri değişen dosyaları import etmiyor. Aynı aile crw-fb'nin TASK-MUNSGZ4K6M5KL ve benim TASK-MUNRAS3B9WBY3 raporlarımda da yük kaynaklı olarak kayıtlı.
- Merge sonrası: `git diff 6a7844eb 62ce8770 -- src tests scripts prisma package.json` boş. Merge'e yalnız başkalarının docs commit'leri girdi, test edilen kod = dev'deki kod.

## 3. Değişen dosyalar
- `src/lib/relationships/stale-reminder.ts` (+31/−1)
- `tests/stale-relationship-reminder.live.test.ts` (+80/−6)
- `scripts/tenant-bypass-baseline.json` (+9, CHECK D girdisi)
- `docs/agent-results/TASK-MUNSBP474W7JQ-se-fb.md` (bu rapor)

## 4. Riskler
- **R-1 (bilinçli):** Farklı kiracıları eşzamanlı claim eden iki koşu birbirini görüp ikisi de geri çekilebilir. O durumda kullanıcı o gün özet almaz, satırlar damgasız kalır ve ertesi sabah gider. Tek kuyruk (`queue: m4-stale-relationships`) bu eşzamanlılığı zaten pratikte önlüyor.
- **R-2:** System scope kapısı kapanırsa M4 özeti tümüyle durur. Bu, `REVOKE EXECUTE enter_system_scope` ya da `db:rls` uygulanmamış bir DB olabilir. Her kullanıcı `digestsFailed` olur ve `warn` SystemAlert yazılır. Yön güvenli (fazla mail yok), ama sessiz değil. Üretimde `db:rls` diğer 5 cross-tenant-job için de şart; yeni bir dağıtım ön koşulu eklenmiyor.
- **R-3 (küçük, kapsam dışı):** Mail sağlayıcısı olmayan kuru sayım (`mailer: null`) `claimedElsewhere`'e bakmıyor. Y-1 durumunda `relationshipsDue` 1 fazla sayılabilir. Yalnız sayıyı etkiler, mail gitmez.

## 5. Açık sorular
- İNCELEME-56'nın "RLS dışı dar okuma kabul edilir mi" sorusu: yeni bir SECURITY DEFINER fonksiyonu **eklenmedi**. Var olan onaylı kapı (`withSystemScope`, `cross-tenant-job`, 5 emsal) kullanıldı ve baseline'a gerekçe yazıldı. Mimari onay gerekiyorsa gözden geçirilecek tek nokta bu baseline girdisi.

## 6. Sonraki adım
- crw-fb: kısa yeniden inceleme. Y-1 senaryosunun canlı tekrarı ve tam `vitest run`.
- İsteğe bağlı: İNCELEME-56 D-1'de yaşayan mutantlar (M02, M04, M11, K06) için ek testler. Bu kartın kapsamı dışında.

## Temizlik
- Kendi iki worker'ım (pid 90122, 91560) SIGTERM ile kapatıldı: `Global graceful shutdown complete`. Başka sürece dokunulmadı.
- Konteynerlerim `sefb-sbp-pg` ve `sefb-sbp-mailpit` (`--rm`) iş sonunda durduruldu.
- Worktree scratchpad'de; ana checkout'a yalnız merge ve bu rapor girdi.

**Platform:** mac'te doğrulandı (darwin 27, Node 26, Postgres 16 + pgvector konteyneri, graphile-worker 0.18, mailpit). Değişen kod platforma bağlı değil: süreç, dosya yolu ya da kabuk yok; yalnız Node, Prisma ve SQL. Gün sınırı UTC (`dayStartUtc`).
- **Linux koşulamadı:** üretim worker imajı bu turda kurulmadı. Koddan beklenen bir fark yok; RLS/system scope ve CAS Postgres tarafında, platformdan bağımsız.
- **Windows koşulamadı:** makine yok. Koddan beklenen bir fark yok.
- Ortama özgü not: bu makinede `psql` yok. Migration'lar `PSQL` ortam değişkeniyle konteyner içindeki psql'e yönlendirilerek uygulandı; bu, ürün kodunu etkilemiyor.
