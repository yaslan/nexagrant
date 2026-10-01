# TASK-MUOG51GJ3PUOG — FB canlı DB kurulumu (Supabase), faz 2 (devop-fb)

**Hüküm: KISMEN — ENGELLİ.** Pgvector, üç rol, `db push` ve `fabrika_app` canlı Supabase'de kuruldu ve doğrulandı. **Migration zinciri (§3.1 adım 3) Supabase'de bu haliyle koşamaz**: Supabase `postgres` rolü süper kullanıcı değil ve `app.system_scope` parametresine SET yetkisi veremiyor. Zincir hiçbir dosya uygulanmadan durdu. Bu yüzden adım 4 (`db:rls`) ve 5 (`rls:verify`) yapılmadı. **Uygulama bu DB'ye BAĞLANMAMALI**: RLS politikası henüz yok.
**Tip:** runtime / altyapı · **Sprint:** FB-GAP-1 · **Platform:** mac (darwin, psql 16.15 istemci) → Supabase PostgreSQL **17.11** (eu-west-1, session pooler 5432). CI 16 kullanıyor; fark aşağıda. Windows/Linux koşulmadı: iş bir istemci makinesinden uzak DB'ye SQL göndermekti, platforma bağlı kod yolu yok. `scripts/apply-migrations.sh` bash + psql ister; Windows'ta WSL/Git Bash gerekir (koddan).
**Patron onayı:** 01.10.2026 (canlı DB = Supabase). Kod değişikliği yok, commit edilen tek şey bu rapor + ekleri. Push yok.

## 1. Ne yapıldı (sırayla)

Bağlantı: `aws-0-eu-west-1.pooler.supabase.com:5432` (session pooler), kullanıcı `<rol>.<ref>`, `sslmode=require`. Şifreler `PGPASSWORD` ile, scratchpad'deki chmod 600 dosyalardan geldi; iş sonunda silindi. Proje ref'i eklerde `<ref>` diye maskeli.

| # | Adım | Sonuç | Kanıt (ekler/) |
|---|---|---|---|
| 1 | Kod: yerel `dev` (`ab7987e7`) ana checkout, salt okundu | Kod değişmedi; ayrı worktree gerekmedi | — |
| 2 | `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions` | vector 0.8.2, şema `extensions`, sahip `supabase_admin` (Supabase'in ayrıcalıklı uzantı yolu). `<=>` çalışıyor | E1 |
| 2b | Şema seçimi ölçüldü | `prisma migrate diff --from-config-datasource --to-schema` (salt introspection) uzantı için **hiçbir** ifade üretmedi; 75 CREATE TABLE, 0 DROP. Uygulama `::vector` / `<=>`'yi şemasız yazıyor (`src/lib/rag.ts`, `src/lib/scoring/*`) → rollere `search_path = public, extensions` verildi | E4 |
| 3 | Roller (postgres ile) | `fabrika_migrate` (şema sahibi), `fabrika_jobs` (graphile_worker), `fabrika_app` (adım 2'de). Hepsi `rolsuper=f`, `rolbypassrls=f`, NOCREATEDB/NOCREATEROLE. Şifreler `secrets.token_urlsafe(32)` | E2, E7 |
| 0a | R-1 ön kontrol (sahip rolüyle, db push öncesi) | `R1_SONUC \| DB_PUSH_ONCESI` → devam. Boş DB'de anlamı: `TopicMatch` yok, sayılacak satır yok | E3 |
| 1 | `pnpm exec prisma db push` (`DATABASE_URL`=fabrika_migrate, `--accept-data-loss` YOK) | `Your database is now in sync … 30.57s`, exit 0. 75 tablo + 202 index, **hepsinin sahibi `fabrika_migrate`** | E4, E5 |
| 0a' | R-1 tekrar (db push sonrası, 3'ten önce) | `R1_SONUC \| NULLS_DISTINCT` → devam (3. adımdaki `topicmatch-per-opportunity` anahtarı çevirir). Mükerrer 0 (boş DB) | E6 |
| 2 | `fabrika_app` = `prisma/rls-app-role.sql` (psql yolu) | Rol kuruldu, 75/75 tabloda yalnız DML, varsayılan yetkiler `fabrika_migrate` için kayıtlı (`r: arwd`, `S: rU`). Pooler'dan giriş + `::vector` OK, `app.tenant_id` boş | E7 |
| 3(i) | `psql -v owner=fabrika_migrate -f prisma/migration-owner-grant.sql` (postgres ile) | **ENGEL:** `ERROR: permission denied for parameter app.system_scope`, exit 3 | E8 |
| 3 | `DATABASE_URL=<fabrika_migrate> scripts/apply-migrations.sh` | **ENGEL (güvenli durdu):** `role "fabrika_migrate" may not create functions with SET app.system_scope … No file was applied.` exit 1. public'te bizim fonksiyonumuz 0 | E9 |
| 4, 5 | `db:rls`, `rls:verify` | **Koşulmadı** — sıra 3'e bağlı (rls.sql migration'ların kurduğu nesnelere dayanıyor). Bu durumda `rls:verify` yalnız "politika yok" der | — |
| S | Supabase erişim kanıtı | anon / authenticated / service_role: 75 tablonun **0**'ında yetki (`has_table_privilege`); public tablolarında PUBLIC/anon/authenticated ACL girdisi 0. `fabrika_jobs` uygulama tablolarını okuyamıyor, `graphile_worker` şemasını kurabiliyor (geri alınan prova) | E10 |

