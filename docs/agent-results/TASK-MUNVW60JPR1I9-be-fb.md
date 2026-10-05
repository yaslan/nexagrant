# TASK-MUNVW60JPR1I9 — M4 60-gün özeti: kullanıcı düzeyinde claim, MB/MD testleri, userId indeksi (be-fb)

**Durum:** TAMAM

Kaynak: İNCELEME-69'un üç bulgusu (devop-fb, TASK-MUNTZJDPE05SJ §D-1/D-2/D-3).
- D-1: Özetin günlük claim'i üyelik satırında duruyordu. Üyelik silinince claim de gidiyor ve aynı gün ikinci özet gidebiliyordu.
- D-2: MB ve MD mutantları test paketinde yaşıyordu.
- D-3: Claim sorgusu için `userId` ile başlayan bir indeks yoktu.

Çalışma ortamı:
- Dal `be-fb/munvw6-m4-claim`, dev'den açıldı ve kendi worktree'mde (scratchpad) çalışıldı.
- İzole Postgres `befb-vw-pg` (pgvector/pg16, :55796) ve mailpit `befb-vw-mailpit` (SMTP :11196, API :18096) kullanıldı.
- Worker gerçek graphile-worker 0.18'di (`scripts/jobs-worker.ts`). Uygulama `fabrika_app` (NOBYPASSRLS) ile, iş kuyruğu `fabrika` ile bağlandı. Ayarlar `JOBS_CRON_ENABLED=false` ve SMTP→mailpit.
- **Paylaşılan fabrika DB'sine (:5433) hiç yazılmadı.**
- DB, CI sırasıyla kuruldu: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 → `db:rls` → `db:seed`.

## 1. Ne yapıldı

### D-1 — önce ölçtüm, sonra claim'i kullanıcıya taşıdım
**Ölçüm, mevcut kodla (dev `2e8c48ca`), gerçek worker ve mailpit ile.** Her senaryoda bir kullanıcı iki kiracıya üyeydi (pro, M4 ON). b kiracısındaki satır 07:00'de, a kiracısındaki satır 07:20'de vadeliydi. 07:00 koşusu tek özet gönderdi ve claim'i b üyeliğine yazdı. İki koşu arasında aşağıdaki değişiklik yapıldı, sonra 07:22 koşusu çalıştı:

| Senaryo | Koşular arası | Mevcut kod: aynı gün mail | Düzeltilmiş kod: aynı gün mail |
|---|---|---|---|
| s0 | yok (kontrol) | 1 | 1 |
| s7 | kullanıcı b'den çıkarıldı (`Membership` sert silme) | **2** | **1** |
| s7t | b kiracısı silindi (`Tenant` delete → cascade) | **2** | **1** |

Sonuç: D-1 gerçek. İncelemenin S7'sine ek olarak kiracı silme yolunda da aynı hata çıktı. Etki yalnız fazladan bir e-posta. Ancak ikinci koşu uç bir durum değil: `maxAttempts: 5` ile başarısız bir işin aynı gün yeniden denenmesi bunu tetikler, elle eklenen bir iş de öyle. Bu yüzden "kabul" seçeneği yerine düzeltmeyi seçtim.

**Düzeltme (`src/lib/relationships/stale-reminder.ts`):**
- Claim artık `User.staleDigestOn` (DATE) üzerinde tek bir atomik CAS. İfade şöyle:
  ```sql
  UPDATE "User" u SET "staleDigestOn" = $today::date
    FROM (SELECT id, "staleDigestOn" AS prev FROM "User" WHERE id = $userId FOR UPDATE) o
   WHERE u.id = o.id AND (o.prev IS NULL OR o.prev < $today::date)
  RETURNING o.prev::text AS previous
  ```
  - Okuma ile yazma arasında boşluk yok. Aynı kullanıcı için yarışan koşulardan tam olarak biri kazanır, hangi kiracılara bakmış olurlarsa olsunlar.
  - `FOR UPDATE`'in gerekli olduğu mutantla kanıtlandı (N6, aşağıda).
  - Gün `YYYY-MM-DD` metni olarak bağlanıyor, `Date` olarak değil. Böylece DB oturumunun saat dilimi günü kaydıramaz.
  - Raw SQL kullanmamın nedeni: Prisma'nın `update`'i `User.updatedAt`'i de oynatırdı. O alan GDPR dışa aktarımında (`src/actions/user/export-data.ts:76`) veri sahibine "hesabın son değişikliği" olarak gidiyor.
