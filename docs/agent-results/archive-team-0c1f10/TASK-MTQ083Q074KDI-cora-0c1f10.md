# TASK-MTQ083Q074KDI — Seed Data BLOCKER: `pnpm db:seed` çalışır hale getirildi

**Ajan:** cora-0c1f10 (Backend Mühendisi) · **Tarih:** 2026-09-06 · **Branch:** dev · **Durum:** ✅ DONE

---

## 1. Ne yapıldı

`pnpm db:seed` üç ayrı nedenden çalışmıyordu. Üçü de düzeltildi.

### Kök neden #1 — Prisma 7 driver adapter zorunluluğu
`prisma/seed.ts` `new PrismaClient()` ile istemci kuruyordu. Prisma 7'de bu, bağlantı kurmadan
`PrismaClientInitializationError` fırlatıyor ("A driver adapter is required to connect to your database").
Yeni bir adapter icat etmek yerine repoda ZATEN var olan `src/lib/db.ts` (PrismaPg + pg.Pool) yeniden kullanıldı.

### Kök neden #2 — `.env` yüklenmiyordu
`pnpm db:seed` = `tsx prisma/seed.ts`. `tsx` `.env` dosyasını otomatik yüklemez (dotenv yalnızca
`prisma.config.ts` içinde, o da sadece Prisma CLI için). Seed'e `import 'dotenv/config'` eklendi.

### Kök neden #3 — Yerel veritabanı hiç yoktu
Makinede ne `postgres` ne `psql` kuruluydu, Docker daemon kapalıydı ve `docker` CLI PATH'te değildi
(`/Applications/Docker.app/Contents/Resources/bin/docker`). `docker-compose.yml`'deki `postgres-vector`
(pgvector/pgvector:pg16) ayağa kaldırıldı. Ayrıca compose `POSTGRES_DB=fabrika_db` oluşturuyor ama
`.env`'deki `DATABASE_URL` `…/fabrika` veritabanını istiyordu → `fabrika` DB'si + `vector` uzantısı
oluşturuldu ve `fabrika` rolünün parolası `.env`'deki değerle hizalandı (parola hiçbir yerde yazdırılmadı).

### Ek: seed.md §6 demo kiracısı eklendi
`prisma/seed.md` ve `CLAUDE.md` seed'in demo kiracıyı da kurmasını şart koşuyor; seed.ts'te yoktu.
Eklendi: **Demo KOBİ** (TR/SME, Team planı, M1–M5+M8 `ON`), 3 kullanıcı (OWNER/PIPELINE_MANAGER/WRITER),
2 call + 6 topic (HORIZON-CL5-2026-09-D4-01..04, HORIZON-MISS-2026-04-CIT-02, HORIZON-NEB-2026-01-REGEN-02),
5 fırsat (G0–G3), 12 gate kararı, 20 kanıt, 6 ilişki.
Blok `NODE_ENV === 'production'` ise atlanır ve **deterministik `demo-*` id + upsert** kullanır → idempotent.

---

## 2. Kanıt (gerçek komut çıktısı)

### 2.1 Başlangıç hatası (düzeltmeden önce)
```
$ pnpm db:seed
$ tsx prisma/seed.ts
PrismaClientInitializationError: PrismaClient was instantiated without any options.
A driver adapter is required to connect to your database.
    at <anonymous> (/Users/macbook/AgentSpace/fabrika/prisma/seed.ts:3:16)
[ELIFECYCLE] Command failed with exit code 1.
```

### 2.2 DB yok (probe, düzeltmeden önce)
```
DATABASE_URL set: true
host: localhost port: 5432 db: /fabrika user: fabrika
CONNECT FAIL:            <- ECONNREFUSED, dinleyen postgres yok
```

### 2.3 Dev DB ayağa kaldırıldı
```
$ docker compose up -d postgres-vector
 Image pgvector/pgvector:pg16 Pulled
 Volume fabrika_pgdata Created
 Container postgres-vector Started

$ docker exec postgres-vector psql -U fabrika -d fabrika_db -c "CREATE DATABASE fabrika OWNER fabrika"
CREATE DATABASE
$ docker exec postgres-vector psql -U fabrika -d fabrika -c "CREATE EXTENSION IF NOT EXISTS vector"
CREATE EXTENSION
$ docker exec postgres-vector psql -U fabrika -d fabrika -tAc "select current_database(), (select count(*) from pg_extension where extname='vector')"
fabrika|1
```

