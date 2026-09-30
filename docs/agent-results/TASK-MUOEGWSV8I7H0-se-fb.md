# TASK-MUOEGWSV8I7H0 — se-fb — İNCELEME-106 I-1: migration zinciri sahip rolüyle

**Sonuç:** Kök neden ölçüldü. Ortada **iki ayrı kusur** var ve ikisi de kapatıldı.
- **K-1 (zincir durması):** RLS ile ilgisi yok. Yer tutucu bir GUC'u (`app.system_scope`) fonksiyonun `SET` yan cümlesine yazmak parametre yetkisi ister. BYPASSRLS bunu çözmüyor (ölçüldü).
- **K-2 (backfill'ler 0 satır):** FORCE RLS altında sahip rolü kiracı bağlamı olmadan 0 satır görüyor. Ek bulgu: aynı sebeple `retire-eur-plan-ladder.sql` emekli planı siliyor, iki abonelik silinmiş plana işaret eder kalıyor.

Düzeltmeden sonra sahip rolüyle zincir sonuna kadar koşuyor (41/41, üç kez). 10 backfill ölçüsünün hepsi süper kullanıcıyla aynı sayıyı veriyor. `fabrika_app`'in yetkisi değişmedi (`has_parameter_privilege = f`). RLS testleri ve `rls:verify` yeşil. Dal dev'e merge edildi, push yapılmadı.

## 1. Ne yapıldı

### 1.1 Kök neden (ham çıktı: `-ekler/01`, `-ekler/02`, `-ekler/03`)
İzole pg16 (`sefb-i1-pg`, 127.0.0.1:55141) kullanıldı. Prod benzeri sahip rolü `own` kuruldu: `NOSUPERUSER NOBYPASSRLS`, veritabanı ve `public` şeması sahibi, `prisma db push` tabloları bu rolle kuruldu.
```
current_user=own super=false bypassrls=false version=16.15 (Debian 16.15-1.pgdg12+2)
==> [23/41] add-agency-invite-code.sql
psql:prisma/migrations/add-agency-invite-code.sql:162: ERROR:  permission denied to set parameter "app.system_scope"
exit=3
```
Yalıtım (`-ekler/02`): aynı rol **düz `SET app.system_scope='on'`** yapabiliyor, gövdede `set_config` olan fonksiyonu da kurabiliyor. Ama `CREATE FUNCTION … SET app.system_scope = 'on'` reddediliyor. PostgreSQL 15+ yer tutucu parametreyi fonksiyon/`ALTER DATABASE/ROLE SET` içinde yalnız süper kullanıcıya ya da `SET ON PARAMETER` yetkisi olan role izin veriyor.

| Sahip rolüne verilen | `CREATE FUNCTION … SET app.system_scope` |
|---|---|
| hiçbir şey | `ERROR: permission denied to set parameter` |
| `ALTER ROLE own BYPASSRLS` | `ERROR: permission denied to set parameter` (**çözmüyor**) |
| `GRANT SET ON PARAMETER app.system_scope TO own` | `CREATE FUNCTION` |

Çağrı anında yetki gerekmiyor: `fabrika_app`, süper kullanıcının kurduğu `SET` yan cümleli fonksiyonu sorunsuz çağırdı (`fabrika_app|on`). Yani üretimdeki uygulama etkilenmiyor. Yalnız zinciri kuran rol etkileniyor.

### 1.2 FORCE RLS altında yazan migration'lar ve satır sayıları (`-ekler/05`)
Tarama: `apply-order.txt`'deki her dosyada fonksiyon gövdeleri dışındaki `UPDATE/INSERT/DELETE`. FORCE tablolar canlı DB'den alındı (47 tablo). FORCE tabloyu **yazan ya da okuyan** 8 dosya bulundu. `m4-stale-digest-user-claim.sql` `User`'ı yazar ama `Membership`'ten okur. Kendi `NO FORCE` hilesi var, girdisini ise 38. dosya üretir. `add-plan-versioning` yalnız `Plan`'ı okur; o tablo FORCE değil, sahibi muaf.

Fikstür: `-ekler/legacy-seed.sql`, iki kiracı. Tamamen migrate edilmiş bir DB'ye eski şekilli satırlar konuldu. Dosyalar idempotent olduğu için zincirin yeniden koşusu tam bu backfill cümlelerini çalıştırıyor. Beş kopyada ölçüldü, sayımlar süper kullanıcıyla okundu:

| # dosya — ölçü | süper, eski betik | süper, yeni betik | **sahip, eski betik** | sahip, eski, dosya dosya | **sahip, yeni betik** |
|---|---|---|---|---|---|
| 07 rename-feedback-alert-columns — Feedback→legacy | 2 | 2 | **0** | 0 | **2** |
| 08 retire-eur-plan-ladder — Subscription team→pro | 2 | 2 | **0** | 0 | **2** |
| 14 topicmatch-per-opportunity — opportunityId | 2 | 2 | **0** | 0 | **2** |
| 21 add-stripe-event-log — StripeEventLog backfill | 2 | 2 | **0** | 0 | **2** |
| 32 hash-bearer-tokens — Invitation.tokenHash | 2 | 2 | **0** | 0 | **2** |
| 32 hash-bearer-tokens — ApplicationPart.magicTokenHash | 1 | 1 | **0** | 0 | **1** |
| 33 credit-ledger-grant-period — grantPeriod | 2 | 2 | **0** | 0 | **2** |
| 38 m4-stale-reminder-idempotency — Relationship | 2 | 2 | **0** | 0 | **2** |
| 38 m4-stale-reminder-idempotency — Membership | 2 | 2 | **0** | 0 | **2** |
| 41 m4-stale-digest-user-claim — User | 2 | 2 | **0** | 0 | **2** |
| çıkış | 0 | 0 | **3** (32. dosya) | — | **0** |

"Sahip, eski betik" sütununda K-1 yetkisi verilmişti. Bu sütun yalnız K-2'yi ölçer. Yan etkiler (aynı dosya, son blok):
- **`retire-eur-plan-ladder.sql` sessiz bütünlük bozulması:** sahip + eski betikte `Plan team var=0, Subscription team=2`. Dosya abonelikleri taşıyamıyor (0 satır görüyor). "Yetim abonelik" `DO` kontrolü de 0 görüyor ve durdurmuyor. Sonra emekli planı siliyor. Süper kullanıcıda ve yeni betikte `0/0`.
- `hash-bearer-tokens.sql`: `Invitation.tokenHash SET NOT NULL` → `contains null values`, exit 3. Dosya tek işlemde olduğu için ham token kolonları geri alındı (`magicToken kolonu=1`, veri kaybı yok). Ama zincir 32.'de durdu.

### 1.3 1-3-1
**Sorun:** Sahip rolüyle (i) zincir 23'te duruyor, (ii) FORCE RLS backfill'leri 0 satır güncelliyor. İkisi farklı mekanizma. Çözüm `fabrika_app`'e yetki vermemeli ve RLS'yi gevşetmemeli.

**Kartın üç seçeneği, ölçülerek** (`-ekler/02`, `-ekler/06`):
- **(a) Oturumda `SET LOCAL row_security = off` + migration süresince BYPASSRLS.** K-1'i **çözmüyor** (BYPASSRLS'li sahip de `permission denied to set parameter` aldı). K-2'yi çözüyor (`UPDATE 2`). Ama BYPASSRLS'i sahip kendine veremiyor (`permission denied to alter role`), her yayında süper kullanıcı gerekiyor. BYPASSRLS'siz `row_security=off` ise `query would be affected by row-level security policy` hatası veriyor. Bu sessiz 0'dan iyi, ama çözüm değil.
- **(b) Ayrı migration rolü (BYPASSRLS).** K-1'i **çözmüyor**, aynı parametre kontrolü geçerli. Kalıcı, RLS'den muaf, oturum açabilen yeni bir rol ekliyor. Tabloların sahipliği de iki role bölünüyor (`fabrika_app` varsayılan yetkileri yalnız `fabrika`/`fabrika_migrate` için kayıtlı). Yetki yüzeyi en geniş seçenek.
- **(c) Backfill'leri SECURITY DEFINER fonksiyonuna taşımak.** K-2'yi **çözmüyor**: fonksiyon sahibi `own`, FORCE altında o da süzülüyor (`updated_rows 0`, ölçüldü). K-1'e dokunmuyor. 8 dosyanın yeniden yazılmasını gerektiriyor.

