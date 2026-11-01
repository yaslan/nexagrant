# TASK-MUODXN8FCT2PW · crw2-fb · İNCELEME-110 (yeniden): İNCELEME-106 Y-1 düzeltmesinin bağımsız doğrulaması

**Karar: ONAY.** 63f6205f (dev 25665e1f) değişikliğinde bloke eden bulgu yok. Her madde bu kartta kendi koşumla ölçüldü. Ölçümler izole bir Postgres'te yapıldı (`crw2fb110-pg`, 127.0.0.1:55110). `:5433`'e hiç bağlanılmadı. Kanıtlar `TASK-MUODXN8FCT2PW-crw2-fb-2-ekler/` klasöründe. İlk rapor (057f978e) analize dayanıyordu ve bu rapor onun yerine geçer. İlk raporun iki hükmü de ölçümle düzeltildi: M3'ün öldürülme şekli ve risk 3'ün mekanizması (§4, §7).

İncelenen: TASK-MUOBQUZJGRYV9 (crw-fb). Fix 63f6205f, dev merge 25665e1f. Değişen dosyalar: `prisma/migrations/m4-stale-reminder-idempotency.sql:73-77`, `docs/RELEASE_CHECKLIST.md` §3.1, `tests/stale-relationship-reminder.live.test.ts` (+1 test).

## 1. Ne yapıldı

| # | İş | Sonuç | Kanıt |
|---|---|---|---|
| 1 | İzole DB, CI sırası: push → rls-role → zincir ×2 → rls → seed | 41/41 ×2, exit 0 | `01-setup.txt`, `logs/chain1.log`, `logs/chain2.log` |
| 2 | db push'suz zincir (38. dosya kolon yokken) | Hatasız koşuyor, eski davranışla birebir aynı | `05-pushless-chain.txt` |
| 3 | 6 senaryo (a–f), gerçek yeni ve eski worker kodu | (a), (c), (d), (e): tespit boş. (b): doğru pozitif. (f): belgedeki istisna | `04-scenarios.txt` |
| 4 | 3 mutant gerçekten koşuldu (+1 ek mutant), her biri geri alındı | M1, M2: KILLED(test). M3: KILLED(migration hatası). Ek M4: testte SURVIVED | `07-mutants.txt`, `logs/live-M*.log` |
| 5 | Live test, düzeltme öncesi ve sonrası | Önce 1 fail / 24 pass. Sonra 25/25 | `06-live-before-after.txt` |
| 6 | §3.1 blokları belgeden birebir çıkarıldı ve sahip rolle koşuldu | Çıktılar belgeyle uyuşuyor | `03-checklist-blocks.txt`, `04-scenarios.txt` (a)(b) |
| 7 | I-1 ve risk 3 ölçüldü, kart önerileri yazıldı | §7 | `08-extra.txt` E4/E5, `11-i1-rls-effect.txt`, `12-risk3-column-drop.txt` |
| 8 | Kapılar: vitest, live-skip, tsc, lint, build | Hepsi exit 0 (vitest 3921/0) | `10-gates.txt` |

## 2. Kanıt (ham çıktıdan alıntı)

### 2.1 İzole kurulum (madde 1). `01-setup.txt`, `02-owner-role.txt`
- `docker run -d --name crw2fb110-pg … -p 127.0.0.1:55110:5432 pgvector/pgvector:pg16`. Worktree `--detach` ile dev `b8cde55e` üzerinde; bu commit 25665e1f'yi içeriyor (`git merge-base --is-ancestor` → `dev-contains-fix`).
- Her koşudan önce URL maskeli basıldı: `DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55110/f`.
- `db push` → `in sync`. `db:rls-role` → `✅ fabrika_app connects as fabrika_app`. Zincir #1 ve #2: `exit=0 ; 41 dosya başlığı; son satır: apply-migrations: 41 files applied`. `db:rls` → `Policies in public: 28 → 112`. `db:seed` → `exit=0 … Seeding completed`. Seed ilk denemede düştü, çünkü taze worktree'de `prisma generate` yapılmamıştı. Generate sonrası exit 0; iki deneme de dosyada.
- Dürüstlük notu: `01-setup.txt`'te `db push` ve `db:rls-role` satırlarının yanındaki `exit=` değeri `tail`'e ait. Bu iki adımın başarısını çıktı satırları gösteriyor. Zincir, seed ve sonraki tüm `exit=` değerleri komutun kendi çıkış kodu.
- Operatör sorguları için `own` rolü kuruldu (`super=false bypassrls=false`, `Membership owner=own force=true`). Bu, üretimdeki süper olmayan sahip rolün benzeri. Zincir süper kullanıcıyla koştu, worker'lar `fabrika_app` ile.

