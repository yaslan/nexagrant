# TASK-MUOGMUUAWFEQX — devop-fb — FB migration güvenliği (İNCELEME-115 Ö-2..Ö-5)

**Kaynak:** `docs/agent-results/TASK-MUOFKM666PDF8-be-fb.md` §2 Ö-2..Ö-5 (ONAY).
**Dal:** `devop-fb/o2-o5-migrations`. Commit'ler: `719d93cf` (iş), `3b0e28cf`, `51bebd2e` (test düzeltmeleri), `02b88c30` (ekler). Dev'e merge commit'i `bbababe7` (`--no-ff`). **Push yapılmadı.**
**Ortam:** izole `devopfb-o25-pg` (`pgvector/pgvector:pg16`), `127.0.0.1:55225`. `:5433`'e ve `.env`'e dokunulmadı. Her koşuda `DATABASE_URL` maskeli olarak basıldı. Sahip rolü `fabrika_migrate`: `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, DB'nin ve `public` şemasının sahibi. Tabloları kendisi `prisma db push` ile kurdu (be-fb ekler/01-02 kurgusu, `ekler/o25-base.sh`).
**Not (be-fb Ö-1):** `apply-migrations.sh`'a TASK-MUOGMQK3JAH4Y ile be-fb de dokunacak. Bu iş önce dev'e alındı; be-fb bunun üstüne kurabilir.

## 1. Ne yapıldı

| Madde | Değişiklik |
|---|---|
| **Ö-2** | `scripts/apply-migrations.sh --down <ad>.down.sql` (ya da `<klasör>/down.sql`). İleri dosyalardaki ön-kontrollerin aynısı (yetki, politikasız FORCE tablo, kalıcı varsayılan) ve son-kontroller koşar. Dosya `SET app.system_scope='on'` + `SET fabrika.migration_down='on'` oturumuyla koşulur. Argüman yalnız `prisma/migrations` altındaki bir down dosyası olabilir (`..` ve mutlak yol reddedilir). Bilinmeyen argüman artık exit 1 verir; eskiden yok sayılıyor ve zincir koşuyordu. **38 down dosyasının hepsi** (34 düz + 4 klasörlü) başta `\set ON_ERROR_STOP on` + `\ir …/migration-down-guard.sql` taşıyor. Yeni `prisma/migration-down-guard.sql` iki ayar da `on` değilse `RAISE EXCEPTION` ile durur. Yani düz psql ile ya da eski el komutuyla (`-c "SET app.system_scope='on'"`) koşan bir down dosyası tek satır çalıştırmadan exit 3 verir. `RELEASE_CHECKLIST` §3.1 (down satırı) ve **§3.2** yeni komutla güncellendi, `scripts/README.md` ve `add-m6-evaluator-lens.down.sql`'deki "Apply: psql …" satırı da. |
| **Ö-3** | Canlı test `a file that stores a default for app.system_scope fails the run after the files` (M11 biçiminde). Betik ve `prisma/migrations` geçici bir dizine kopyalanır, repo düzenlenmez. Listedeki son dosyaya `ALTER DATABASE … SET app.system_scope` eklenir. Beklenen: exit 1, bütün dosyalar koşmuş, çıktıda `a file stored a default`. |
| **Ö-4** | Son-kontrol (`postflight`): rol muaf değilse (süper kullanıcı ya da BYPASSRLS değilse) ve `n_live_tup > 0` olan, `system_scope` politikası olmayan bir FORCE tablo varsa exit 1. Mesaj şöyle: `…hold rows but have no system_scope policy… Do not start the app, and do not simply run this script again… Restore the backup taken before this run, run pnpm db:rls, then this script.` "Yeniden koşma" uyarısı ölçüme dayanıyor (§2.3). Canlı test eklendi. |
| **Ö-5** | `migration-owner-grant.sql`: `\if :{?owner}` yoksa `no migration owner given: psql "$SUPERUSER_URL" -v owner=<migration-owner> -f prisma/migration-owner-grant.sql` mesajıyla exit 3 verir. Test grant testinin içinde. |
| statik | `tests/migration-down-guard.test.ts`: her down dosyasında ilk iki kod satırı `\set ON_ERROR_STOP on` + `\ir` olmalı ve `\ir` gerçekten koruma dosyasına çözülmeli (39 test). Yeni bir down dosyası korumasız eklenemez. |

## 2. Kanıt

### 2.1 Ö-2 ÖNCE: kalıcı veri kaybı yeniden üretildi (`ekler/01-o2-once.txt`, kod `d6d12b8d`)
Fikstür (`ekler/o2-legacy-feedback.sql`): 3 kiracı, Feedback sentry kolonlu eski şeklinde. Zincir sahip rolüyle koştu, 07 dört satırı arşivledi (`3|4` = legacy 3, arşivde 4 satır).
```
$ psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f prisma/migrations/rename-feedback-alert-columns.down.sql   # SET YOK
DO DO DO UPDATE 0      exit=0
 geri_gelen_eventid | geri_gelen_status | arsiv_satiri
                  0 |                 0 |            0          ← hiçbir satır geri gelmedi, arşiv SİLİNDİ
