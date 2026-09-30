# TASK-MUOG51GJ3PUOG — FB go-live ön koşulu R-1, hazırlık aşaması (devop-fb)

Sprint FB-GAP-1. Kaynak: `docs/agent-results/TASK-MUOEY2GBFHY7U-crw2-fb.md` §Riskler R-1. Patron 30.09: canlı DB yok; kontrol hazırlandı, **canlı DB kurulunca koşma aşaması AÇIK**.

## 1. Ne yapıldı

- **`scripts/golive/r1-topicmatch-check.sql`** (yeni). Tek bir `BEGIN READ ONLY … ROLLBACK` işleminde koşar. Bağlamı basar (rol, PG sürümü, `read_only=on`, tablo/anahtar/kolon var mı, RLS görünürlüğü). Ardından görevdeki iki sorguyu koşar ve son satırda tek bir karar verir: `R1_SONUC | TEMIZ / DB_PUSH_ONCESI / ANAHTAR_YOK / NULLS_DISTINCT / DUR_MUKERRER / RLS_KOR`. Beklenen çıktılar başlık yorumunda yazılı. Tablo, anahtar ya da `opportunityId` kolonu yoksa hata vermez, anlaşılır bir sonuç basar (`psql \if`).
- **RLS tuzağı kapatıldı (görev metninde yoktu, ölçüldü).** `TopicMatch` FORCE RLS altında. Canlıda betiği koşacak sahip rolü süper kullanıcı değil (§3.1), bu yüzden kapsam açılmazsa 0 satır görür. Mükerrer varken betik yanlışlıkla "devam" der. Betik bu yüzden işlem içinde `SET LOCAL app.system_scope = 'on'` verir. Bu, `apply-migrations.sh`'in de kullandığı `system_scope` politikasıdır ve yalnız o işlem için açılır. Politika yoksa (eski RLS) ve rol süper değilse sonuç `RLS_KOR` olur, yani sayım güvenilmez.
- **`docs/RELEASE_CHECKLIST.md` §3.1, madde 0a "Go-live ön kontrolü R-1".** 1. adımdan (`db push`) önce gelir. İçinde komut, her `R1_SONUC` değerinin anlamı, "`DUR_MUKERRER` → DUR; temizlik kararı patronun (K1 türetilmiş veri, yeniden hesaplanır)" kuralı, migration'ın o durumda durduğu ve veri silmediği (ölçüm referansıyla) ve SET LOCAL satırının neden çıkarılmaması gerektiği var.
- İzole Postgres `devopfb-r1-pg` (pgvector/pgvector:pg16, 127.0.0.1:55224) ile (a), (b), salt-okur kanıtı ve RLS kanıtı koşuldu. :5433'e dokunulmadı, `.env` değişmedi.
- Dal `devop-fb/r1-golive-check` → commit `d8a7e8a5` → §9'a göre ana checkout'ta `git merge --no-ff` → **`65c7637c`** (dev). Push yok.

## 2. Kanıt

Ham çıktılar: `docs/agent-results/TASK-MUOG51GJ3PUOG-devop-fb-ekler/`. Her dosyanın başında `DATABASE_URL` basılı: `postgresql://fabrika:fabrika@127.0.0.1:55224/fabrika`. Bu, ci.yml'dekiyle aynı atılık test parolası; sır değil.

**Ek: boş DB** (`00-bos-db.txt`): `tablo_var=f` → `R1_SONUC | DB_PUSH_ONCESI`, exit 0.