### 2.2 db push'suz zincir (madde 2). `05-pushless-chain.txt`
- **Tamamen boş DB, push yok:** `[1/41] add-m6-evaluator-lens.sql … ERROR: relation "Evaluation" does not exist`, exit=3. Bu bekleniyor: migration'lar taban tabloları kurmuyor.
- **User-claim öncesi üretim durumu:** push yapıldı, sonra `User.staleDigestOn` DROP edildi. Kolon yokken `User.staleDigestOn kolonu var mı: false`. 38. dosya tek başına `ON_ERROR_STOP=1` ile koştu, exit=0:
  `np-u1 Membership=2026-09-30`, `np-u2 Membership=2026-09-25`. Düzeltme öncesi dosya (`63f6205f^`) aynı duruma koşunca da **aynı** sonucu verdi. Yani kolon yokken `to_jsonb(u) ->> 'staleDigestOn'` NULL okuyor, `NOT EXISTS` doğru dönüyor ve eski davranış korunuyor.
- Tam zincirde 38. dosya kolonsuz koştu, sonra 41. dosya kolonu ekleyip kopyaladı: `np-u1 User=2026-09-30 Membership=2026-09-30`. İkinci koşuda değer değişmedi.

### 2.3 Senaryolar (madde 3). `04-scenarios.txt`
UTC bugün D=2026-09-30. `yeni worker` dev `b8cde55e` kodu, `ESKİ worker` `f7a6dcf5^` (3eb40805) kodu. İkisi de gerçek `sendStaleRelationshipReminders` fonksiyonunu kayıt tutan bir mailer'la çağırıyor (`runner.ts`). Tespit sütunu, belgedeki blok 2'nin (`LC_ALL=C comm -13 …`) sahip rolle koşulmuş çıktısı.

| Senaryo | Olay | Durum | Tespit |
|---|---|---|---|
| (a) yalnız yeni worker | 1 özet; zincir 3. adım + 3 ek koşu | `c2-ua: User=2026-09-30 \| c2-ta=NULL` (4 koşuda da) | 4 koşuda da **boş**; blok 3 sayısı `0` |
| (b1) önce yeni, sonra eski | 2 özet (ikinci özet gerçekten gitti) | `User=D, Membership=D` | `c2-ub1` görünüyor (doğru pozitif) |
| (b2) önce eski, sonra yeni | eski 1 özet, yeni 0 (`legacyClaims`) | `User=NULL \| Membership=D` | `c2-ub2` görünüyor (eski worker 3. adımdan sonra koştu, doğru) |
| (b) sayım | blok 3 | yeniden koşudan önce `1`, sonra `2` | Belgedeki N-1 paragrafıyla uyumlu ("sayı yalnız üst sınırdır") |
| (c) 23:59 | `now=2026-09-29T23:59Z`, damga `2026-09-29 23:59:00` | Zincir PGTZ=UTC, Istanbul ve LA ile koştu: `User=2026-09-29 \| c2-tc=NULL` | |
| (c) 00:01 | `now=2026-09-30T00:01Z`, damga `2026-09-30 00:01:00` | 3 TZ'de de `User=2026-09-30 \| c2-tc=NULL` | **boş** |
| (c) SQL sınırı | User=D-1, damga `D 00:00:00.000` | `c2-tc=2026-09-30` doldu (kapsamıyor, doğru) | |
| (c) SQL sınırı | User=D-1, damga `D-1 23:59:59.999` | `c2-tc=NULL` atlandı (doğru) | |
| (d) User > damga günü | User=D; damgalar td1=D-3, td2=D | 2 koşu sonra `td1=NULL, td2=NULL` | **boş** |
| (d) kontrol | User=D-3 < td2 damgası D | `td2=2026-09-30` doldu | |
| (e) 3 üyelik | tek özet, 2 kiracıda damga, 3 zincir koşusu | `te1=NULL, te2=NULL, te3=NULL` | **boş**; sayı `0` |
| (f) belgedeki dar istisna | uf1'e özet, sonra sahip uf1→uf2, zincir | `c2-uf2: User=2026-09-30 \| c2-tf=2026-09-30` | `c2-uf2` (eski worker yok, belgede anlatılan yanlış pozitif) |