- Kaldırılanlar:
  - `claimedElsewhere` ve onun `withSystemScope('cross-tenant-job')` çağrısı. Sistem scope'tan çıkış sayısı 37'den 36'ya indi.
  - `scripts/tenant-bypass-baseline.json`'daki girdisi (`--prune`).
  - `tests/where-guard-src.test.ts`'teki iki eski KNOWN girdisi.
- Aynı gün daha önce claim edilmiş kullanıcılar artık kiracı kiracı değil, toplama adımından sonra tek bir sorguyla okunuyor: `claimedToday`, `prisma.user.findMany`, sayfalı. Bu okuma yalnız sayım ve kuru koşu için var; kararı claim veriyor. Yan etki: devop'un N-2/R-3 notu da kapandı. Kuru sayım artık başka kiracıdaki claim'i görüyor.
- **İNCELEME-56 R-1 de kapandı.** Önceden ayrık kiracılara bakan iki eşzamanlı koşunun ikisi birden geri çekilebiliyordu. Şimdi aynı satır için yarışıyorlar: tam olarak biri gönderiyor, hiç göndermeyen durum yok.

### D-3 — idempotent migration ile `Membership(userId)` indeksi
- `prisma/migrations/m4-stale-digest-user-claim.sql` (+ `.down.sql`) eklendi, `apply-order.txt`'e kaydedildi.
- İçeriği:
  - `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staleDigestOn" DATE`
  - `CREATE INDEX IF NOT EXISTS "Membership_userId_idx" ON "Membership" ("userId")`. Ad Prisma'nın `migrate diff` ile ürettiği adla aynı, bu yüzden `db push` ikinci bir indeks açmıyor.
  - **Yayın günü backfill'i:** `User.staleDigestOn` = kullanıcının üyeliklerindeki en geç claim. Böylece eski sürümün sabah gönderdiği özet, yeni sürümle aynı gün ikinci kez gitmez. Güncelleme yalnız NULL'u ya da daha erken bir günü yükseltiyor.
  - `Membership` FORCE RLS altında. Prod'daki migrate rolü tablonun sahibi ama BYPASSRLS değil, bu yüzden bu tabloda **0 satır görür**. Blok bunu şöyle çözüyor: FORCE açıksa o işlem içinde `NO FORCE` yapıyor, sonra `FORCE`'u geri koyuyor. Bir hata olursa ikisi birlikte geri alınıyor.
- `schema.prisma` değişiklikleri:
  - `User.staleDigestOn` eklendi.
  - `Membership` için `@@index([userId])` eklendi.
  - `Membership.staleDigestOn` yerinde bırakıldı ve "artık okunmuyor ya da yazılmıyor" yorumu eklendi. Önceki sürüm bu kolonu kullanıyor; geri dönüş yolu da ona dayanıyor. Kolon yeni sürüm her yerde yayına çıktıktan sonra ayrı bir dosyada düşürülecek.
- Claim artık `Membership`'i kullanıcıya göre okumuyor, ama indeks başka yollar için gerekli. Kullanıcıya göre okuyan yollar: GDPR export (`export-data.ts:82`), hesap silme (`request-deletion.ts:153`) ve kullanıcı silmedeki FK cascade.