**Öneri ve uygulanan: (d), üçünden daha az yetki veriyor:**
- **K-2:** `apply-migrations.sh` her dosyayı `-c "SET app.system_scope = 'on'"` oturumuyla koşuyor. Bu, `prisma/rls.sql`'deki **mevcut** `system_scope` politikasını açıyor, uygulamanın `enter_system_scope()` ile kullandığı kapının aynısı. Politika değişmiyor, hiçbir rol BYPASSRLS almıyor, yeni yetki yok (düz `SET` herkese açık, ölçüldü). Oturum düzeyinde çünkü `SET LOCAL` dosyadaki ilk `COMMIT`'te biter. psql süreciyle birlikte ölür.
- **K-1:** Tek dar yetki: `GRANT SET ON PARAMETER app.system_scope TO <sahip>`. Bir kez, süper kullanıcıyla verilir (`prisma/migration-owner-grant.sql`). Dosya `fabrika_app`'e vermeyi reddediyor.
- **Fail-closed ön-kontrol:** yetki yoksa, `system_scope` politikası olmayan bir FORCE tablo varsa ya da `app.system_scope` için saklı bir DB/rol varsayılanı varsa betik **hiçbir dosyayı uygulamadan** exit 1 veriyor. Varsayılan kontrolü koşudan sonra da yapılıyor.

