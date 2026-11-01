# TASK-MTQ0BIV9UXVRU — Dev DB'de BYPASSRLS'siz uygulama rolü

**Ajan:** blok-zincir-dse · **Branch:** dev · **Tarih:** 2026-09-06

## 1. Ne yapıldı

Yerel `fabrika` rolü `SUPERUSER` + `BYPASSRLS` olduğu için `prisma/rls.sql`'in kurduğu
40 politika yerelde hiç değerlendirilmiyordu; "RLS çalışıyor" diyen her yerel doğrulama
yanlış yeşildi. Politikalara gerçekten tabi, ayrı bir login rolü eklendi ve RLS
ölçülebilir hâle getirildi.

1. **`fabrika_app` rolü** — `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`.
   Yalnız DML (SELECT/INSERT/UPDATE/DELETE) + sequence USAGE/SELECT; `TRUNCATE` ve
   şemada `CREATE` **verilmedi**. Gelecekte oluşacak tablo/sequence'lar için
   `ALTER DEFAULT PRIVILEGES` (grantor `fabrika`; `fabrika_migrate` mevcut olsaydı o da).
   SQL idempotent: rol varsa nitelikler yeniden dayatılır, yoksa yaratılır.
2. **Parola koda gömülmedi.** SQL dosyası parolayı `current_setting('fabrika.app_password')`
   GUC'undan okur; kurulum script'i onu **bind parametresi** olarak `set_config($1,$2,false)`
   ile yerleştirir. Parola ne .sql dosyasında ne de DDL string'inde geçer.
   İlk çalıştırmada rastgele üretilip `.env`'e `DATABASE_URL_RLS_TEST` olarak eklenir.
3. **Geri-alma önceden yazıldı** — `prisma/rls-app-role-rollback.sql`; default privilege'ları
   aynı grantor üzerinden geri alır (yoksa `DROP ROLE` bağımlılık hatası verir), sonra rolü düşürür.
   Veri silen hiçbir ifade yok.
4. **Kapsam kararına uyuldu:** uygulamanın ana `DATABASE_URL`'i **değiştirilmedi**.
   Yeni rol yalnız ayrı bir bağlantı dizesi (`DATABASE_URL_RLS_TEST`) olarak tanıtıldı.
5. **`tests/rls.spec.ts` bu bağlantı üzerinden koşuyor** — fixture'ları ayrıcalıklı
   singleton yazar, **iddiaları RLS'e tabi rol okur**. Test taban çizgisinde kırmızıydı,
   şimdi yeşil. Ayrıca yalancı-yeşile karşı bir muhafız testi eklendi: bağlantının
   `rolsuper=false, rolbypassrls=false` olduğunu doğrulamadan diğer iddialar anlamsızdır.
6. **`docs/SECURITY_COMPLIANCE.md`'deki yerel test tarifi düzeltildi.** Eski tarif
   `psql -U postgres` diyordu, yani tam da bu görevi doğuran tuzağın kendisiydi:
   superuser oturumunda o iddialar sessizce geçer.

## 2. Kanıt (kopyalanmış komut çıktısı)

### 2.1 Önce: `fabrika` rolü RLS'ten muaf

```
$ docker exec postgres-vector psql -U fabrika -d fabrika \
    -c "select rolname, rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname like 'fabrika%'"
 rolname | rolsuper | rolbypassrls | rolcanlogin
---------+----------+--------------+-------------
 fabrika | t        | t            | t
(1 row)
```

Not: `DATABASE_URL_MIGRATE` `fabrika_migrate` rolüne işaret ediyor ama **o rol veritabanında yok**
(sorgu yalnız `fabrika` döndürdü). Kapsam dışı, "Açık sorular"a yazıldı.

### 2.2 Sonra: `fabrika_app` rolü ve nitelikleri