### D-2 — MB/MD'yi öldüren testler (`tests/stale-relationship-reminder.live.test.ts`)
İki adımda ilerledim:
1. **Commit `185786a8`, eski tasarımda:** incelemenin önerdiği iki test eklendi.
   - I1 kalıbı: ayrık `tenantIds`, claim'den sonra bariyer, ≤1 mail beklentisi.
   - Kapsam hatası testi: `withSystemScope` bayrakla reddediliyor; beklenen 0 mail, `digestsFailed 1`, claim'ler geri veriliyor.
   - Sonuç: **MB ve MD ikisi de öldü.** Her birinde 1 failed / 17 passed; temiz kodda 18/18.
2. **Commit `3704e43f`, yeni tasarım:**
   - MB/MD'nin mutasyona uğrattığı kod (`claimedElsewhere`) artık yok. Korudukları iki özellik yeni claim üzerinde yeniden sınanıyor:
     - Yarış testi: iki koşu toplamadan sonra bariyerde bekliyor, ikisi de günü boş okuyup claim'e gidiyor. **Tam 1 mail** bekleniyor (R-1 kapandığı için önceki ≤1'den sıkı).
     - Kapalı kalma testi: claim ifadesi reddediliyor; beklenen 0 mail, `digestsFailed 1`, claim tutulmuyor, aynı gün sonraki koşu gönderiyor.
     - Yeni **D-1 regresyon testi:** claim'in geçtiği kiracıdan üye çıkarılıyor ve aynı gün ikinci mail gitmemeli; ertesi sabah tek özet gitmeli.
   - CAS testi yeni tasarıma uyarlandı: rakip koşu claim'i ön okumayla ifade arasında alıyor.

## 2. Kanıt
Ekler `docs/agent-results/TASK-MUNVW60JPR1I9-be-fb-ekler/` altında.

**D-1, gerçek worker + mailpit** (`worker-logs.txt`, `mailpit-u96.txt`):
```
ÖNCE (mevcut kod) 07:22  total 5 {'u96-s0-d1': 1, 'u96-s7-d1': 2, 'u96-s7t-d1': 2}
SONRA (yeni kod)
  07:00  DONE job=8 … "digestsSent":3
  leave u96-s7-fx  membership [{"tenantId":"i96-fx-s7-a","staleDigestOn":null}] user [{"staleDigestOn":"2026-10-04"}]
  dropb u96-s7t-fx membership [{"tenantId":"i96-fx-s7t-a","staleDigestOn":null}] user [{"staleDigestOn":"2026-10-04"}]
  07:22  DONE job=9 … "skippedMailedToday":3,"digestsSent":0,"digestsFailed":0
         total … 'u96-s0-fx': 1, 'u96-s7-fx': 1, 'u96-s7t-fx': 1
  ertesi gün 07:00  DONE job=10 … digestsSent 3 → her biri 2 (geç kalan satır ertesi sabah, tek özetle)
```
Not: araya bir geçersiz koşu girdi (`fix` öneki). zsh `"$a"`'yı kelimelere bölmediği için mutasyon uygulanmadı (`u96-undefined-fix`). Bu koşu sayılmadı ve `fx` öneki ile tekrarlandı.

**Yayın günü geçişi** (eski kod sabah gönderir → migration → yeni kod aynı gün): eski kodla 10-01 07:00'de s0-dep ve s7-dep'e birer mail gitti. Ardından migration uygulandı ve s7-dep claim'in geçtiği kiracıdan çıkarıldı. Yeni kodun 07:22 koşusu:
```
DONE job=4 … "skippedMailedToday":2,"digestsSent":0 → u96-s0-dep 1, u96-s7-dep 1
```

