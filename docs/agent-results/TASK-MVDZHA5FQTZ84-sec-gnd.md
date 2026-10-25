# TASK-MVDZHA5FQTZ84 · FO-90 — `Membership.user` cascade FK'si DB'de gerçekten var mı (sec-gnd)

**Hüküm: VAR, `ON DELETE CASCADE`. Fark yok, düzeltici migration GEREKMİYOR.** FO-82'deki "silinen kullanıcının bağlantısı kaldırılır" iddiası yerel DB'lerde ve boş DB kurulum yolunda doğrulandı. Canlı/staging için yalnız salt-okur sorgu metni hazırlandı (koşulmadı, patron onayı gerekir).

> Yol notu: kart sonuç dosyasını `…-devop-fb.md` olarak veriyor; lider teslimi (2026-10-20) işi sec-gnd'ye atayıp bu yolu verdi. Lider teslimindeki tek yola yazıldı. Teslim ayrıca "kod/migration commit'leme" diyor; fark çıkmadığı için zaten PR açılmadı.

## Ne yapıldı
1. Şema: `prisma/schema.prisma:191` → `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`. Kural şemanın ilk commit'inden (`c915bc43`, 2026-09-06) beri var; sonradan eklenmiş değil.
2. Migrations: `prisma/migrations/` içinde `CREATE TABLE "Membership"` ve `Membership_userId_fkey` **yok** (kart doğru). `Membership`'e dokunan dosyalar yalnızca kolon/RLS/index işi yapıyor; hiçbiri FK'yi DROP/ALTER etmiyor (kanıt aşağıda).
3. FK'yi oluşturan kaynak: **`prisma db push`** (schema.prisma'dan). `scripts/apply-migrations.sh:8-10` ve `.github/workflows/ci.yml:103-129` bunu açıkça söylüyor: migration dosyaları temel tabloları kurmaz; boş DB'de önce `db push`. Canlıda da yol aynı: `docs/RELEASE_CHECKLIST.md:134` adım 1 = `pnpm exec prisma db push` (veri kaybı bayrağı olmadan), sonra `apply-migrations.sh`. Yani "baseline" FK'yi taşıyan şey schema.prisma + db push'tur.
4. Yerel DB'lerde salt-okur ölçüm (`BEGIN TRANSACTION READ ONLY … ROLLBACK`): 5 veritabanı.
5. Boş DB yolu: kendi açtığım geçici konteyner (`secgnd-fo90-pg`, 127.0.0.1:55490, `--rm`; ortak DB değil) → `prisma db push` → aynı sorgu.
6. Davranış testi (aynı geçici DB): `Membership` üzerinde FORCE RLS + her satırı gizleyen politika, sahip olmayan bir rolle `DELETE FROM "User"` → kullanıcının iki üyeliği de silindi. Yani canlıdaki FORCE RLS cascade'i engellemiyor (PostgreSQL RI eylemleri satır güvenliğini atlar).
7. Gerçek silme yolu: `src/lib/jobs/tasks/users-scheduled-deletion.ts:193` `prisma.user.delete(...)` — hard delete; yorumu (`:189-191`) üyeliklerin cascade ile temizlendiğini varsayıyor. Varsayım doğrulandı. (Soft delete `deletedAt` cascade tetiklemez; üyelik bekleme süresi bitip purge çalışınca gider — `processing-register.md` §2'deki "hesap ömrü + 30 gün" ile uyumlu.)
8. Geçici konteyner durduruldu (`--rm` ile silindi).

## Kanıt (ham çıktı)

Sorgu (`fk.sql`):
```sql
BEGIN TRANSACTION READ ONLY;
SELECT c.conname, c.conrelid::regclass AS tbl, c.confrelid::regclass AS ref,
       c.confdeltype, c.confupdtype, c.convalidated, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
WHERE c.contype='f' AND c.conrelid='public."Membership"'::regclass
ORDER BY c.conname;
SELECT rc.constraint_name, rc.delete_rule, rc.update_rule
FROM information_schema.referential_constraints rc
WHERE rc.constraint_schema='public' AND rc.constraint_name LIKE 'Membership\_%';
ROLLBACK;
```

**Yerel ortak dev DB** — `fabrika-postgres` / `fabrika` (:5433, yalnız READ ONLY işlem; yazma yok):
```
         conname          |     tbl      |   ref    | confdeltype | confupdtype | convalidated |                                         def
--------------------------+--------------+----------+-------------+-------------+--------------+--------------------------------------------------------------------------------------
 Membership_tenantId_fkey | "Membership" | "Tenant" | c           | c           | t            | FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE
 Membership_userId_fkey   | "Membership" | "User"   | c           | c           | t            | FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE

     constraint_name      | delete_rule | update_rule
--------------------------+-------------+-------------
 Membership_tenantId_fkey | CASCADE     | CASCADE
 Membership_userId_fkey   | CASCADE     | CASCADE
```
Aynı çıktı birebir: `fabrika-postgres/fabrika_test_fe_fb`, `devop-fo16-pg/fabrika` (FO-16 kurulumu), `fo16-pg/fabrika`, `se-fb-fo18-pg/fabrika`.

**Boş DB → `prisma db push`** (geçici konteyner):
```
Datasource "db": PostgreSQL database "fo90_empty", schema "public" at "127.0.0.1:55490"
🚀  Your database is now in sync with your Prisma schema. Done in 1.25s
...
 Membership_userId_fkey   | "Membership" | "User"   | c           | c           | t            | FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE
 Membership_userId_fkey   | CASCADE     | CASCADE
```
`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (DB'siz, db push'un üreteceği DDL):
```
1737:ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**Migrations FK'ye dokunuyor mu** (`grep -i membership … | grep constraint|foreign|references|drop|alter table "membership"`):
```
m4-stale-reminder-idempotency.sql:52:ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "staleDigestOn" DATE;
m4-stale-digest-user-claim.sql:63:    ALTER TABLE "Membership" NO FORCE ROW LEVEL SECURITY;
m4-stale-digest-user-claim.sql:78:    ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
m4-stale-reminder-idempotency.down.sql:18:ALTER TABLE "Membership" DROP COLUMN IF EXISTS "staleDigestOn";
m4-stale-digest-user-claim.down.sql:21:DROP INDEX IF EXISTS "Membership_userId_idx";
```
FK'yi değiştiren satır yok. (`rls.sql`, `rls-app-role.sql` de FK'ye dokunmuyor.)