```
$ pnpm db:rls-role
$ tsx scripts/setup-rls-role.ts
ℹ️  generated a password and appended DATABASE_URL_RLS_TEST to .env
┌─────────┬───────────────┬──────────┬──────────────┬─────────────┬─────────────┬───────────────┐
│ (index) │ rolname       │ rolsuper │ rolbypassrls │ rolcanlogin │ rolcreatedb │ rolcreaterole │
├─────────┼───────────────┼──────────┼──────────────┼─────────────┼─────────────┼───────────────┤
│ 0       │ 'fabrika_app' │ false    │ false        │ true        │ false       │ false         │
└─────────┴───────────────┴──────────┴──────────────┴─────────────┴─────────────┴───────────────┘
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
   DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@localhost:5432/fabrika
```

### 2.3 Yetkiler: verilen ve KASTEN verilmeyen

```
$ docker exec postgres-vector psql -U fabrika -d fabrika -f /tmp/perm.sql
 sel | ins | upd | del | trunc | schema_create
-----+-----+-----+-----+-------+---------------
 t   | t   | t   | t   | f     | f
(1 row)

 grantor | objtype |         defaclacl
---------+---------+----------------------------
 fabrika | r       | {fabrika_app=arwd/fabrika}
 fabrika | S       | {fabrika_app=rU/fabrika}
(2 rows)
```

`trunc=f`, `schema_create=f` → rol tabloları boşaltamaz, şema değiştiremez.
`pg_default_acl` satırları gelecekte oluşacak tablo/sequence'ların da kapsandığını gösteriyor.

### 2.4 RLS gerçekten filtreliyor (yalnız okuma; hiçbir veri yazılmadı/silinmedi)

Mevcut 12 kiracılı `Workspace` verisi üzerinde, `fabrika_app` oturumunda:

```
$ docker exec -e PGPASSWORD=*** postgres-vector psql -h localhost -U fabrika_app -d fabrika -f /tmp/rls-proof.sql
--- who am i, and am I exempt from RLS? ---
 current_user | rolsuper | rolbypassrls
--------------+----------+--------------
 fabrika_app  | f        | f
(1 row)

--- A) app.tenant_id NOT set -> must return 0 rows ---
 tenant_guc | visible_workspaces
------------+--------------------
            |                  0
(1 row)

--- B) app.tenant_id = demo-tenant -> must return only that tenant ---
 set_config
-------------
 demo-tenant
(1 row)

  tenantId   | visible_workspaces
-------------+--------------------
 demo-tenant |                  1
(1 row)

--- C) switch to another tenant -> the demo rows must disappear ---
 set_config
-----------------
 esr-calibration
(1 row)

    tenantId     | visible_workspaces
-----------------+--------------------
 esr-calibration |                  1
(1 row)
```

Aynı üç sorgu, kontrast için `fabrika` (superuser) oturumunda — filtreleme **yok**:

```
$ docker exec postgres-vector psql -U fabrika -d fabrika -f /tmp/rls-contrast.sql
 current_user | rolbypassrls
--------------+--------------
 fabrika      | t
(1 row)

 tenant_guc | visible_workspaces
------------+--------------------
            |                 12       <-- app.tenant_id set değilken bile 12
(1 row)

 set_config
-------------
 demo-tenant
(1 row)

 visible_workspaces
--------------------
                 12       <-- tek kiracıya set edilmişken de 12
(1 row)
```

12 → 0/1/1: politikalar artık ölçülebilir.

### 2.5 `pnpm test` — kırmızı 4'ten 3'e düştü

Taban çizgisi (değişiklikten ÖNCE):

```
 ❯ tests/rls.spec.ts:65:33   AssertionError: expected 14 to be 1
 Test Files  3 failed | 41 passed (44)
      Tests  4 failed | 317 passed (321)
```

Değişiklikten SONRA:

```
$ pnpm test
 FAIL  tests/sedia-adapter.test.ts > ... Error: Test timed out in 10000ms.
 Test Files  2 failed | 42 passed (44)
      Tests  3 failed | 320 passed (323)
```

Kalan 3 kırmızının tamamı `tests/sedia-adapter.test.ts` ağ testleri — bilinen taban
çizgisi, bu işle ilgisiz. `tests/rls.spec.ts` artık listede yok.

### 2.6 Test gerçekten ayırt ediyor mu? (yalancı-yeşil kontrolü)