(f) için ek ölçüm (`08-extra.txt` E1/E1b): uf2'nin kendi vadesi gelmiş ilişkisi için yeni worker `digestsSent:0` döndü. Yalnız `User` NULL'a çekilince de 0 kaldı, çünkü `Membership=D` `legacyClaims` ile okunuyor. `Membership` da NULL'a çekilince `digestsSent:1` döndü. Bu Ö-1'in dayanağı (§4).

### 2.4 Mutantlar (madde 4). `07-mutants.txt`
Her mutant için sıra aynıydı: dosya değiştirildi (`git diff` basıldı), yeni bir kullanıcı yeni worker'dan özet aldı, zincir mutantla koştu, blok 2 ile tespit yapıldı, live test koştu, dosya `git checkout` ile geri alındı.

| Mutant | Zincir | Tespit | Live test | Hüküm | Geri alma |
|---|---|---|---|---|---|
| M1 `>=` → `>` | exit 0; `Membership=2026-09-30` | `c2-uM1` (yanlış alarm geri geldi) | `× … İNCELEME-106 Y-1`, `AssertionError: expected 2028-04-02… to be null`, 1 failed / 24 passed | **KILLED (test, assertion)** | `git diff --stat → []` |
| M2 NOT EXISTS kaldırıldı | exit 0; `Membership=2026-09-30` | `c2-uM2` | aynı assertion hatası | **KILLED (test, assertion)** | `[]` |
| M3 `::date` kaldırıldı | **exit 3**, `[38/41]`'de durdu: `ERROR: operator does not exist: text >= date`, `HINT: No operator matches…` | yok (dosya düştü, Membership NULL kaldı) | test düştü, ama assertion'la değil: `error: operator does not exist: text >= date` | **KILLED (migration hatası).** Test bunu kırmızı sayıyor, ama sebep SQL hatası. CI'da `Prepare database` adımı testten önce düşer. | `[]` |
| M4 (ek) `to_jsonb(u)->>…::date` → `u."staleDigestOn"` | exit 0; `Membership=NULL` | boş | **25/25 geçti** | **SURVIVED (test).** Push'suz DB'de düşüyor: `ERROR: column u.staleDigestOn does not exist`, exit=3. Düzeltilmiş dosya aynı DB'de exit=0. | `[]` |

Mutantlardan sonra: `git status --short --untracked-files=no` boş, zincir temiz dosyayla `41 files applied`.

### 2.5 Live test öncesi ve sonrası (madde 5). `06-live-before-after.txt`
- `63f6205f^` ağacında bu test yok (`grep -c 'İNCELEME-106 Y-1'` → `0`). "Önce" koşusu bu yüzden düzeltilmiş test ile düzeltme öncesi migration dosyasının (`git show 63f6205f^:…`) birleşimi.
- ÖNCE: `× re-running the idempotency backfill …`, `AssertionError: expected 2028-04-02T00:00:00.000Z to be null`, `Tests 1 failed | 24 passed (25)`, exit=1.
- SONRA (dev, dosya geri alındı, `git status` boş): `Tests 25 passed (25)`, exit=0. `CI=1` ile koşuldu, yani atlanma da kırmızı sayılırdı.

