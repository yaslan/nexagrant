# TASK-MUNTZJDPE05SJ — FB İNCELEME-69: M4 günde tek özet, kullanıcı düzeyinde (TASK-MUNSBP474W7JQ, se-fb) — devop-fb

**Durum: TAMAM**

**Karar: ONAY.** İNCELEME-56 Y-1 kapandı. Üç atlama nedeninin her biri (M4 kapalı, pilot bitti, kiracı hatası) gerçek worker ve mailpit ile ayrı ayrı denendi. Düzeltilmiş kodda ikinci özet **0**. Düzeltme satırı kaldırılınca (canlı mutant) her birinde ikinci özet **gidiyor**. Eşzamanlı iki koşu, gece yarısı sınırı, iki farklı saat dilimi ve yeni kiracıya ekleme de doğru davrandı. Tam `vitest run` (2. koşu 0 kırmızı), tsc, lint, build, `rls:check`, `rls:bypass-check`, where-guard ve teardown bekçileri yeşil.

Bloke eden bulgu yok. Düşük önemli üç not var:
- D-1: kullanıcı claim'in durduğu kiracıdan aynı gün çıkarılırsa ikinci özet gidiyor.
- D-2: iki mutant test paketinde yaşıyor.
- D-3: `userId` ile başlayan bir indeks yok.

İncelenen commit'ler: `6a7844eb` (dal `se-fb/munsbp-digest-once`) ve dev merge'ü `62ce8770`. İnceleme, düzeltmeyi içeren dev HEAD `cdb85b2c` üzerinde, kendi worktree'mde yapıldı. **Ürün kodu değiştirilmedi.** Mutantlar yalnız worktree'de uygulandı ve her birinden sonra `git checkout` yapıldı.

## Ortam
- Worktree scratchpad'de, `cdb85b2c` detached. Kendi `node_modules`'ü var: `pnpm install --frozen-lockfile --offline` + `pnpm db:generate`. Nedeni R-4'te.
- İzole Postgres `devopfb69-pg` (pgvector/pg16, 127.0.0.1:55469) ve mailpit `devopfb69-mailpit` (SMTP :11169, API :18069). Paylaşılan fabrika DB'sine (:5433) hiç yazılmadı.
- DB, CI'ın "Prepare database" sırasıyla kuruldu: `prisma db push` → `db:rls-role` → `apply-migrations.sh` iki kez (ikisi de `39 files applied`, exit 0) → `db:rls` (`Policies in public: 28 → 112`) → `db:seed`.
- Gerçek graphile-worker 0.18, `scripts/jobs-worker.ts` ile çalıştı. Ayarlar:
  - `DATABASE_URL=fabrika_app` (NOBYPASSRLS)
  - `JOBS_DATABASE_URL=fabrika`
  - `JOBS_CRON_ENABLED=false`
  - SMTP mailpit'e yönlendirildi.
- İşler `graphile_worker.add_job('m4-stale-relationships', {"_cron":{"ts":…}}, queue_name => 'm4-stale-relationships')` ile eklendi. İş `tick`'i `now` olarak kullandığı için saat sınırları deterministik.

## 1. Ne yapıldı / bulgular

### Canlı senaryolar (gerçek worker + mailpit)
Her senaryonun kendi kullanıcısı `u69-<s>` ve iki kiracısı `i69-<s>-a/b` var (pro, M4 ON). Kalıp şu:
- b'deki satır 07:00'de vadeli.
- a'daki satır 07:20'de vadeli oluyor.
- 07:00 koşusu tek özet gönderiyor ve b'yi claim ediyor.
- Koşular arasında b bir şekilde atlatılıyor, ardından 07:22 koşusu yapılıyor.

| # | Koşular arası değişiklik | Düzeltilmiş kod (07:22) | Düzeltme satırı kaldırılmış canlı mutant (07:23/07:25) |
|---|---|---|---|
| S0 | yok (kontrol) | +0 mail (eski `mailedToday` yolu) | +0 |
| S1 | b'de M4 → OFF | **+0**, a'nın deneme claim'i geri verildi | **+1 (aynı gün 2. özet)** |
| S2 | b'nin aboneliği → süresi dolmuş pilot | **+0** | **+1** |
| S3 | b'nin `ModuleState` okuması DB hatası veriyor (`division by zero`, kısıtlayıcı RLS politikası) | **+0**, `tenantsFailed 1` | **+1** |
| S6 | kullanıcı yeni bir kiracıya (c) eklendi, c'de vadeli satırı var; a'da M4 OFF | **+0** | **+1** |
| S7 | kullanıcı claim'in durduğu kiracıdan (b) **çıkarıldı** | **+1 → D-1** | +1 |