**Migration** (`migration-owner-force.txt`, `migration-noforce-mutant.txt`, `apply-migrations-x2.txt`):
- `User` ve `Membership` tablolarının sahibi geçici olarak `befb_migrate` (NOSUPERUSER, NOBYPASSRLS) yapıldı; prod'daki `fabrika_migrate`'in karşılığı.
  - Kontrol: bu rolün çıplak sayımı `SELECT count(*) … WHERE "staleDigestOn" IS NOT NULL` → `0`. Superuser gözüyle beklenen 6005 kullanıcı.
  - 1. koşu exit 0 → doldurulan 6005. 2. koşu exit 0 (NOTICE: already exists) → 6005.
  - Her kullanıcıda `User.staleDigestOn = max(Membership.staleDigestOn)` uyuşmazlık sayısı 0.
  - Sonrasında `Membership|t|t`: FORCE geri gelmiş. Sahiplik `fabrika`'ya geri verildi, rol silindi.
- **Mutant:** `NO FORCE`/`FORCE` satırları silinmiş migration aynı rolle koştu: exit 0 ama **0 kullanıcı** doldu. Blok gerçekten iş görüyor.
- Tam zincir `bash scripts/apply-migrations.sh` iki kez: `41 files applied` / `41 files applied`, ikisi de exit 0.

**D-3 EXPLAIN ANALYZE**: 120 015 üyelik, `fabrika_app` + system scope, ikinci koşu (`explain-before.txt`, `explain-after.txt`):

| Sorgu | Önce | Sonra |
|---|---|---|
| Q1 eski `claimedElsewhere` (userId + gün) | `Index Scan using "Membership_tenantId_userId_key"`, **2.747 ms** | `Index Scan using "Membership_userId_idx"`, **0.011 ms** |
| Q2 kullanıcının üyelikleri (export/silme) | `Index Only Scan using "Membership_tenantId_userId_key"`, **2.332 ms** | `Index Scan using "Membership_userId_idx"`, **0.009 ms** |
| Q3 `DELETE FROM "User"` (FK cascade, geri alındı) | `Trigger for constraint Membership_userId_fkey: time=5.379` | `time=0.029` |
| Yeni claim (User PK, `LockRows`) | — | `Index Scan using "User_pkey"` ×2, **0.220 ms** (`explain-claim.txt`) |

**Mutantlar:**
- Eski tasarım (MB/MD), commit `185786a8` testleriyle:
  ```
  MB (kontrol claim'lerden önce)  × two runs over disjoint tenants … at most one digest   Tests 1 failed | 17 passed (18)
  MD (scope hatası yutulur)       × a failing cross-tenant claim check sends nothing …     Tests 1 failed | 17 passed (18)
  ```
- Yeni tasarım (`mutants-new.txt`): 6/6 öldü.

  | Mutant | Kırmızı testler | Tests |
  |---|---|---|
  | N1: claim koşulu `prev < today` silindi (MB karşılığı) | CAS testi ve D-2 yarış testi | 2 failed / 17 passed |
  | N2: claim hatası yutulup "claim edildi" sayılıyor (MD karşılığı) | D-2 kapalı kalma testi | 1 failed / 18 |
  | N3: claim hiç yapılmıyor | — | 11 failed / 8 |
  | N4: claim geri verilmiyor | reddedilen gönderim testi | 1 failed / 18 |
  | N5: ön okuma boş | crash + kuru sayım ve CAS testleri | 2 failed / 17 |
  | N6: alt sorgudan `FOR UPDATE` silindi | D-2 yarış testi | 1 failed / 18 |

  Kararlılık (`n6-stability.txt`): N6 5 koşunun 5'inde kırmızı, temiz kod 5 koşunun 5'inde 19/19. Her mutanttan sonra dosya `cp` yedekle geri alındı ve `git status --short src` boş kaldı.

**Kapılar:**
- Dal ucu `3704e43f`:
  - `CI=true npx vitest run tests/stale-relationship-reminder.live.test.ts` → `Tests 19 passed (19)`.
  - Tam `CI=true npx vitest run` → `Test Files 297 passed | 2 skipped (299) · Tests 3705 passed | 41 skipped (3746)`, exit 0.
  - live-skip gate: `44 live files, 390 live tests passed, 33 allowed skip(s)`, exit 0.