karşılaştırma, SET ile:  UPDATE 1  exit=0  →  2 | 3 | 0
```

### 2.2 Ö-2 SONRA (`ekler/02-o2-o5-sonra.txt`, `ekler/03-down-zinciri-ters.txt`)
Hepsi aynı `fb_o2` kopyasından alındı:
```
(a) düz psql, SET yok                 → ERROR: rollback files run with scripts/apply-migrations.sh --down <file>, not plain psql   exit=3
(a2) düz psql, ON_ERROR_STOP de yok    → aynı hata, exit=3 (dosyanın kendi \set'i)
(b) eski §3.1 komutu (-c SET … -f)     → aynı hata, exit=3
    (a)/(b) sonrası: legacy_satir|arsivdeki_satir|eski_kolon = 3|4|0   ← hiçbir şey değişmedi, arşiv yerinde
(c) scripts/apply-migrations.sh --down rename-feedback-alert-columns.down.sql (sahip)
    → apply-migrations: rolled back with … as fabrika_migrate   exit=0   →  2 | 3 | 0   (veri geri geldi, arşiv tüketildi)
(c-ref) aynı komut süper kullanıcıyla  → 2 | 3 | 0   (sahiple aynı)
(c2) ikinci kez --down                 → exit=0 (idempotent)
(d) --down <ileri dosya> / ../../… / argümansız / --dwon  → exit=1, açık mesaj
Ters sırayla 38 down dosyası, sahip rolüyle --down: 38/38 exit 0; ardından ileri zincir 41 files, exit 0
Klasörlü down.sql (\ir ../../) düz psql ile → exit 3, StripeEventLog yerinde (t)
```
"Arşiv silinmiyor" şu anlama geliyor: SET'siz ya da betiksiz koşuda arşiv artık silinmiyor, çünkü dosya hiç koşmuyor. Betikle koşuda dosya arşivi tasarım gereği yalnız geri yükledikten sonra siliyor (başlık yorumu: "the archive row is removed once it has been replayed").

### 2.3 Ö-4 önce/sonra (`ekler/04-o4-once-sonra.txt`, fikstür `o4-gap-seed.sql`)
Durum: `db push` yapılmış, `db:rls` hiç koşmamış, Feedback'te 2 satır var (sentry şekli).
```
ÖNCE (dev betiği):  41 files applied as fabrika_migrate  exit=0   gf1:sentry-g1/sent gf2:sentry-g2/failed   ← backfill 0 satır, sessiz
SONRA:              these FORCE RLS tables hold rows but have no system_scope policy … Feedback (~2 rows) … exit=1
"yeniden koşmak yetmez" ölçümü (ÖNCE DB'si, db:rls + zincir): gf1:NULL/legacy gf2:NULL/legacy | arsiv=0
   → olay kimlikleri arşivlenmeden silindi. Mesajdaki "yedekten dön" talimatı bu yüzden.
normal akış (boş DB → zincir → db:rls → zincir, sahip): exit=0, exit=0
```

### 2.4 Canlı test + mutantlar (`ekler/05-live-test.txt`, `ekler/06-mutantlar.txt`, üretici `ekler/mut2.py`)
`migration-owner-chain.live.test.ts` **9/9** oldu (6 eski + Ö-3, Ö-4, Ö-2). Ö-5 grant testinin içinde. Test DB'si ve rolü sonradan 0.
| Mutant | Sonuç | Yakalayan |
|---|---|---|
| **M6** son-kontrol saklı varsayılan silindi (be-fb mut.py ile birebir) | **KILLED** (önceden YAŞADI) | Ö-3 testi |
| N1 Ö-4 kontrolü kapalı | KILLED | Ö-4 testi |
| N2 `--down` SET app.system_scope açmıyor | KILLED | Ö-2 testi |
| N3 bir down dosyasından `\ir` koruması silindi | KILLED | statik test + Ö-2 testi |
| N4 `--down` ileri dosyayı kabul ediyor | KILLED | Ö-2 testi |
| N5 Ö-5 `\if` koruması etkisiz | KILLED | grant testi. İlk ölçümde 7 kırmızıydı: Ö-5 bloğu grant'tan önce olduğu için hata zincirleniyordu. Blok testin sonuna taşındı, yeniden ölçümde 1 kırmızı. |
Her mutanttan sonra `git checkout -- scripts prisma` → `git diff --quiet` exit=0.

### 2.5 I-1 regresyonu (`ekler/08-i1-regresyon.txt`, HEAD `3b0e28cf`, taze `fb_i1`)
```
fabrika_migrate|f|f|fabrika_migrate|fabrika_migrate     (rol|super|bypass|db sahibi|şema sahibi)
koşu 1: exit=0 '==>' satırı=41  apply-migrations: 41 files applied as fabrika_migrate
db:rls: Policies in public: 28 → 112
koşu 2: exit=0 '==>' satırı=41  apply-migrations: 41 files applied as fabrika_migrate
doğrulama sorgusu → fabrika_migrate|f|f|t|0|0   (beklenen <sahip>|f|f|t|0|0)
```

### 2.6 Tam kapılar (`ekler/07-kapilar.txt` + logları; CI sırası, `CI=true`, taze DB, HEAD `51bebd2e`)
```
db:generate 0 · db push 0 · db:rls-role 0 · apply-migrations #1 0 (41 files as fabrika) · #2 0 · db:rls 0 (28 → 112) · db:seed 0
lint 0 · typecheck 0
vitest 0  Test Files 303 passed | 2 skipped (305)  Tests 4073 passed | 51 skipped (4124)
   ✓ migration-owner-chain.live.test.ts (9 tests) · ✓ migration-down-guard.test.ts (39 tests)
check-live-skips 0 · rls:check 0 · rls:bypass-check 0 · rls:verify 0 (47 tablo, fabrika_app ile ölçüldü) · build 0
```
İlk kapı koşusu (`ekler/07a-kapilar-ilk-kirmizi.txt`, HEAD `3b0e28cf`) typecheck ve build'de kırmızıydı. Sebep benim yeni testimdeydi: `tests/migration-down-guard.test.ts(40,43) TS2532`. `51bebd2e` ile düzeltildi ve bütün kapılar taze DB'de baştan koşuldu. Merge ağacı `bbababe7`, kapıların koştuğu ağaçla aynı (`git diff --stat bbababe7 devop-fb/o2-o5-migrations` boş; aradaki tek commit `02b88c30` yalnız ekleri ekliyor).

### 2.7 Entegrasyon (RELEASE_CHECKLIST §9)
`git status --short --untracked-files=no` ≥22 sn arayla iki kez alındı, ikisi de boştu. `dev` = `d6d12b8d` ve hareket etmedi (eşzamanlı yazıcı yok). `git merge-tree --write-tree` exit 0. `git merge --no-ff` → `bbababe7`. `git merge-base --is-ancestor 51bebd2e dev` doğru. Merge sonrası ana checkout'ta tracked değişiklik 0.

## 3. Değişen dosyalar
- `scripts/apply-migrations.sh`: `--down`, argüman doğrulama, `postflight` (saklı varsayılan + Ö-4).
- `prisma/migration-down-guard.sql` (yeni); `prisma/migrations/*.down.sql` (34) ve `*/down.sql` (4): 3 satırlık koruma başlığı.
- `prisma/migration-owner-grant.sql`: `\if :{?owner}`.
- `tests/migration-owner-chain.live.test.ts` (+3 test, Ö-5 kontrolü); `tests/migration-down-guard.test.ts` (yeni).
- `docs/RELEASE_CHECKLIST.md` §3.1 (ii) ve down satırı, §3.2; `scripts/README.md`.
- `docs/agent-results/TASK-MUOGMUUAWFEQX-devop-fb-ekler/` ve bu rapor.

## 4. Riskler
- **Davranış değişikliği:** down dosyaları artık düz psql ile koşmuyor. Süper kullanıcı için de böyle, çünkü tek yol betik. Acil bir durumda korumayı bilerek aşmak `-c "SET app.system_scope='on'" -c "SET fabrika.migration_down='on'"` ile mümkün. Bu belgelenmedi, kasıtlı.
- Bilinmeyen argüman artık exit 1 veriyor (eskiden yok sayılıyordu). CI argümansız çağırıyor, etkilenmiyor (kapılar 0).
- Ö-4 `n_live_tup` bir istatistik. Yazmadan hemen sonra birkaç yüz ms gecikebiliyor, çökme sonrası da sıfırlanıyor. Bu yalnız **kaçırma** (false negative) üretir, boş tabloyu asla işaretlemez. Asıl savunma yine akış: canlıda ilk kurulum boş DB ile yapılır ve `db:rls` her yayında koşar.
- Ö-4 süper kullanıcı ve BYPASSRLS için atlanıyor, çünkü onların backfill'leri satırları görür.
- Ö-1 (fabrika_app'in düz `SET app.system_scope`'u) bu kartın kapsamı dışında. Koruma dosyası da aynı ayara dayanıyor. Ö-1 politikayı değiştirirse (be-fb, TASK-MUOGMQK3JAH4Y) `--down`'daki SET satırı ileri dosyalardakiyle birlikte değişmeli. İkisi aynı yerde duruyor.

## 5. Açık sorular
- `rename-feedback-alert-columns.down.sql` arşivi, geri yüklediği satır sayısına bakmadan siliyor. Betik yolu bunu artık güvenli kılıyor, ama dosyanın kendisi de "UPDATE sayısı < arşiv satırı ise silme" diye sertleştirilebilir. Arşivdeki bir Feedback satırı sonradan silinmişse bu kontrol meşru bir geri dönüşü de durdurur, o yüzden yapmadım. Karar migration sahibinin.

## 6. Sonraki adım
- be-fb Ö-1'i (TASK-MUOGMQK3JAH4Y) `bbababe7` üstüne kurabilir.
- Push kartı TASK-MUMACETT8NSI4 (1 Ekim) bu merge'ü de taşıyacak.

## Temizlik (`ekler/09-temizlik.txt`)
`docker rm -f devopfb-o25-pg` exit=0; kalan konteyner 0; `:55225` kapalı. Worktree kaldırıldı (kalan 0), kendi sürecim 0, kapı logları silindi. Dal `devop-fb/o2-o5-migrations` duruyor. Eklerdeki fikstür parolaları (silinmiş konteynerin atılabilir parolaları) `***` ile maskelendi, kalan eşleşme 0. Bu yüzden `o25-base.sh` ve `gates.sh` parolalar yeniden yazılmadan koşmaz.

**Platform:** mac'te doğrulandı (darwin 27, arm64, Homebrew psql 16, `pgvector/pgvector:pg16` konteyneri, `/usr/bin/env bash` = GNU bash 3.2.57). Betiğe eklenen her şey (`case`, `${var#…}`, fonksiyon) bash 3.2'de de var. Linux CI'daki bash 5 ve psql 16 aynı yolu koşar. Koruma dosyası psql meta-komutları kullanıyor (`\set`, `\ir`, `\if`, psql ≥10). Windows'ta koşulamadı: betik bash ve psql istiyor, repo Windows'ta WSL/Git Bash dışında migration koşmuyor. `\ir` göreli yolu psql'in kendisi çözdüğü için Git Bash altında da aynı olmalı. Bunu koddan söylüyorum, ölçmedim.