Notlar:
- **`pnpm db:rls-role` ve `pnpm db:rls` yerel olmayan DB'yi bilerek reddediyor** (`scripts/setup-rls-role.ts`, `scripts/apply-rls.ts`: `Refusing to run against a non-local database`). Betikleri değiştirmedim; aynı `.sql` dosyasını dosya başlığındaki psql yoluyla koştum. RELEASE_CHECKLIST §3.1 adım 2/4 canlı için bu yüzden olduğu gibi çalışmaz → düzeltilmeli (açık soru 3).
- **Supabase'de `postgres` süper kullanıcı değil**, sahibin tablolarına GRANT veremiyor (`no privileges were granted`) ve `ALTER DEFAULT PRIVILEGES FOR ROLE fabrika_migrate` diyemiyor (`permission denied to change default privileges`, geri alınan provada ölçüldü). Çözüm: aynı işlem içinde `GRANT fabrika_migrate TO postgres WITH INHERIT TRUE, SET TRUE` → dosya → `REVOKE fabrika_migrate FROM postgres` → COMMIT. Sonrasında kalan üyelik yalnız PG16'nın CREATEROLE'e otomatik verdiği `admin_option=t, inherit=f, set=f` (grantor supabase_admin) — E7 sonu.
- Yetkiler: `fabrika_migrate`: DB üzerinde CONNECT+CREATE (rls.sql `CREATE SCHEMA fabrika_private` için), public'te USAGE+CREATE, extensions'ta USAGE. `fabrika_jobs`: DB üzerinde CONNECT+CREATE (yalnız kendi `graphile_worker` şeması için). `fabrika_app`: rls-app-role.sql'in verdikleri + extensions USAGE. Supabase şemalarının **içeriğine** dokunulmadı; extensions şemasına yalnız USAGE verildi.

## 2. Rol listesi (şifresiz)

| Rol | Görev | super | bypassrls | Bağlantı (`.env.supabase.local`) |
|---|---|---|---|---|
| `fabrika_migrate` | şema/tablo sahibi; db push, apply-migrations, rls.sql | f | f | `SUPABASE_OWNER_URL` |
| `fabrika_app` | uygulama (web + worker veri) → üretimde `DATABASE_URL` | f | f | `SUPABASE_APP_URL` |
| `fabrika_jobs` | graphile_worker kuyruğu → üretimde `JOBS_DATABASE_URL` (web `enqueue.ts` de bunu kullanır) | f | f | `SUPABASE_JOBS_URL` |

`.env.supabase.local` chmod 600; `git check-ignore -v` → `.gitignore:35:.env*  .env.supabase.local`; `git status --porcelain` boş. Adlar bilerek `DATABASE_URL` değil. `.env`'deki `DATABASE_URL` değişmedi.

## 3. ENGEL ve seçenekler (karar gerekiyor)