- **dev ile birleşik ağaç `2bed3b6c`** (`gates-merged.txt`):
  - `typecheck` 0, `lint` 0, `i18n:check` 0, `rls:check` 0.
  - `rls:bypass-check`: `✅ SUCCESS … 36 on the sanctioned cross-tenant path, 0 still owed`.
  - `build` exit 0.
  - Tam `CI=true npx vitest run` → **`Test Files 297 passed | 2 skipped (299) · Tests 3712 passed | 41 skipped (3753)`**, exit 0. live-skip gate exit 0.
- **dev'e merge sonrası uç `f7a6dcf5`** (`gates-dev-tip.txt`): `typecheck`, `lint`, `i18n:check`, `rls:bypass-check` ve `build` 0. Tam `CI=true npx vitest run` → **`Test Files 297 passed | 2 skipped (299) · Tests 3755 passed | 41 skipped (3796)`**, exit 0. live-skip gate exit 0.
- Ana checkout'un paylaşılan `node_modules` Prisma client'ı `User.staleDigestOn`'u henüz bilmiyor (devop-fb R-4 ile aynı durum). Paylaşılan ağacın sahibi `pnpm db:generate` koşmalı; ben dokunmadım.
- Build uyarısı yalnız `src/instrumentation.ts:18` (`process.exit`, Edge Runtime). Önceden var ve bu değişiklikle ilgisiz.

## 3. Değişen dosyalar
- `src/lib/relationships/stale-reminder.ts`
- `prisma/schema.prisma`
- `prisma/migrations/m4-stale-digest-user-claim.sql` (yeni), `prisma/migrations/m4-stale-digest-user-claim.down.sql` (yeni), `prisma/migrations/apply-order.txt`
- `scripts/tenant-bypass-baseline.json` (bir girdi prune edildi)
- `tests/stale-relationship-reminder.live.test.ts`, `tests/where-guard-src.test.ts`
- `docs/agent-results/TASK-MUNVW60JPR1I9-be-fb.md` ve `…-ekler/`. Seed, mutate, worker, EXPLAIN ve mutant betikleri `…-ekler/scripts/` altında.

## 4. Riskler
- **Yayın sırası:** `docs/RELEASE_CHECKLIST.md` §3 sırasına uyulmalı: `db push` (1) → `apply-migrations.sh` (3) → web ve worker (6).
  - `db push` kolonu ve indeksi Prisma'nın adıyla açar. Migration dosyasındaki `IF NOT EXISTS` bu durumda atlar, backfill ise yine 3. adımda koşar.
  - İzole DB'de migration'dan sonra `prisma db push` → `The database is already in sync with the Prisma schema.` ve `userId` indeksi tek (`db-push-after.txt`).
  - Yeni kod kolon yokken çalışırsa özet işi hata verir (`tenantsFailed` değil, iş hatası) ve graphile yeniden dener. Eski kod yeni kolonu hiç okumadığı için şema önce gelirse sorun çıkmaz.