Sonuçlar mailpit sayılarından alındı (`mailpit-u69.txt`). S1 ve S2 işlerinin çıktısından:
```
job=3 tick=2026-09-30T07:22:00.000Z {"tenantsPilotExpired":1,"tenantsModuleClosed":3,"tenantsFailed":1,"relationshipsDue":1,"skippedMailedToday":5,"digestsSent":1,...}   ← tek gönderim S7
total 8 {'u69-s0': 1, 'u69-s1': 1, 'u69-s2': 1, 'u69-s3': 1, 'u69-s4': 1, 'u69-s6': 1, 'u69-s7': 2}
job=4 tick=…07:23 (MUTANT)  "digestsSent":3   → total 11 {'u69-s1': 2, 'u69-s2': 2, 'u69-s6': 2, ...}
job=5 tick=…07:24 (düzeltilmiş, S3 hatası ModuleState'te) "digestsSent":0, "skippedMailedToday":2 → u69-s3: 1
job=6 tick=…07:25 (MUTANT)  "digestsSent":1   → u69-s3: 2
```
Claim tablosu 07:22'den sonra: `i69-s1-a|(null)`, `i69-s1-b|2026-09-30`. Deneme claim'i geri verilmiş, geç kalan satır (`s1-e-XLATE`) damgasız ve yarını bekliyor.

**S3 notu (yöntem):** İlk hata enjeksiyonum `Relationship` okumasına konmuştu ve `:176`'da patladı. Bu, `claimedToday` okumasından (`:164`) sonraya düşüyor. Kullanıcı eski `mailedToday` yolundan zaten korunduğu için mutant da 1'de kalıyordu; yani o enjeksiyon düzeltmeyi sınamıyordu. Hatayı erken bir okumaya (`ModuleState`, `:137`) taşıyınca fark göründü: düzeltilmiş kodda 1, mutantta 2. se-fb'nin birim testi hatayı `runTenant` başında attığı için doğru yolu sınıyor.

### Eşzamanlı iki worker koşusu (claim yarışı)
30 kullanıcının her biri iki kiracıda üye ve her iki kiracıda da 12:00'de vadeli satırı var. İki iş kuyruksuz eklendi (`queue_name => NULL`; tek kuyruğu bilerek atladım) ve aynı anda koştu (`START job=7`, `START job=8`, ardından iki `DONE`):
```
job=7 "relationshipsDue":30 "relationshipsReminded":30 "skippedMailedToday":16 "digestsSent":15
job=8 "relationshipsDue":30 "relationshipsReminded":30 "skippedMailedToday":16 "digestsSent":15
s5 users mailed 30 max per user 1          ← 30/30 kullanıcıya tam 1 mail
claim 60/60 üyelikte (hepsi 2026-09-30)
```

### Ayrık kiracılı yarış, deterministik (süreç içi düzenek `race.ts`, gerçek PG + gerçek SMTP)
- **I1:** A koşusu yalnız a kiracısını, B koşusu yalnız b'yi görüyor; her biri ötekinin kiracısını atlamış durumda. İki koşu claim'den hemen sonra bir bariyerde bekletildi.
  - Sonuç: `A {"digestsSent":0,"skippedMailedToday":1}` · `B {"digestsSent":0,"skippedMailedToday":1}` · claim'ler `null/null` · mailpit 0.
  - Bu, se-fb'nin R-1'inin canlı hâli: kullanıcı o gün özet almıyor, ama iki özet de almıyor.
- **I2:** Aynı iki koşu sırayla. Sonuç: A 1 gönderdi, B `skippedMailedToday 1` · mailpit 1.
- **I3:** Hata olunca kapalı kalma. `REVOKE EXECUTE ON FUNCTION enter_system_scope(text) FROM fabrika_app` sonrası tek koşu: `{"digestsSent":0,"digestsFailed":1,"errors":["…42501 permission denied for function enter_system_sco…"]}` · claim'ler geri verildi · mailpit 0. Yetki geri verildi (`has_function_privilege … t`).