**Sorun:** 5 migration dosyası (`add-agency-invite-code.sql`, `add-agency-funnel.sql`, `add-agency-funnel-province.sql`, `agency-invite-no-max-uses.sql`, `fix-agency-invite-rejection-audit.sql`) fonksiyon tanımında `SET app.system_scope = 'on'` taşıyor. PostgreSQL bunu yalnız süper kullanıcıya ya da `SET ON PARAMETER` yetkisi olan role yazdırır. Supabase'de tek süper kullanıcı `supabase_admin` (bize kapalı); `postgres` bu yetkiyi ne kendisi taşıyor ne verebiliyor (ölçüldü, işlem geri alındı: `GRANT SET ON PARAMETER` → `permission denied for parameter`; `CREATE FUNCTION … SET app.system_scope` → `permission denied to set parameter`, oturumda önce `SET` yapılsa da). `supautils.privileged_role_allowed_configs` listesinde `app.*` yok.

1. **(Önerilen) Kod değişikliği:** bu fonksiyonlarda `SET app.system_scope = 'on'` bildirimini gövde içi `set_config('app.system_scope','on',true)` + çıkışta (ve EXCEPTION'da) eski değere geri yükleme ile değiştir; `apply-migrations.sh` ön kontrolü ve `migration-owner-grant.sql` buna göre güncellenir. Güvenlik incelemesi şart (ADR-0009 imzalı kapsam: düz `on` fabrika_app'e bir şey açmıyor, ama sızıntı/geri yükleme ölçülmeli). Kart: be-fb + se-fb/crw inceleme. Supabase'de kalır, şimdiye kadarki kurulum geçerli.
2. Supabase destek talebi: `supabase_admin` ile `GRANT SET ON PARAMETER app.system_scope TO fabrika_migrate`. Kod değişmez; ama sonucu belirsiz, her yeni proje/geri yüklemede tekrar gerekir.
3. Supabase yerine kendi Postgres 16 + pgvector sunucusu (CI ile aynı sürüm). Bu DB'deki kurulum boşa gider; temizlik patrona kalır (DROP bana yasak).

## 4. Riskler (Supabase'e özgü)