Bağlantı doğrulaması (`.env` URL'i ile):
```
CONNECT OK { db: 'fabrika', usr: 'fabrika', tables: '0' }
```

### 2.4 Şema oluşturuldu — KULLANICI ONAYIYLA
Prisma 7, AI ajanlarının `db push` çalıştırmasını engelliyor. Durum kullanıcıya sunuldu
(hedef: az önce sıfırdan oluşturulmuş, 0 tablolu YEREL container DB'si; prod değil; kaybedilecek veri yok).
Kullanıcı yanıtı: **"Evet, db push çalıştır"**.
```
$ PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Evet, db push calistir" npx prisma db push --accept-data-loss
Datasource "db": PostgreSQL database "fabrika", schema "public" at "localhost:5432"
🚀  Your database is now in sync with your Prisma schema. Done in 240ms
```

### 2.5 `pnpm db:seed` — KOŞU 1 (exit 0)
```
$ pnpm db:seed
$ tsx prisma/seed.ts
Seeding Database...
Demo tenant seeded (3 users, 5 opportunities, 20 evidence, 6 relationships).
Seeding completed.
```

Sayımlar (KOŞU 1 sonrası):
```json
{"ModuleCatalog":"11","Plan":"5","AddOnCatalog":"9","Programme":"9","ConceptTemplate":"7",
 "Tenant":"1","User":"3","Membership":"3","Workspace":"1","Subscription":"1","ModuleState":"11",
 "Call":"2","Topic":"6","Opportunity":"5","GateDecision":"12","Evidence":"20","Relationship":"6"}
```

### 2.6 İKİ KEZ KOŞMA KANITI (idempotency) — KOŞU 2
```
$ pnpm db:seed
Seeding Database...
Demo tenant seeded (3 users, 5 opportunities, 20 evidence, 6 relationships).
Seeding completed.
```
Sayımlar (KOŞU 2 sonrası) — **birebir aynı, tek bir mükerrer satır yok**:
```json
{"ModuleCatalog":"11","Plan":"5","AddOnCatalog":"9","Programme":"9","ConceptTemplate":"7",
 "Tenant":"1","User":"3","Membership":"3","Workspace":"1","Subscription":"1","ModuleState":"11",
 "Call":"2","Topic":"6","Opportunity":"5","GateDecision":"12","Evidence":"20","Relationship":"6"}
```

### 2.7 RLS uygulandıktan SONRA seed (KOŞU 3)
```
$ docker exec -i postgres-vector psql -U fabrika -d fabrika -v ON_ERROR_STOP=1 < prisma/rls.sql
DO
DO
$ docker exec postgres-vector psql -U fabrika -d fabrika -tAc "select count(*) from pg_policies where schemaname='public'"
36

$ pnpm db:seed
Seeding Database...
Demo tenant seeded (3 users, 5 opportunities, 20 evidence, 6 relationships).
Seeding completed.
```
Sayımlar yine değişmedi (yukarıdakiyle aynı JSON).

### 2.8 Typecheck
```
$ pnpm typecheck
src/app/(marketing)/calls/[region]/page.tsx(76,37): error TS7006: Parameter 'sum' implicitly has an 'any' type.
src/app/(marketing)/calls/[region]/page.tsx(76,42): error TS7006: Parameter 'c' implicitly has an 'any' type.
src/app/(marketing)/calls/[region]/page.tsx(98,24): error TS7006: Parameter 'call' implicitly has an 'any' type.
src/lib/billing.ts(103,21): error TS7006: Parameter 'plan' implicitly has an 'any' type.
```
`prisma/seed.ts` **temiz**. Kalan 4 hata bu görevin dokunmadığı, başka ajanların commit edilmemiş
WIP dosyalarında (`src/app/(marketing)/` untracked, `src/lib/billing.ts` modified) — bu görevden ÖNCE de vardı.
`tsconfig.json` `include: ["**/*.ts"]` olduğu için `prisma/seed.ts` gerçekten typecheck kapsamında.

---

## 3. Değişen dosyalar
| Dosya | Değişiklik |
|---|---|
| `prisma/seed.ts` | `import 'dotenv/config'` + `src/lib/db.ts` istemcisinin yeniden kullanımı; `modules` dizisi modül kapsamına taşındı; `seedDemoTenant()` (seed.md §6, dev-only, idempotent) eklendi |

Uygulama kodu, `prisma/schema.prisma` ve migration'lar **değiştirilmedi**.
Ortam tarafı (repoya yazılmadı): `postgres-vector` container + `fabrika` DB + `vector` uzantısı + `db push` + `rls.sql`.

---

## 4. Riskler

1. **🔴 Yerel `fabrika` rolü SUPERUSER ve BYPASSRLS.** Doğrulandı:
   ```
   $ docker exec postgres-vector psql -U fabrika -d fabrika -tAc "select rolname, rolsuper, rolbypassrls from pg_roles where rolname='fabrika'"
   fabrika|t|t
   ```
   36 politika tabloların üzerinde DURUYOR ama bu rol onlara TABİ DEĞİL. `prisma/rls.sql`'in kendi
   başlığı da "App role must NOT have BYPASSRLS" diyor. Sonuç: **yerelde RLS izolasyonu gerçekten
   test EDİLEMEZ** — "yerelde RLS çalışıyor" diyen bir doğrulama yanlış olur. RLS Validation
   (TASK-MTPVBNU3CHC5C) için ayrı, BYPASSRLS'siz bir uygulama rolü gerekiyor. Bu görevin kapsamı dışında,
   ayrı görev olarak açılmalı.
2. **`prisma/migrations/` işlevsel değil.** İçinde tek klasör var (`add_soft_delete`), zaman damgası öneki
   ve `migration_lock.toml` yok; ayrıca `ALTER TABLE ... ADD COLUMN` idempotent değil. Bu yüzden
   `prisma migrate deploy` yolu kullanılamadı, şema `db push` ile kuruldu. Prod'a çıkmadan önce
   gerçek bir baseline migration üretilmeli.
3. `.env` parolası container rolüne uyacak şekilde ayarlandı; `.env` DEĞİŞTİRİLMEDİ. Container volume'ü
   (`fabrika_pgdata`) silinirse bu adım tekrarlanmalı (aşağıdaki runbook).
4. Demo kiracı `NODE_ENV=production` ise atlanır; yine de prod seed'i çalıştırırken NODE_ENV'in
   gerçekten `production` olduğundan emin olun.

---

## 5. Açık sorular
- Uygulamanın bağlanacağı dev rolü SUPERUSER olmayan ayrı bir rol mü olmalı (RLS'i yerelde gerçekten
  test edebilmek için)? Öneri: evet — `fabrika_app` rolü, `NOBYPASSRLS`, tablolarda yalnız DML yetkisi.
- `prisma/migrations` baseline'ı bu sprint'te mi üretilecek, yoksa prod hazırlığına mı bırakılacak?
- `docker compose up` + `db push` adımlarını `package.json`'a `db:up` script'i olarak eklemeli miyiz?
  (kapsam dışı bırakıldı, öneri olarak duruyor)

---

## 6. Sonraki adım — sıfırdan dev DB runbook

```bash
open -a Docker                                    # daemon
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"   # docker CLI PATH'te değil
docker compose up -d postgres-vector
docker exec postgres-vector psql -U fabrika -d fabrika_db -c "CREATE DATABASE fabrika OWNER fabrika"
docker exec postgres-vector psql -U fabrika -d fabrika -c "CREATE EXTENSION IF NOT EXISTS vector"
# fabrika rolünün parolasını .env'deki DATABASE_URL parolasıyla hizala (ALTER ROLE)
npx prisma generate
npx prisma db push                                # kullanıcı onayı ister (Prisma 7 AI koruması)
docker exec -i postgres-vector psql -U fabrika -d fabrika < prisma/rls.sql
pnpm db:seed
```

Ardından: (a) BYPASSRLS'siz uygulama rolü görevi, (b) baseline migration görevi.

---

## Definition of Done
- [x] `pnpm db:seed` exit 0 — gerçek çıktı §2.5'te
- [x] İki koşu → birebir aynı sayımlar (idempotent) — §2.6
- [x] `prisma/seed.ts` typecheck temiz — §2.8
- [x] RLS uygulandıktan sonra da seed geçiyor — §2.7
- [x] Mevcut veri regresyonu yok (DB sıfırdan oluşturuldu, kaybedilen veri yok)
- [x] Sır/PII sızıntısı yok (parola hiçbir çıktıda yazdırılmadı; demo e-postaları `*.test` alan adında)
- [x] Sonuç raporu + dev commit