### 2.6 Belge komutları (madde 6). `03-checklist-blocks.txt`, `04-scenarios.txt`
`extract-blocks.py`, §3.1'deki üç ```bash bloğunu (belge satırları 129-137, 168-169, 179-187) çit girintisi dışında değiştirmeden `ops/block{1,2,3}.sh` dosyalarına çıkardı. Bloklar sahip rol (`own`) ile `bash blockN.sh` olarak koşuldu:
- (a) veritabanı: blok 1 → `0`. Yeni worker ve 4 zincir koşusundan sonra blok 2'nin çıktısı **boş**; belge "boş olmalı" diyor. Blok 3 → `0`. Uyuşuyor.
- (b) veritabanı: blok 2 → `c2-ub1`, `c2-ub2` (eski worker koştu). Blok 3 yeniden koşudan önce `1`, sonra `2`. Belgenin N-1 paragrafıyla ("sayıyı zinciri yeniden koşmadan önce alın … sonra yalnız üst sınırdır") uyuşuyor.
- (f): istisna belgede anlatıldığı gibi göründü.
- `enter_system_scope` iddiası (E3): aynı sorgu kapsam satırı olmadan sahip rolle `0` döndü, kapsamla `10` döndü. Belgedeki uyarı doğru.
- Satır içi `pg_stat_activity` sorgusu sahip rolle exit 0 verdi, satırda `client_addr` ve `backend_start` görünüyor.
- **Koşulamayanlar:** "ertesi UTC günü" kontrolü zamana bağlı, koşulamadı. `graphile_worker.jobs` sorgusu `relation … does not exist` verdi. Bu DB'de gerçek bir worker süreci hiç kalkmadı (runner fonksiyonu doğrudan çağırıyor). Eski worker'ın koştuğu gerçek bir DB'de şema bulunur.

### 2.7 Kapılar (madde 8). `10-gates.txt`
- vitest (1. tam koşu): `4 failed`, hepsi `auditevent-null-system-only.live.test.ts`. **Kök neden benim ölçümümdü:** E4'te zincir sahip rolle koştu, 19. dosya `auditevent-tenant-or-shared.sql`'i yeniden uyguladı, 23'te durdu ve sıkılaştıran 27. dosyaya gelmedi. CI sırasının kalanı (`apply-migrations` + `db:rls`) koşulunca o dosya 5/5 geçti.
- vitest (2. tam koşu): `Test Files 301 passed | 2 skipped (303)`, `Tests 3921 passed | 50 skipped`, exit=0. `check-live-skips` exit=0.
- `pnpm typecheck` exit=0. `pnpm lint` exit=0. `pnpm build` exit=0 (`✓ Compiled successfully`).

## 3. Değişen dosyalar
- Kod değişikliği yok. Mutantlar geçiciydi ve geri alındı (`07-mutants.txt`, her mutantta `git diff --stat → []`).
- Eklenen: `docs/agent-results/TASK-MUODXN8FCT2PW-crw2-fb-2.md` ve `TASK-MUODXN8FCT2PW-crw2-fb-2-ekler/`. Eklerde sabit parola olarak yalnız silinmiş test konteynerinin fikstür parolaları var (`crw2pw`, `ownpw110`). `fabrika_app` parolası eklerde yok (`grep -F` → yok).

## 4. Bulgular (önem sırasıyla; bloke eden yok)

**Ö-1 (öneri, belge). Dar istisnanın ikinci etkisi belgede yok.** Senaryo (f) ve E1/E1b. Aynı gün sahip değişikliği olursa ve zincir yeniden koşarsa, backfill yeni sahibin NULL üyeliğine D yazıyor (`m4-stale-reminder-idempotency.sql:62-77`). Sonra 41. dosya bunu `User.staleDigestOn`'a kopyalıyor (`m4-stale-digest-user-claim.sql:69`). Sonuç: yeni sahibin o gün vadesi gelen kendi özeti ertesi güne kalıyor (`digestsSent:0`; üyelik claim'i NULL'a çekilince 1). Bu bir e-posta kaybı ya da ikinci özet değil, bir günlük gecikme. Düzeltmeden önce de vardı, hem de her kullanıcı için; düzeltme bunu tek bir durumla sınırlıyor. **Öneri:** `docs/RELEASE_CHECKLIST.md` "İstisna (dar)" cümlesine "yeni sahibin o günkü özeti ertesi güne kayar" eklensin. Bloke etmez.

**Ö-2 (öneri, test boşluğu). Push'suz yol hiçbir testte yok.** M4 (`to_jsonb` yerine doğrudan kolon okuma) live testte yaşadı. Yalnız kolonsuz DB'de düşüyor. CI her zaman `db push` ile başladığı için kolon hep var. Belgedeki adım sırası da (1. push, 3. zincir) bu yolu üretimde engelliyor. Yani `to_jsonb` savunma amaçlı ve M4'ün yaşaması bugün bir risk değil. **Öneri:** bir sonraki M4 migration kartı, kolonsuz bir şemada dosyayı `ON_ERROR_STOP` ile koşan küçük bir live test ekleyebilir. Bloke etmez.