- **R-S1 `ensure_rls` olay tetikleyicisi (Supabase hazır kurulum):** `public.rls_auto_enable()` public'te oluşturulan her tabloda `ENABLE ROW LEVEL SECURITY` dener. Bizim tablolarda **sessizce başarısız oldu** (sahip `fabrika_migrate`, tetikleyici `postgres` olarak koşuyor) → RLS açık tablo 0 (E5). Tehlike: biri Supabase SQL Editor'den (postgres olarak) tablo oluşturursa RLS politikasız açılır; `User`, `Topic` gibi RLS'siz tasarlanmış tablolarda uygulama 0 satır görür. Kural: canlıda DDL yalnız `fabrika_migrate` ile.
- **R-S2 PostgREST / Data API:** anon ve authenticated public'te USAGE taşıyor (PUBLIC'ten ve açık grant'tan). Tablolarda yetkileri **yok** (kanıt E10). Ama fonksiyonlarda varsayılan EXECUTE PUBLIC'e gider: migration'lar SECURITY DEFINER fonksiyonların çoğunda `REVOKE … FROM PUBLIC` yapıyor; `lifetime_licence_count`, `system_scope_open`, `system_scope_sealed` yapmıyor → zincir koşunca anon bunları `/rest/v1/rpc` ile çağırabilir (küresel lisans sayısı sızar). Öneri (migration'dan ÖNCE, patron onayıyla): Supabase panelinde Data API'yi kapat ya da "Exposed schemas"tan `public`'i çıkar; DB tarafında geri alınabilir ek: `REVOKE USAGE ON SCHEMA public FROM anon, authenticated, PUBLIC;` (geri alma: `GRANT USAGE ON SCHEMA public TO anon, authenticated, PUBLIC;`). Ben uygulamadım (kapsam dışı ACL değişikliği).
- **R-S3 PG 17.11 ↔ CI 16:** zincir ve RLS testi 17'de hiç koşmadı. CI'ya 17 matrisi eklenmeli ya da 4.2 geri yükleme testi 17'de yapılmalı.
- **R-S4 Pooler:** session pooler (5432) kullanıldı. Uygulama transaction pooler (6543) kullanırsa Prisma'da `pgbouncer=true` gerekir ve `SET`/oturum bazlı `app.tenant_id` mantığı (işlem içi `set_config(...,true)` dışı) bozulur; graphile-worker LISTEN/NOTIFY session ister → web ve worker için **session pooler** önerilir. Pooler `PGOPTIONS`'u yok sayıyor; rol ayarları (`ALTER ROLE … SET search_path`) ise uygulandı (ölçüldü).
- **R-S5 Yedek (§4.1):** Supabase planı ve PITR durumu **doğrulanamadı**: AgentSpace'e bağlı Supabase entegrasyonu başka bir hesabın projesini görüyor (FonBridge projesi listede yok). Free planda indirilebilir günlük yedek yoktur; Pro'da 7 gün, PITR ek ücretli. Mantıksal yedek için `BACKUP_DATABASE_URL` rolü (RLS'i atlayabilen, salt okur) henüz yok; Supabase'de `supabase_read_only_user` var ama şifresi bizde değil.
- **R-S6 Yarım kurulum:** şu an tablolar var, RLS politikası yok, fonksiyonlar yok. Veri yok ve dışarıdan erişim yok (R-S2), ama uygulama bağlanırsa kiracı yalıtımı **olmaz**. `.env.supabase.local`'daki `SUPABASE_APP_URL` engel kalkana kadar hiçbir yere konmamalı.

## 5. Açık sorular

1. ENGEL için seçenek 1 / 2 / 3? (öneri: 1)
2. Supabase planı (Free/Pro) ve PITR — patron panelden bakmalı; FonBridge projesini AgentSpace Supabase entegrasyonuna bağlarsa yedek ayarlarını ben de kontrol ederim (Ayarlar → Entegrasyonlar).
3. `setup-rls-role.ts` / `apply-rls.ts`'deki "yalnız localhost" korumasına canlı için açık bir bayrak (`--allow-remote` + onay) eklensin mi, yoksa checklist psql yolunu mu yazsın? Supabase için ayrıca "geçici üyelik" adımı gerekiyor.
4. R-S2 sıkılaştırması (Data API kapatma / USAGE revoke) ne zaman?

## 6. Sonraki adım

- Karar sonrası: (seçenek 1) migration kartı → yeniden `scripts/apply-migrations.sh` (`fabrika_migrate`) → son satır `apply-migrations: 41 files applied as fabrika_migrate` → `rls.sql` (fabrika_migrate ile psql) → `rls:verify` (`DATABASE_URL=SUPABASE_APP_URL`, `DATABASE_URL_RLS_TEST` da aynı değerle — yoksa betik yerel `.env`'den okur) exit 0 → §3.1 doğrulama sorgusu.
- Geri alma (bugünkü değişiklikler, gerekirse patron/süper yetkiyle): `REVOKE`/`DROP OWNED BY fabrika_app` → `DROP ROLE fabrika_app, fabrika_jobs`; tablolar `fabrika_migrate`'e ait (`DROP SCHEMA`'ya gerek yok, `DROP OWNED BY fabrika_migrate` public tablolarını kaldırır); `DROP EXTENSION vector`. Ben uygulamadım (DROP yasak).
- İzleme: henüz uygulama yok. Engel kalkınca Supabase "Security Advisor" (RLS/expose uyarıları) her DDL sonrası okunmalı.

## Değişen dosyalar

- `docs/agent-results/TASK-MUOG51GJ3PUOG-devop-fb.md` (bu bölüm eklendi; faz 1 aşağıda aynen duruyor)
- `docs/agent-results/TASK-MUOG51GJ3PUOG-devop-fb-ekler/E1…E10-*.txt` (yeni, maskeli)
- `/Users/macbook/alan/FONBRIDGE/.env.supabase.local` (git dışı, chmod 600)
- Canlı DB: vector uzantısı, 3 rol, 75 tablo/202 index, yetkiler (yukarıda).

---

# (Faz 1) TASK-MUOG51GJ3PUOG — FB go-live ön koşulu R-1, hazırlık aşaması (devop-fb)

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