**Neden bu yetki güvenli, sınırı nedir:** Yetkiyle sahip rolü `ALTER DATABASE f SET app.system_scope='on'` da yazabiliyor. Bu, `fabrika_app`'in yeni oturumlarını `on` başlatıyor, yani yalıtımı kapatıyor (ölçüldü, `-ekler/03`). Sahip rolü bunu zaten `ALTER TABLE … DISABLE ROW LEVEL SECURITY` ile yapabiliyor (yetkisiz, ölçüldü). Yani bu yeni bir güç değil, sessiz yeni bir yol. Betiğin ön/son kontrolü ve checklist'teki doğrulama sorgusu bu yolu yakalıyor.

**Reddedilen alternatif:** 4 fonksiyonun 7 tanımındaki `SET` yan cümlesini gövdede `set_config` + geri yüklemeye çevirmek. Bu yol yetki gerektirmez, ama incelenmiş SECURITY DEFINER gövdelerini değiştirir ve kapsamın sızmaması yeniden kanıtlanmalı. Canlı DB kendi VPS'inde Docker Postgres 16 olacağı için (§8 madde 1) süper kullanıcı mevcut. Tek satırlık yetki daha küçük değişiklik.

### 1.4 RELEASE_CHECKLIST §3.1 adım 3
Eklenenler: hangi rolle koşulacağı (sahip, süper kullanıcı değil, BYPASSRLS değil, asla `fabrika_app`), tek seferlik yetki komutu ve beklenen çıktı, ön-kontrolün iki durma sebebi, saklı varsayılan yasağı, **doğrulama sorgusu** (beklenen `<sahip>|f|f|t|0|0`), down dosyalarının aynı oturumla uygulanması. Sorgu belgeden aynen çıkarılıp koşuldu: `own|f|f|t|0|0` (`-ekler/07`).

## 2. Kanıt

### 2.1 Önce / sonra (`-ekler/01`, `-ekler/04`)
```
ÖNCE (dev b8cde55e, own):  ==> [23/41] … ERROR: permission denied to set parameter "app.system_scope"   exit=3
SONRA, taze DB f2, own:
 A) yetkisiz        → role "own" may not create functions with SET app.system_scope … No file was applied.  exit=1
                      migration nesnesi (redeem_agency_invite) sayısı=0
 B) grant (süper)   → own can_set_system_scope=t, fabrika_app f
 C) 1. koşu         → apply-migrations: 41 files applied as own   exit=0
 D) db:rls öncesi 2.→ … FORCE RLS tables have no system_scope policy: AgencyInviteCode, … No file was applied. exit=1
 E) db:rls (own)    → Policies in public: 28 → 112
 F) 2. ve 3. koşu   → 41 files applied as own   exit=0 (iki kez)
 own super=false bypassrls=false;  FORCE tablo=47, system_scope politikasız FORCE=0
```

