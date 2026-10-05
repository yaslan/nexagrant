---
name: fabrika-rls-bypass-local-dev
description: Local fabrika DB role is SUPERUSER+BYPASSRLS so RLS is never enforced — measure isolation through the fabrika_app role (pnpm db:rls-role), never through DATABASE_URL
metadata:
  type: project
  updatedAt: 2026-09-06
---

Yerel `postgres-vector` container'ındaki `fabrika` rolü **SUPERUSER + BYPASSRLS**
(`SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='fabrika'` → `t|t`).
Politikalar `pg_policies`'de görünür ama bu rol üzerinde **hiç uygulanmaz**: ölçüldü,
`app.tenant_id` set edilmemişken bile `SELECT count(*) FROM "Workspace"` → 12.

Sonuç: "RLS politikası var" ≠ "RLS çalışıyor". `pg_policies` sayımı kanıt değildir ve
`fabrika` bağlantısı üzerinden yazılmış her izolasyon testi **yalancı yeşildir**.

## Kalıcı çözüm (TASK-MTQ0BIV9UXVRU ile geldi — artık geçici probe rolü açma)

```bash
pnpm db:rls-role            # fabrika_app: LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB
                            # NOCREATEROLE, yalnız DML (TRUNCATE ve schema CREATE YOK).
                            # Parolayı üretip DATABASE_URL_RLS_TEST olarak .env'e yazar.
pnpm db:rls-role:rollback   # rolü ve tüm yetkilerini geri alır, veri silmez
```
Kaynak: `prisma/rls-app-role.sql` + `-rollback.sql`, sürücü `scripts/setup-rls-role.ts`.
Parola `.sql` dosyasında değil; `set_config('fabrika.app_password', $1, false)` ile
bind parametresi olarak taşınır. Script localhost dışındaki DB'yi reddeder.

Aynı sorgu `fabrika_app` oturumunda: tenant GUC yokken **0**, `demo-tenant`'a set
edilince **1**. 12 → 0/1/1 farkı RLS'in ölçülebilir olduğunun kanıtı.

## RLS testi yazarken

Fixture'ları ayrıcalıklı `prisma` singleton'ıyla yaz, **iddiaları** RLS'e tabi
bağlantıdan oku: `createDbClient(DATABASE_URL_RLS_TEST)` + `withTenantOn(client, …)`
(`src/lib/db.ts`; `withTenant` bunun singleton üzerindeki sarmalayıcısı).
Örnek: `tests/rls.spec.ts`, .env'i `tests/helpers/dotenv.ts` ile tek anahtar okur
(vitest .env yüklemez).

Testin başına **muhafız** koy:
`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user` — ikisi de
`false` değilse geri kalan iddialar hiçbir şey kanıtlamaz. Hem USING (okuma) hem
WITH CHECK (başka kiracıya yazma reddi) yönünü test et; biri geçip diğeri kalabilir.
Ayrıca mutlak sayı bekleme — kendi kiracısının satırını görüp görmediğine bak.

**Testin ayırt ettiğini doğrula:** spec'i bilerek `DATABASE_URL`'e yönlendir
(`DATABASE_URL_RLS_TEST=<DATABASE_URL> npx vitest run tests/rls.spec.ts`).
4/4 düşmüyorsa test bir şey ölçmüyordur.

## Ana bağlantı hâlâ BYPASSRLS — bilinçli

Uygulamanın `DATABASE_URL`'i kasten `fabrika` rolünde bırakıldı: `withTenant()` yalnız
**4 çağrı yerinde** kullanılıyor (`grep -rl withTenant src` → 5, biri db.ts'in kendisi)
ve `demo-tenant` geri düşüşü **46 yerde** var. Ana bağlantıyı NOBYPASSRLS role çevirmek
bu ikisi temizlenmeden yerel geliştirmeyi geniş çapta kırar. Sıra: withTenant kapsamını
yay → demo-tenant fallback'lerini temizle → DATABASE_URL'i çevir → DATABASE_URL_RLS_TEST'i
kaldır. Önkoşul: TASK-MTQ5Y8EPT7FDA.

Tuzak: `.env.example` `.gitignore`'daki `.env*` deseni yüzünden **izlenmiyor**, yani
oraya yazdığın yeni ortam değişkeni repoda keşfedilemez — `docs/` içine de yaz.

İlgili: [[fabrika-withtenant-set-config]] · [[fabrika-local-dev-db]] · [[fabrika-known-failing-tests]]