**Davranış (FORCE RLS + deny-all politika, sahip olmayan rol):**
```
 visible to app |     0        ← uygulama rolü üyelikleri göremiyor
DELETE 1                       ← DELETE FROM "User" WHERE id='u1'
 id | tenantId | userId
 m3 | t1       | u2            ← u1'in m1, m2 satırları cascade ile silindi; u2'ninki duruyor
```

## Canlı/staging için salt-okur sorgu (KOŞULMADI — patron onayıyla)
Sahip ya da salt-okur bir rolle, `psql "$URL" -X -v ON_ERROR_STOP=1 -f fk.sql`. Yukarıdaki `fk.sql`'in aynısı; `READ ONLY` işlem içinde, yalnız katalog okur, satır verisi/PII okumaz. Ek kontrol (isteğe bağlı, yine yalnız katalog):
```sql
BEGIN TRANSACTION READ ONLY;
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='public."Membership"'::regclass;
ROLLBACK;
```
Beklenen: `Membership_userId_fkey | c` ve `delete_rule = CASCADE`. Farklı çıkarsa aşağıdaki taslak uygulanır.

## Düzeltici migration taslağı (yalnız canlı sorgusu fark gösterirse; commit'lenmedi)
`prisma/migrations/membership-user-fk-cascade.sql` (+ `apply-order.txt` sonuna ekleme, `.down.sql`):
```sql
-- FO-90: Membership.userId FK'sini schema.prisma'daki onDelete: Cascade ile hizala. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Membership_userId_fkey'
      AND conrelid = 'public."Membership"'::regclass
      AND confdeltype = 'c'
  ) THEN
    ALTER TABLE "Membership" DROP CONSTRAINT IF EXISTS "Membership_userId_fkey";
    -- Yetim satır varsa ADD başarısız olur (ON_ERROR_STOP); önce SELECT ile say, sessizce silme.
    ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
```
`.down.sql` bilerek boş/no-op olmalı (kuralı gevşetmek yasal iddiayı boşa düşürür). Şu an gerek yok: canlı yol da `db push` ile aynı DDL'i üretir.

## Değişen dosyalar
- `docs/agent-results/TASK-MVDZHA5FQTZ84-sec-gnd.md` (bu rapor). Kod/migration/`processing-register.md` değişmedi: fark yok, not güncellemesi gerekmiyor.

## Riskler
- **R-1 (düşük, varsayım):** Canlı DB ölçülmedi. Kod yolu (RELEASE_CHECKLIST adım 1 `db push`) aynı FK'yi kurar ve şemadaki kural ilk günden beri aynıdır. Biri canlıda FK'yi elle değiştirmediyse fark beklenmez; yine de kesin hüküm canlı sorgusunun çıktısıdır.
- **R-2 (bilgi):** FK'nin tek kaynağı `db push`. Biri ileride `db push`'u atlayıp yalnız `apply-migrations.sh` ile kurulum yapmaya kalkarsa temel tablolar hiç oluşmaz (betik zaten başarısız olur), yani "FK'siz sessiz kurulum" riski yok.
- **R-3 (bilgi):** Soft delete (`deletedAt`) cascade tetiklemez; üyelik purge'e kadar (bekleme süresi) kalır. Bu yasal metindeki "hesap ömrü + 30 gün" ile uyumlu; hard delete `users-scheduled-deletion.ts:193`'te.

## Açık sorular
- Canlı/staging salt-okur sorgusu koşulsun mu? (patron onayı; sahip ya da salt-okur rol bilgisi gerekir.)

## Sonraki adım
- Onay gelirse canlı sorgusunu koş, çıktıyı bu karta ekle. `c`/`CASCADE` dönerse kart kapanır; dönmezse taslağı ayrı dal + PR (`--base dev`) olarak aç ve `processing-register.md` §13 / §22-3 notunu güncelle.

## DoD
- [x] Yerel DB'de FK + delete_rule kanıtı (5 DB, `confdeltype=c`, `CASCADE`)
- [x] Boş DB kurulum yolunda FK'yi oluşturan kaynak: `prisma db push` ← `schema.prisma:191`
- [x] Canlı için salt-okur sorgu metni rapora yazıldı
- [x] Düzeltici migration: gerekmedi (taslak rapora yazıldı, PR açılmadı)
- [x] Platform beyanı

**Platform beyanı:** macOS'ta (Darwin 27, Docker pgvector/pg16 konteynerleri) doğrulandı. Dokunulan yol DB katalog/DDL'idir, işletim sisteminden bağımsız: aynı `prisma db push` Linux CI'da (`ci.yml`) ve canlı Linux imajında aynı DDL'i üretir. Windows/Linux'ta ayrıca koşulmadı — gerek yok, çünkü sonuç PostgreSQL'e bağlı, işletim sistemine değil.