- **Geri dönüş (`.down.sql`) kayıplı:** yeni sürümün o gün yazdığı claim'ler üyeliklere geri kopyalanmıyor. Geri dönüş günü, sabah yeni sürümden mail almış bir kullanıcıya eski sürüm ikinci bir özet gönderebilir. Bu dosyanın başında yazılı.
- **Kilitler:** `CREATE INDEX` (CONCURRENTLY değil) indeks kurulurken `Membership`'te SHARE kilidi tutar. Backfill bloğunun `ALTER TABLE … NO FORCE`'u ise kısa bir ACCESS EXCLUSIVE kilit alır. Bu sürede üyelik yazmaları (katılma, rol değişikliği) bekler. Tablo küçük: 120 bin satırda bütün dosya bir saniyenin altında bitti.
- **Backfill koşulu:** backfill ya sahip rolle ya da superuser ile çalışmalı. Çünkü `NO FORCE` sahiplik ister, ki migration zaten bunu istiyor. Sahip olmayan, BYPASSRLS da olmayan bir rol `ALTER TABLE`'da hata verir ve dosya ON_ERROR_STOP ile durur. Sessizce 0 satır yazmaz.
- **Ön okuma hatası:** `claimedToday` (`prisma.user.findMany`) hata verirse artık bütün koşu hata verir, hiçbir mail gitmeden. Eskiden bu okuma kiracı `try` bloğunun içindeydi. Yön güvenli (kapalı kalıyor) ve graphile yeniden deniyor.
- **Kısmi özet:** ayrık kiracılı yarışta kazanan koşu yalnız kendi kiracılarını gönderir. Öteki kiracının satırları damgasız kalır ve ertesi sabah gider. Önceki tasarımda da durum aynıydı.

## 5. Açık sorular
- `Membership.staleDigestOn` ne zaman düşürülecek? Önerim: bu sürüm her ortamda yayına çıktıktan sonra ayrı bir kart ve additive olmayan ayrı bir migration dosyası.

## 6. Sonraki adım
- İnceleme (crw-fb/devop-fb): özellikle claim SQL'i ve backfill bloğu. Kanıt betikleri eklerde.
- Yayında `docs/RELEASE_CHECKLIST.md` §3 sırası: `db push` → `apply-migrations.sh` (backfill burada) → web ve worker. §3'teki "36 dosya" sayısı zaten eski; liste şimdi 41 dosya. Bunu checklist'in sahibi güncellemeli.

## Sonuç yolu notu
Görev metninin sonundaki KANIT bloğu, sonucun `/Users/macbook/alan/docs/agent-results/TASK-MUNSBP474W7JQ-se-fb.md` dosyasına yazılmasını istiyordu. Bu dosya adı se-fb'nin TASK-MUNSBP474W7JQ raporunun adı. Raporun bu repodaki kopyası (`docs/agent-results/TASK-MUNSBP474W7JQ-se-fb.md`) bu işte okunacak kaynak olarak verilmişti. Başka bir ajanın rapor adıyla dosya yazmadım. Sonuç yalnız görevin açıkça verdiği yola yazıldı: `/Users/macbook/alan/FONBRIDGE/docs/agent-results/TASK-MUNVW60JPR1I9-be-fb.md`. İNCELEME-69'daki devop-fb de aynı durumda aynı yolu izlemişti.

## Temizlik
- Worker'lar SIGTERM ile kapatıldı; her log'da `graceful shutdown complete` var.
- `bulk-*` yük verisi silindi.
- `befb_migrate` rolü silindi, tablo sahiplikleri `fabrika`'ya döndü.
- `befb-vw-pg` ve `befb-vw-mailpit` konteynerleri ile worktree iş sonunda kaldırıldı (aşağıdaki kanıt satırı).

**Platform:** mac'te doğrulandı (darwin 27, Node 26, Postgres 16 + pgvector konteyneri, graphile-worker 0.18, mailpit).
- Değişen kod platforma bağlı değil: süreç öldürme, dosya yolu, kabuk ya da ikili adı yok; yalnız Node, Prisma ve SQL.
- Saat dilimi: gün `dayStartUtc(now)`'dan `YYYY-MM-DD` metni olarak bağlanıyor ve `::date` ile çevriliyor. Kolon `@db.Date`. Sonuç süreç ya da DB oturumunun saat diliminden bağımsız.
- **Linux koşulamadı:** üretim worker imajı bu turda kurulmadı. Koddan beklenen bir fark yok; CAS, RLS ve FORCE davranışı Postgres tarafında.
- **Windows koşulamadı:** makine yok. Koddan beklenen bir fark yok.