**N-1 (not, önceki raporun düzeltmesi). M3 "KILLED(test)" değil, "KILLED(migration hatası)".** `text >= date` Postgres'te `operator does not exist` veriyor. Zincir 38'de exit 3 ile düşüyor. Live test de kırmızı, ama assertion'dan değil SQL hatasından. Sonuç aynı (mutant geçemez), ama `::date`'in anlamını test assertion'ı korumuyor, derleyici koruyor.

**N-2 (not). Y-1 düzeltmesi yalnız süper kullanıcı ya da BYPASSRLS ile koşulan zincirde bir şey yapıyor.** E5: sahip rolle (FORCE RLS altında) 38. dosya `UPDATE 0 / UPDATE 0` döndü ve doldurulması gereken satır NULL kaldı. Süper kullanıcıyla `UPDATE 1` döndü. Üretimde zincir bugün zaten sahip rolle 23'te düşüyor (I-1). I-1 kartı çözülünce 38. dosyanın backfill'inin o rolle de işlevsiz kalacağı hesaba katılmalı. (41. dosya FORCE'u kendi kapatıyor, 38. dosya kapatmıyor.)

## 5. Riskler
- Senaryolar tek bir Postgres 16 örneğinde ve mac'te koşuldu. SQL platformdan bağımsız.
- (f) istisnası ve Ö-1 gecikmesi gerçek, ama yalnız "aynı gün sahip değişikliği + zincirin aynı gün yeniden koşusu" birlikte olduğunda.
- Ölçüm kirliliği (E4) kapılardan önce CI sırasıyla onarıldı ve kanıtı var. İlk tam koşu kaydı da saklandı (`logs/vitest-full.log`).

## 6. Açık sorular
- Yok. Ö-1 belge cümlesinin eklenip eklenmeyeceği yazarın ya da liderin kararı.

## 7. I-1 ve risk 3 (madde 7). Ölçülmüş hüküm ve kart önerileri

**I-1: ayrı kart gerekli. Önceki hüküm yeterli, ama öncelik yükseltilmeli.**
- Ölçüm (`08-extra.txt` E4): `DATABASE_URL=<sahip rol> scripts/apply-migrations.sh` → exit=3, `[23/41] add-agency-invite-code.sql … ERROR: permission denied to set parameter "app.system_scope"` (dosyanın 139. satırındaki `SET app.system_scope = 'on'` fonksiyon ayarı). RELEASE_CHECKLIST §3'ün 3. adımı yazıldığı haliyle üretimde uygulanamıyor.
- Yan etki (`11-i1-rls-effect.txt`): yarıda kalan zincir, 19. dosyanın gevşek `tenant_or_shared` politikasını geri koyuyor, 27. dosyaya ise gelmiyor. Bu arada kiracı oturumu kiracısız AuditEvent satırını okuyabiliyor (live test 4 fail). `pnpm db:rls` (4. adım) durumu tek başına onarıyor (5/5). `pnpm rls:verify` (5. adım) durumu yakalıyor (`tenant_isolation politikası yok: AuditEvent`, exit 1). Yani bugün operatör 3. adımda durursa pencere açık kalıyor; devam ederse kapanıyor.
- **Önerilen kart:** "İNCELEME-106 I-1: apply-migrations süper olmayan sahip rolle 23/41'de `app.system_scope` SET izninde düşüyor. RELEASE_CHECKLIST §3 adım 3 üretimde uygulanamaz, yarım zincir AuditEvent RLS'ini 4. adıma kadar gevşek bırakır." **Öncelik: P1** (ilk canlı yayını bloke eder; veri kaybı yok). Kapsam: sahip rolle tam zincir exit 0 olmalı, 3. adım başarısız olursa belgede "durma, önce `db:rls`" notu olmalı, 38. dosyanın FORCE RLS altında işlevsiz kalması (N-2) karara bağlanmalı.

**Risk 3 (kolon kaldırma): ayrı kart gerekli. Önceki gerekçe yanlıştı, ölçümle düzeltildi.**
- Önceki raporlar "`Membership.staleDigestOn` düşünce bu `UPDATE` hata verir" diyordu. Ölçüm (`12-risk3-column-drop.txt`) başka bir şey gösterdi. Kolon düşürülüp 38. dosya koşulunca exit=0 veriyor ve `Membership.staleDigestOn var mı: true` oluyor: `m4-stale-reminder-idempotency.sql:52` (`ADD COLUMN IF NOT EXISTS`) kolonu her zincir koşusunda **sessizce geri ekliyor**. 41. dosya tek başına kolonsuz koşunca `ERROR: column "staleDigestOn" does not exist` (`:69`) veriyor, exit=3.
- **Önerilen kart:** "M4: `Membership.staleDigestOn` + `legacyClaims` kaldırma. 38. dosyanın 52. satırı kolonu geri ekler, 41. dosyanın backfill'i kolonu okur; ikisi de aynı yayında kolonsuz koşacak şekilde değiştirilmeli." **Öncelik: P3.** Ön koşul: RELEASE_CHECKLIST'teki üç kaldırma koşulu, yani her ortamda yayından sonraki bir günde `m4-claims.sql` boş dönmeli. DoD: kolonu düşürülmüş bir DB'de zincir ×2 exit 0 ve kolon geri gelmemiş olmalı (`information_schema` kontrolü). `prisma db push` `--accept-data-loss` olmadan geçmeli.

## 8. Sonraki adım
- Lider: ONAY. İstenirse Ö-1 belge cümlesi küçük bir kartla eklenebilir.
- İki kart açılmalı: I-1 (P1) ve risk 3 (P3), metinleri §7'de.

## Temizlik. `13-cleanup.txt`
`docker rm -f crw2fb110-pg` çalıştı. `docker ps -a … | grep -c crw2fb110 → 0`. Worktree'ler (`wt` dev, `wtold` f7a6dcf5^) `git worktree remove --force` ile silindi: `git worktree list | grep -c 6b4bf0a8 → 0`, dizinler `No such file or directory`, `:55110` dinleyen yok. Başka bir konteynere ya da pane'e dokunulmadı. Eklerdeki tüm URL'ler `127.0.0.1:55110`: 78 geçiş, `:5433` sıfır.

## DoD
- [x] İzole DB kurulum log'u: `01-setup.txt`, `02-owner-role.txt`
- [x] Push'lu ve push'suz zincir çıktısı: `01-setup.txt`, `logs/chain*.log`, `05-pushless-chain.txt`
- [x] 4'ten fazla senaryonun ham çıktısı (a–f): `04-scenarios.txt`, `08-extra.txt`
- [x] 3 mutant gerçekten koşuldu (+M4) ve geri alındı: `07-mutants.txt`
- [x] Live test önce kırmızı, sonra yeşil: `06-live-before-after.txt`
- [x] Belge komutları birebir koşuldu: `03-checklist-blocks.txt`, `ops/`, `04-scenarios.txt`; koşulamayan iki madde §2.6'da
- [x] Kapılar 0: `10-gates.txt` (ilk koşudaki 4 hatanın kök nedeni ve onarımı dahil)
- [x] Karar: **ONAY**
- [x] Platform beyanı (aşağıda)

**Platform:** mac'te doğrulandı (darwin 27, arm64; Docker `pgvector/pgvector:pg16` 16.15; libpq psql 18.4; Node 26.5; pnpm 11.25).
- İncelenen kod yalnız SQL (Postgres) ve bir vitest dosyası. Platforma bağlı bir yol yok. Zincirin gün sınırı davranışı `PGTZ=UTC`, `Europe/Istanbul` ve `America/Los_Angeles` ile aynı çıktı (`timestamp without time zone::date` saat diliminden bağımsız).
- Belge komutları POSIX kabuk araçları gerektirir (`psql`, heredoc, `comm`, `wc`, `LC_ALL=C`). Bloklar `bash` ile koşuldu. macOS'ta `wc -l` çıktısının başında boşluk var (`       0`), anlamı değişmiyor.
- **Linux koşulamadı:** bu makinede Linux sunucu yok. Koda göre bir fark beklenmiyor; CI ubuntu'da aynı live testi koşuyor.
- **Windows koşulamadı:** makine yok ve üretim hedefi değil. `comm` ve heredoc cmd'de yok; operatör WSL ya da sunucu kabuğu kullanmalı.