### 2.2 Regresyon testi: `tests/migration-owner-chain.live.test.ts` (`-ekler/08`, `-ekler/09`)
Test `DATABASE_URL` süper kullanıcısıyla (CI'daki gibi) kendi rolünü (`fb_mig_owner_*`, NOSUPERUSER NOBYPASSRLS) ve DB'sini kuruyor. Sahip rolüyle `prisma db push` yapıyor. Altı test: yetkisizken hiçbir dosya uygulanmadan durma; yetki dosyası sahibe verir, `fabrika_app`'e asla; zincir sonuna kadar koşar, `db:rls` öncesi 2. koşu durur; `db:rls` sonrası FORCE backfill'lerinde sahip = süper (şablon kopyasıyla aynı durum); `fabrika_app` yeni oturumda `system_scope` açık değil, kiracısız 0 satır, `lt-a` ile yalnız `lm-a`; saklı varsayılan varsa durma. CI'da psql ya da süper kullanıcı yoksa dosya kırmızı olur, atlanmaz.
```
Test Files  1 passed (1)   Tests  6 passed (6)   Duration 9.00s
M1 betik = dev sürümü                     → Tests 4 failed | 2 passed
M2 yalnız -c "SET app.system_scope" silindi → Tests 1 failed | 5 passed  (backfill: feedback_legacy +0 ≠ 2)
geri yüklendi                             → Tests 6 passed
artık DB=0  artık rol=0   (test temizliği)
```

### 2.3 Kapılar (DB `f`: CI sırası `db push` → `db:rls-role` → zincir ×2 (yeni betik, süper) → `db:rls` → `db:seed`; `-ekler/10`–`15`)
```
pnpm lint            exit=0
pnpm typecheck       exit=0
pnpm test (CI=1, AUTH_SECRET = ci.yml:133 fikstürü)  Test Files 302 passed | 2 skipped (304)  Tests 3927 passed | 50 skipped  exit=0
pnpm rls:check       exit=0   pnpm rls:bypass-check exit=0
pnpm rls:verify      exit=0   "47 kiracıya özel tabloda … izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü"
RLS ile ilgili 9 dosya --reporter=verbose: Test Files 9 passed, Tests 114 passed (rls.spec, rls-coverage, system-scope.live, agency-invite.live, agency-funnel.live, stale-relationship-reminder.live, stripe/iyzico idempotency-rls, migration-owner-chain)
pnpm build           exit=0
```
`-ekler/12a`: `AUTH_SECRET` olmadan `CI=1` ilk koşuda 3 dosya "refusing to skip in CI — AUTH_SECRET is not set" ile düştü. Bu, CI'ın Test adımında verdiği değişkenin eksikliği; değişiklikle ilgisi yok. Aynı değerle yeniden koşuldu.

## 3. Değişen dosyalar
- `scripts/apply-migrations.sh`: ön-kontrol (yetki / politikasız FORCE tablo / saklı varsayılan), dosya başına `SET app.system_scope = 'on'` oturumu, son-kontrol, son satır `files applied as <rol>`.
- `prisma/migration-owner-grant.sql` (yeni) ve `prisma/migration-owner-grant-rollback.sql` (yeni).
- `tests/migration-owner-chain.live.test.ts` (yeni).
- `docs/RELEASE_CHECKLIST.md` §3.1 adım 3; `scripts/README.md` `apply-migrations.sh` satırı.
- `docs/agent-results/TASK-MUOEGWSV8I7H0-se-fb.md` ve `-ekler/`. Eklerdeki bağlantı parolaları `***` ile maskelendi; bunlar zaten silinmiş bir test konteynerinin fikstür parolalarıydı. `fabrika_app` parolası hiçbir dosyada yok (düz metin araması: 0 dosya).
- Migration `.sql` dosyalarına, politikalara ve `fabrika_app`'e **dokunulmadı**.

## 4. Riskler
- **Tek seferlik yetki unutulursa** zincir koşmaz. Ama artık 22 dosya uygulanıp yarıda kalmıyor, hiçbir dosya uygulanmadan ve komutu söyleyerek duruyor (ölçüldü).
- **Taze DB'de `db:rls` öncesi ikinci koşu** bilerek duruyor: 14 FORCE tablo `system_scope`'suz. Canlı sıra (3 → 4) bunu tetiklemez. CI süper kullanıcıyla koştuğu için muaf. Checklist'e yazıldı.
- **Kalan dar boşluk (koddan, ölçülmedi):** Aynı koşuda, zincirden önce var olan ve `db:rls` hiç uygulanmamış bir tabloyu bir dosya FORCE'a alır ve sonraki bir dosya doldurursa ön-kontrol bunu göremez. Ön-kontrol yalnız koşu başındaki durumu görür. Bu yalnız `db:rls`'in hiç koşmadığı, veri içeren bir DB'de olur. Canlı akışta `db:rls` her yayında koşuyor.
- `has_parameter_privilege(…, 'SET')` ve `GRANT … ON PARAMETER` PostgreSQL 15+ ister. CI ve hedef pg16. pg14'te ön-kontrol hata verip durur, sessiz geçmez.
- Migration oturumu `system_scope` altında, yani `WITH CHECK` de açık. Bir migration yanlış `tenantId` ile yazarsa bunu RLS yakalamaz. Süper kullanıcıyla CI'da da durum hep buydu, davranış farkı yok.
- `pnpm db:seed` bu DB'de ilk koşuda exit 1 verdi, ikinci koşuda 0 (`-ekler/10`). Hata satırı alınamadı, neden ölçülmedi. Seed bu değişikliğin dokunduğu hiçbir dosyayı kullanmıyor.

## 5. Açık sorular
- Canlı DB yönetilen bir Postgres'e taşınırsa (§4 "Yönetilen Postgres seçilirse") süper kullanıcı olmayabilir. O zaman `GRANT SET ON PARAMETER`'ın verilip verilemeyeceği sağlayıcıya bağlıdır (**varsayım**, ölçülmedi). Yedek yol §1.3'teki reddedilen alternatif (gövdede `set_config`). Ayrı kart olur.
- Canlıda zincir daha önce sahip rolüyle koşulduysa, 07/08/14/21/33/38 backfill'leri 0 satırla geçmiş olabilir; en kritiği 08 (yetim abonelik). Henüz canlı yok (§8), ilk kurulum boş DB. Varsa kontrol: `SELECT count(*) FROM "Subscription" s WHERE NOT EXISTS (SELECT 1 FROM "Plan" p WHERE p.id = s."planId")` → 0 (süper kullanıcıyla ya da `system_scope` oturumuyla).

## 6. Sonraki adım
- İnceleme: crw-fb ya da crw2-fb. Özellikle ön-kontrol sorgusu ve oturum düzeyi `SET`'in dosyalardaki `BEGIN/COMMIT` ile etkileşimi (ölçüldü: 41 dosya üç kez).
- Patron / canlı kurulum: §3.1 adım 3 (i). Yetki, DB kümesi başına bir kez.

## Temizlik ve merge
(merge ve temizlik kaydı aşağıda, merge'ten sonra eklendi)

**Platform:** mac'te doğrulandı (darwin 27, Homebrew libpq psql, `pgvector/pgvector:pg16` konteyneri, Node 26, pnpm 11). Değişen betik bash + psql. Linux'ta (CI: ubuntu, aynı betik zaten orada koşuyor) davranış aynı olmalı; koddan bakıldığında platforma bağlı yeni bir çağrı yok (`<<<` here-string ve `IFS` bash'e özgü, betik `#!/usr/bin/env bash` ile koşuyor). Windows'ta koşulamadı: betik bash ister, bu repoda Windows'ta da daha önce koşulmuyordu (WSL/Git Bash dışında).