**(a) Temiz kurulum, CI sırası** (`A1-db-prep.txt`, `A2-check-temiz.txt`). `db:generate → db push → db:rls-role → apply-migrations ×2 → db:rls → db:seed` adımlarının hepsi exit=0 (`41 files applied as fabrika` ×2). Betik çıktısı:
```
 indnullsnotdistinct
 t
--- 2. mükerrer K1 (opportunityId IS NULL) çiftleri (beklenen 0 satır)
 tenantId | topicId | count
----------+---------+-------
mukerrer_cift=0 fazla_satir=0
 R1_SONUC | TEMIZ
```
(İlk denemede `db:seed` exit 1 verdi: taze worktree'de `db:generate` koşulmamıştı, `Cannot find module '.prisma/client/default'`. Kontrolle ilgisiz bir ortam kusuruydu. Konteyner silindi ve zincir sıfırdan `db:generate` ile yeniden koşuldu; A1 o koşunun çıktısıdır.)

**(b) Eski durum** (`B0-eski-durum.sql`, `B1-eski-durum-check.txt`, `B2-migration-durur.txt`). Anahtar elle NULLS DISTINCT olarak yeniden kuruldu (`indnullsnotdistinct = f`) ve `demo-tenant` × `cmuogae0p0019e9xksz8bb8of` için iki K1 satırı eklendi. Betik:
```
 indnullsnotdistinct
 f
  tenantId   |          topicId          | count
 demo-tenant | cmuogae0p0019e9xksz8bb8of |     2
mukerrer_cift=1 fazla_satir=1
 R1_SONUC | DUR_MUKERRER
```
Ardından `scripts/apply-migrations.sh`:
```
--- ÖNCE   toplam 7 | k1 2 | icerik_md5 fe8706e954159e8196842abcba81dbb5 | nnd f
==> [14/41] topicmatch-per-opportunity/migration.sql
psql:…/topicmatch-per-opportunity/migration.sql:201: ERROR:  could not create unique index "TopicMatch_tenantId_topicId_opportunityId_key"
DETAIL:  Key ("tenantId", "topicId", "opportunityId")=(demo-tenant, cmuogae0p0019e9xksz8bb8of, null) is duplicated.
exit=3
--- SONRA  toplam 7 | k1 2 | icerik_md5 fe8706e954159e8196842abcba81dbb5 | nnd f
```
Migration durdu. Satır sayısı, içerik md5'i ve eski anahtar önce ve sonra aynı, yani veri silinmedi. Zincir sonrası betik yine `DUR_MUKERRER` verdi.

**RLS kapsamı** (`B3-rls-kapsam.txt`, süper olmayan `fabrika_app` ile):
- Betiğin kendisi: `mukerrer_cift=1` → `DUR_MUKERRER` (doğru).
- Yalnız `SET LOCAL` satırı çıkarılmış kopya (scratchpad, commit edilmedi): `mukerrer_cift=0` → **`NULLS_DISTINCT`**. Mükerrer varken yanlış "devam" sonucu. SET LOCAL satırı bu yüzden yük taşıyor.
- `system_scope` politikası düşürülünce: `rls_kor=t` → `R1_SONUC | RLS_KOR`. Politika `pnpm db:rls` ile geri kurulunca (`111 → 112`) sonuç yeniden `DUR_MUKERRER`.

**Salt-okur kanıtı** (`C1-salt-okur-kaniti.txt`). Betiğe `DELETE FROM "TopicMatch" WHERE "opportunityId" IS NULL;` eklendi ve betik koşuldu:
```
psql:scripts/golive/r1-topicmatch-check.sql:37: ERROR:  cannot execute DELETE in a read-only transaction
exit=3
```
Satır sayısı önce 7, sonra 7. Satır geri alındı: betiğin sha256'sı önce ve sonra `6c2981fbcc61c502…`, betikte `DELETE` geçen satır sayısı 0. Commit edilen betik bu geri alınmış hâlidir.

**Kapılar** (`D1-kapilar.txt`): `pnpm typecheck` exit=0, `pnpm lint` exit=0. Değişiklik yalnız SQL betiği ve doküman olduğu için vitest ve build koşulmadı; kart da yalnız bu iki kapıyı istiyor.

**Entegrasyon ve temizlik** (`Z-son.txt`):
- Ana checkout'ta `git status --short --untracked-files=no` iki kez alındı (21:46:02 ve 21:46:25, 23 sn arayla). İkisi de boştu ve `dev` reflog'u değişmemişti. Eşzamanlı yazıcı görülmedi.
- `merge-tree` çakışma vermedi. `merge --no-ff` → `65c7637c`. `git diff d8a7e8a5 65c7637c` boş, yani kapıların koşulduğu ağaçla aynı. `merge-base --is-ancestor d8a7e8a5 dev` exit=0.
- Konteyner silindi (`devopfb-r1-pg` sayısı 0, :55224 dinleyen yok), worktree kaldırıldı, birleşmiş dal `-d` ile silindi. Ana checkout'ta tracked değişiklik yok.

## 3. Değişen dosyalar

- `scripts/golive/r1-topicmatch-check.sql` (yeni)
- `docs/RELEASE_CHECKLIST.md` (§3.1 madde 0a, +11 satır)
- `docs/agent-results/TASK-MUOG51GJ3PUOG-devop-fb-ekler/` (ham çıktılar) ve bu rapor

## 4. Riskler

- **Canlı rolü ölçülmedi.** Canlı DB yok. Betik süper kullanıcıyla (`fabrika`) ve süper olmayan, BYPASSRLS'siz rolle (`fabrika_app`) denendi. Canlıdaki sahip rolü tablo sahibi olacak, ama FORCE RLS sahibi de kapsar ve aynı `system_scope` politikası uygulanır. Davranışın `fabrika_app`'teki gibi olması beklenir; bu bir çıkarımdır.
- **`SET LOCAL app.system_scope` her rol için serbest.** Yer tutucu parametre olduğu için ek yetki gerekmez (`fabrika_app` ile ölçüldü). Bu yeni bir güç değil, `enter_system_scope()` zaten aynı kapsamı açıyor. İşlem `ROLLBACK` ile bittiği için ayar kalıcı olmaz.
- Betik çıkış kodu ile karar vermez (her durumda 0). Kararı `R1_SONUC` satırı verir. Bir otomasyona bağlanacaksa `grep -q 'R1_SONUC | DUR_MUKERRER'` gibi bir kontrol gerekir; bunu şimdilik bilerek eklemedim.

## 5. Açık sorular

- `DUR_MUKERRER` çıkarsa temizliği kim, hangi yöntemle yapacak? Karar patronun. K1 türetilmiş veri; mükerrer satırlar silinip K1 yeniden hesaplanabilir, ama silme sorgusunu bu kart yazmadı.

## 6. Sonraki adım (kartın AÇIK kalan aşaması)

Canlı DB kurulduğunda, RELEASE_CHECKLIST §3.1 madde 0a'da, 1. adımdan (`db push`) önce devop-fb sahip rolüyle şu tek komutu koşacak:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/golive/r1-topicmatch-check.sql
```

Canlı DB ilk kurulumda boşsa sonuç `DB_PUSH_ONCESI` olur. Bu durumda aynı komut 1. adımdan sonra ve 3. adımdan önce bir kez daha koşulur.

**Platform beyanı:** Tüm koşular macOS'ta (darwin, Docker `pgvector/pgvector:pg16`, psql istemcisi yerel) yapıldı. Betik saf SQL ve psql meta-komutlarından (`\gset`, `\if`, `\echo`) oluşuyor. psql ≥10 olan her platformda (Linux, Windows, macOS) aynı çalışır; `indnullsnotdistinct` kolonu sunucu tarafında Postgres ≥15 ister. Linux'ta ve Windows'ta koşulamadı, çünkü bu makinede o ortamlar yok. Checklist'teki komut POSIX kabuk sözdizimi (`"$DATABASE_URL"`) kullanıyor; Windows PowerShell'de `$env:DATABASE_URL` gerekir.

Hafıza: RLS kör-nokta tuzağı (FORCE RLS altında salt-okur kontrol betiği için kapsam şart) hafızaya yazıldı.