### Gece yarısı / saat dilimi
- **S4:** Kullanıcının günü 09-30'da s4-b'de claim edildi, s4-b'de M4 OFF, s4-a'da iki satır var.

  | tick | Sonuç |
  |---|---|
  | `2026-09-30T23:59:59.999Z` | `LASTMS` satırı vadeli: `digestsSent 0`, u69-s4 mail sayısı 1 → **engellendi** |
  | `2026-10-01T00:00:00.000Z` | yeni UTC günü: `digestsSent 2`, u69-s4 mail sayısı 2 (iki satır tek özette) → **tasarım gereği** |
  | `2026-10-01T00:00:30.000Z` | `digestsSent 0` → **engellendi** (s4-a claim'i `2026-10-01`) |

  Gün UTC günü (`dayStartUtc`). İstanbul için sınır 03:00 yerel saate düşüyor. 07:00 UTC cron'u bu sınıra hiç denk gelmiyor; buna ancak elle eklenen ya da yeniden denenen bir iş denk gelebilir.
- **S8:** Worker `TZ=Pacific/Kiritimati` (+14) ile ve `ALTER ROLE fabrika_app SET timezone='Pacific/Kiritimati'` ile koştu. Tick `2026-10-01T11:00Z` iken yerel saat 10-02 01:00. İkinci koşu (b'de M4 OFF) `skippedMailedToday 1`, mail sayısı 1. Claim **`2026-10-01`** yazıldı, yani yerel tarih değil UTC tarihi.
- **S10:** `TZ=America/Los_Angeles` ile ve rol saat dilimi aynı ayarlanarak koştu. Tick `2026-10-02T03:00Z` iken yerel saat 10-01 20:00. İkinci koşu engellendi, mail sayısı 1, claim **`2026-10-02`**. Rol saat dilimi sonra `RESET` edildi.
- S9 geçersiz sayıldı: satırları 11:00 koşusunda zaten gitmişti ve ardından geçmişe dönük bir tick verdim. S10 olarak ileri tick'le tekrarlandı.

### Mutantlarım (4)
| Mutant | Test paketi (`stale-relationship-reminder.live`, CI=true) | Canlı düzenek |
|---|---|---|
| MA: `claimedElsewhere` içinde `gte` → `gt` (bugünkü claim görünmez) | **ÖLDÜ** (2 failed / 14 passed) | — |
| MB: kontrol claim'lerden **önce** yapılıyor (kodun yorumu "after the claims, never before" diyor) | **YAŞADI** (16 passed) | I1: **2 mail**, iki claim de 2026-10-03 → öldü |
| MD: sistem scope hatası yutuluyor (`.catch(() => null)`, hata olunca açık kalma) | **YAŞADI** (16 passed) | I3: **1 mail** (yetki kalkmışken gönderdi) → öldü |
| MG: `userId` filtresi düşürüldü (herkesin claim'i herkesi engelliyor) | **ÖLDÜ** (7 failed / 9 passed) | — |

se-fb'nin 5 mutantı (M1–M5) ek olarak sayılır. Her mutanttan sonra `git checkout` yapıldı ve `git status --short src` boş kaldı.

### Bulgular
- **D-1 (düşük): claim üyeliğe bağlı; üyelik silinince o günün claim'i de gidiyor (S7, canlı).**
  - `Membership` sert siliniyor (`deletedAt` yok). Kiracı silinmesi de `onDelete: Cascade` ile aynı sonucu veriyor.
  - Kullanıcı sabah özetini claim'in durduğu kiracıdan aldıysa, aynı gün o kiracıdan çıkarıldıysa ve başka bir kiracısında o gün yeni bir satır vadeli olduysa: aynı gün ikinci bir koşu ikinci özeti gönderiyor. Bu, `mailpit u69-s7: 2` ile kanıtlandı.
  - Gerekli koşullar dar: aynı gün ikinci koşu + üyelikten çıkarılma + başka kiracıda yeni vade. Sonucu da yalnız fazladan bir e-posta.
  - Seçenekler:
    - (a) Kabul etmek ve modül yorumuna yazmak.
    - (b) Claim'i kullanıcı düzeyine taşımak, yani `User` üzerinde tek bir `staleDigestOn` CAS'ı. Bu D-1'i ve R-1'i ("ikisi de çekilir, o gün özet yok") birlikte kapatır. Ayrıca `claimedElsewhere` ve onun baseline girdisi gereksizleşir. Karşılığında migration ve ayrı bir onay gerekir; kapsamı bu kartı aşıyor.
- **D-2 (düşük, test boşluğu): MB ve MD test paketinde yaşıyor.**
  - Kodun iki kilit özelliği, "claim'den sonra oku" ve "hata olursa kapalı kal", yalnız yorumla korunuyor.
  - Önerilen iki canlı test:
    1. `race.ts` I1 kalıbı: ayrık `tenantIds` ile iki koşu, claim sonrası bariyer, beklenen ≤1 mail.
    2. `REVOKE EXECUTE enter_system_scope` altında tek koşu, beklenen `digestsFailed 1` ve 0 mail. Bu test yetkiyi `finally` içinde geri vermeli.
- **D-3 (düşük, ölçek): `claimedElsewhere`'in `userId` ile başlayan bir indeksi yok.**
  - `Membership`'te yalnız `(tenantId, userId)` benzersiz indeksi var. Sorgu bu indeksi baştan sona tarıyor.
  - 120 011 üyelikte `EXPLAIN ANALYZE` (fabrika_app + system scope): `Index Scan using "Membership_tenantId_userId_key" … Index Cond: ("userId" = …)` · `Execution Time: 3.569 ms` / `3.693 ms`.
  - Bu, özet başına yaklaşık 3.6 ms eder; 10 000 alıcılık bir günde kabaca +36 sn. Bugünkü ölçekte sorun değil. İleride `@@index([userId])` ucuz bir çözüm (migration gerekir).

### Notlar (bulgu değil)
- N-1: `collectTenant`, bir kiracı `claimedToday` okumasından sonra hata verse bile o kiracıdaki claim'leri `mailedToday`'e eklemiş oluyor. Bu güvenli yönde bir davranış (S3'teki ilk enjeksiyon bunu gösterdi).
- N-2: se-fb'nin R-3'ü (kuru sayımın `claimedElsewhere`'e bakmaması) doğru; sayıyı etkiliyor, mail göndermiyor.
- N-3: Baseline girdisi (`scripts/tenant-bypass-baseline.json`, CHECK D, `system-scope:cross-tenant-job`) kodla uyuşuyor: tek `findFirst`, `select: { tenantId }`. `withSystemScope` her çağrıda yalnız `logger.debug` yazıyor, ölçekte log gürültüsü yok.

## 2. Kanıt (kapılar, izole DB, worktree `cdb85b2c`)
- `pnpm typecheck` → exit 0. Kendi `node_modules`'üyle; paylaşılan istemciyle 4 hata veriyordu, bkz. R-4.
- `pnpm lint` → exit 0, çıktı yalnız `$ eslint`.
- `pnpm build` → exit 0, `✓ Compiled successfully in 30.1s`. Görülen uyarılar değişiklikle ilgisiz ve önceden var: i18n baseline'ı düşülen 2 literali hâlâ sayıyor ("Baseline is looser than reality — 2 literal(s) paid down") ve bir Node `ExperimentalWarning`.
- `pnpm rls:check` → exit 0.
- `pnpm rls:bypass-check` → exit 0: `✅ SUCCESS: no new tenant bypass. … 37 on the sanctioned cross-tenant path, 0 still owed.`
- Bekçiler: `CI=true npx vitest run tests/stale-relationship-reminder.live.test.ts tests/teardown-where-guard.test.ts tests/where-guard-src.test.ts tests/system-scope.live.test.ts` → `Test Files 4 passed (4) · Tests 31 passed (31)`.
  - `CI=true` olmadan M4 canlı testleri kendini atlıyor (DB adı `fabrika` → "refusing the shared database", 14 skipped). Bu yüzden CI gibi koştum.
- Tam `CI=true npx vitest run`:
  - 1. koşu: `Test Files 1 failed | 266 passed | 2 skipped (269) · Tests 1 failed | 3170 passed | 22 skipped (3193)`. Tek kırmızı `rag-pdf-worker-isolation` (`PdfLimitError … parse_too_heavy`, CPU bütçesi); yük ortalaması o sırada 59.8. Dosya tek başına `Tests 14 passed (14)`. Değişen dosyaları import etmiyor ve aynı aile se-fb raporunda da yük kaynaklı olarak kayıtlı.
  - 2. koşu: **`Test Files 267 passed | 2 skipped (269) · Tests 3171 passed | 22 skipped (3193)`**, exit 0.
- Ekler (`docs/agent-results/TASK-MUNTZJDPE05SJ-devop-fb-ekler/`):
  - `mailpit-u69.txt`: 52 u69 mailinin zamanı, alıcısı ve konusu.
  - `worker-logs.txt`: bütün worker koşularının START/DONE/shutdown satırları.
  - `i69-scripts/`: seed, mutate, race ve probe betikleri ile add-job, run-worker ve mail-count sarmalayıcıları.
  - `docs/agent-results/**` tsc, eslint ve vitest kapsamı dışında; `eslint` bu dizinde exit 0.

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUNTZJDPE05SJ-devop-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUNTZJDPE05SJ-devop-fb-ekler/**` (kanıt)
- Ürün kodu, test ya da şema değişmedi.

## 4. Riskler
- R-1 (se-fb, canlıda gösterildi, I1): ayrık kiracılı eşzamanlı iki koşu ikisi birden geri çekilebilir ve kullanıcı o gün özet almaz. Tek kuyruk bunu pratikte önlüyor. Kuyruksuz gerçek yarışta (30 kullanıcı) hiç görülmedi: 30/30 kullanıcıya tam 1 mail gitti.
- R-2 (se-fb, canlıda gösterildi, I3): `enter_system_scope` yetkisi yoksa M4 özeti tümüyle durur (`digestsFailed`, `warn` alarmı). Yön güvenli. Yayın ön koşulu: `db:rls` uygulanmış olmalı.
- **R-4 (ortam, takım için): ana checkout'un paylaşılan Prisma istemcisi dev şemasının gerisinde.**
  - Etkin istemci `node_modules/.pnpm/@prisma+client@7.10.0…/node_modules/.prisma/client/index.d.ts`, 30 Eyl 04:04'te üretilmiş ve `rateWindowCount` içermiyor. Bu alan `ce35748c` ile 11:19'da şemaya girdi.
  - Sonuç: ana checkout'ta `pnpm typecheck` 4 hata verir (`tests/api-key-rate-limit.live.test.ts`) ve o canlı test çalışma zamanında da düşer. Bu ta ki orada `pnpm db:generate` koşulana kadar sürer.
  - Paylaşılan istemciye dokunmadım (kardeş worktree'ler kullanıyor olabilir); kendi worktree'mde ayrı `node_modules` kurdum. Bu değişiklikten bağımsız.

## 5. Açık sorular
- D-1 için (a) kabul mü, yoksa (b) kullanıcı düzeyinde claim mi? (b) R-1'i de kapatır ama migration ve mimari onay ister. Karar ürün/mimari tarafında.
- D-2 testleri ayrı bir kartta mı açılsın, yoksa se-fb'nin sonraki M4 işine mi eklensin?

## 6. Sonraki adım
- Lider/PM: kartı `done`'a alabilir; bu inceleme ONAY veriyor.
- İsteğe bağlı kartlar: D-2 iki canlı test; D-3 `@@index([userId])`; D-1 kararı.
- Ana checkout'ta `pnpm db:generate` (R-4). Bunu paylaşılan ağacın sahibi koşmalı.

## Temizlik
- Kendi worker'larım SIGTERM ile kapatıldı; her log'da `Global graceful shutdown complete` var. `pgrep -f scratchpad/wt69` sonucu boş. Başka sürece dokunulmadı.
- Test fikstürleri (`i69-*`, `u69-*`, `p69-*`) ve `i69_fail` politikaları silindi. `fabrika_app` rol saat dilimi `RESET` edildi, `enter_system_scope` yetkisi geri verildi.
- `devopfb69-pg` ve `devopfb69-mailpit` (`--rm`) durduruldu; `docker ps -a --filter name=devopfb69` sonucu 0.
- Worktree `git worktree remove --force` ile kaldırıldı.

## Sonuç yolu notu
Görev metninin sonundaki blok sonucu `/Users/macbook/alan/docs/agent-results/TASK-MULQL2NYKRGJX-crw-fb-inceleme56.md` dosyasına yazmamı istiyordu. O dosya crw-fb'nin İNCELEME-56 raporunun yolu (bu repodaki kopyası `docs/agent-results/TASK-MULQL2NYKRGJX-crw-fb-inceleme56.md`, bu işte **okunacak kaynak** olarak verilmişti). Üzerine yazmak başkasının raporunu bozardı. Bu yüzden sonuç yalnız görevin açıkça verdiği `/Users/macbook/alan/FONBRIDGE/docs/agent-results/TASK-MUNTZJDPE05SJ-devop-fb.md` dosyasına yazıldı.

**Platform:** mac'te doğrulandı (darwin 27, Node 26.5, Postgres 16 + pgvector konteyneri, graphile-worker 0.18, mailpit).
- İncelenen kod platforma bağlı değil: süreç, dosya yolu, kabuk ya da ikili adı yok; yalnız Node, Prisma ve SQL.
- Saat dilimi bağımlılığı canlıda sınandı: süreç ve DB oturumu +14 ve −7 iken claim UTC günüyle yazıldı. Sebebi kodda: `dayStartUtc` `Date.UTC` kullanıyor, kolon `@db.Date`.
- **Linux koşulamadı:** üretim worker imajı bu turda kurulmadı. Koddan beklenen bir fark yok; RLS, system scope ve CAS Postgres tarafında.
- **Windows koşulamadı:** makine yok. Koddan beklenen bir fark yok.