Aynı spec, bilerek superuser bağlantısına yönlendirildiğinde 4/4 **çöküyor**:

```
$ DATABASE_URL_RLS_TEST=<DATABASE_URL değeri> npx vitest run tests/rls.spec.ts
 ❯ tests/rls.spec.ts (4 tests | 4 failed) 142ms
     × the test connection is genuinely subject to RLS 13ms
     × Tenant A cannot see Tenant B workspaces 12ms
     × queries outside the withTenant wrapper see no rows at all 1ms
     × writes are rejected when they target another tenant 5ms
AssertionError: expected true to be false          // rolbypassrls
AssertionError: expected [...] to have a length of 1 but got 14
AssertionError: expected [...] to have a length of +0 but got 14
AssertionError: promise resolved "undefined" instead of rejecting
 Tests  4 failed (4)
```

`fabrika_app` ile 4/4 geçiyor, `fabrika` ile 4/4 düşüyor → yeşil bir şey kanıtlıyor.

### 2.7 Fixture temizliği — veri bırakılmadı

```
$ docker exec postgres-vector psql -U fabrika -d fabrika \
    -c "SELECT count(*) AS leftover_fixtures FROM \"Workspace\" WHERE name IN ('Workspace A','Workspace B','Smuggled')"
 leftover_fixtures
-------------------
                 0
$ ... -c "SELECT count(*) AS total_workspaces FROM \"Workspace\""
 total_workspaces
------------------
               12       <-- başlangıçtaki sayı
```

### 2.8 Idempotency + geri-alma turu

```
=== 1. re-run setup (idempotency) ===
│ 0       │ 'fabrika_app' │ false    │ false        │ true        │ false       │ false         │
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.

=== 2. rollback ===
✅ fabrika_app removed. Drop DATABASE_URL_RLS_TEST from .env to finish.

=== 3. role gone? ===
0

=== 4. re-create ===
│ 0       │ 'fabrika_app' │ false    │ false        │ true        │ false       │ false         │
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.

$ node -e "... .env satır sayısı"
DATABASE_URL_RLS_TEST lines in .env: 1     <-- .env iki kez yazılmadı

$ npx vitest run tests/rls.spec.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### 2.9 Diğer kapılar

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok — temiz)

$ pnpm build
✓ Running next.config.ts took 204ms
✓ Compiled successfully in 523ms
✓ Generating static pages using 11 workers (35/35) in 392ms

$ pnpm rls:check
Found 37 tenant-scoped models requiring RLS policies:
...
✅ SUCCESS: All 37 tenant-scoped models have RLS policies registered.
```

`scripts/check-rls.ts` kırılmadı (statik dosya taraması yapıyor, bağlantıdan bağımsız).

## 3. Değişen dosyalar

| Dosya | Durum | Ne |
|---|---|---|
| `prisma/rls-app-role.sql` | **yeni** | `fabrika_app` rolü + yetkiler, idempotent; parola GUC'tan |
| `prisma/rls-app-role-rollback.sql` | **yeni** | Rolü ve tüm yetkilerini geri alır; veri silmez |
| `scripts/setup-rls-role.ts` | **yeni** | `pnpm db:rls-role` sürücüsü; parola üretimi, uzak-DB reddi, doğrulama |
| `tests/helpers/dotenv.ts` | **yeni** | Vitest .env yüklemediği için tek anahtar okur; `process.env`'i değiştirmez |
| `src/lib/db.ts` | değişti | `createDbClient(url)` + `withTenantOn(client, …)`; `withTenant` aynı imzayla korundu |
| `tests/rls.spec.ts` | değişti | İddialar RLS'e tabi bağlantıdan; muhafız testi + WITH CHECK testi eklendi |
| `package.json` | değişti | `db:rls-role`, `db:rls-role:rollback` |
| `docs/SECURITY_COMPLIANCE.md` | değişti | Yanıltıcı superuser test tarifi düzeltildi |
| `.env` | değişti | `DATABASE_URL_RLS_TEST` eklendi (git'te değil) |
| `.env.example` | değişti | Aynı anahtar belgelendi — **ancak `.gitignore:34 (.env*)` yüzünden commit edilmiyor** |

`DATABASE_URL`, `fabrika` rolü, `fabrika_migrate` rolü, `prisma/rls.sql`: **dokunulmadı**.

## 4. Riskler

- **`.env.example` git'e girmiyor.** `.gitignore` satır 34 `.env*` deseni onu da kapsıyor,
  dolayısıyla yeni değişken oradan keşfedilemez. Bunu telafi etmek için değişken
  `docs/SECURITY_COMPLIANCE.md` ve `prisma/rls-app-role.sql` başlığında belgelendi.
  Gerçek düzeltme `.gitignore`'a `!.env.example` eklemek; başka ajanların .env akışını
  etkileyebileceği için bu görevde yapılmadı.
- **Test rolü ≠ uygulama rolü.** `pnpm test` yeşil olması uygulamanın RLS altında
  çalışacağı anlamına **gelmez**; yalnız politikaların doğru olduğunu gösterir. Uygulama
  hâlâ BYPASSRLS rolüyle bağlanıyor. Bu, kasıtlı bir kapsam kararı — ama yanlış bir
  güvenlik hissi doğurmaması için burada açıkça yazılıyor.
- **Yalnız yerel.** Script `localhost`/`127.0.0.1` dışındaki bağlantıyı reddediyor;
  staging/prod'da rol kurulumu ayrıca planlanmalı.
- **Parola rotasyonu.** `.env`'deki `DATABASE_URL_RLS_TEST` silinip `pnpm db:rls-role`
  yeniden koşulursa yeni parola üretilir ve rolünki `ALTER ROLE` ile değiştirilir; aynı
  makinedeki eski açık bağlantılar etkilenmez ama yeni bağlantılar eski parolayla düşer.

## 5. Açık sorular

1. **`fabrika_migrate` rolü veritabanında yok** ama `.env`/`.env.example` içinde
   `DATABASE_URL_MIGRATE` olarak duruyor. O bağlantı dizesi bugün çalışmaz. Ayrı bir
   iş olarak rol yaratılsın mı, yoksa değişken kaldırılsın mı?
2. **`.gitignore`'a `!.env.example` eklensin mi?** Örnek dosyanın izlenmemesi, her yeni
   ortam değişkeninin repoda keşfedilemez kalması demek.
3. `tests/e2e/rls.spec.ts` (Playwright) hâlâ uygulamanın kendi bağlantısı üzerinden
   koşuyor, yani HTTP katmanındaki izolasyonu ölçüyor. Bunun da RLS rolüne çekilmesi
   ana `DATABASE_URL` geçişine bağlı.

## 6. Sonraki adım

1. **Ana `DATABASE_URL`'i `fabrika_app`'e çevirme işi (takip görevi).**
   **TASK-MTQ5Y8EPT7FDA (kiracı izolasyonu sertleştirme) bitmeden yapılmamalı.**
   Engel bu görevde yeniden ölçüldü: `grep -rl withTenant src` → 5 dosya (biri
   `src/lib/db.ts`'in kendisi, yani **4 çağrı yeri**), `grep -rn demo-tenant src | wc -l`
   → **46**. NOBYPASSRLS role bugün geçmek yerel geliştirmeyi geniş çapta kırar. Sıralama: (a) `withTenant()` kapsamını tüm kiracı-bağımlı
   sorgulara yay, (b) demo-tenant geri düşüşlerini temizle, (c) `DATABASE_URL`'i
   `fabrika_app`'e çevir, (d) `DATABASE_URL_RLS_TEST`'i kaldır — o noktada ana
   bağlantı zaten RLS'e tabi olur ve ikinci bir dizeye gerek kalmaz.
2. CI'da `pnpm db:rls-role` adımını `check-rls.yml` iş akışına ekleyip `tests/rls.spec.ts`'i
   orada da gerçek rolle koşturmak — aksi hâlde CI'da spec sessizce atlanır.
3. Yukarıdaki 1. ve 2. açık soruların lider tarafından karara bağlanması.
