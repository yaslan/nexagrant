---
name: fabrika-run-a-handler-under-the-rls-role
description: Fabrika'da bir handler'ı fabrika_app rolü altında koşturmak için process.env.DATABASE_URL'i @/lib/db yüklenmeden ÖNCE değiştir — ve ayrıcalıklı URL'i o satırdan önce yakala, yoksa admin istemcin de RLS rolüne bağlanır
metadata:
  type: reference
  updatedAt: 2026-09-10
---

`src/lib/billing/**`, `src/lib/iyzico.ts`, cron işleri — hepsi `@/lib/db`'nin
`prisma` singleton'ını **modül kapsamında** alıyor ve o singleton bağlantı
dizesini `process.env.DATABASE_URL`'den **modül yüklenirken bir kez** okuyor.
Enjeksiyon noktası yok. Yerelde `DATABASE_URL` = `fabrika` (SUPERUSER +
BYPASSRLS), yani o yolla yapılan her "RLS çalışıyor" ölçümü GEÇERSİZDİR.

Rolü değiştirmenin tek yolu: `process.env.DATABASE_URL`'i `@/lib/db` **hiç
yüklenmeden önce** `DATABASE_URL_RLS_TEST` ile değiştirmek, sonra modülü
dinamik import etmek.

**tsx sondasında** (`.qa-scratch/`, gitignore'lu):
```ts
process.env.DATABASE_URL = envValue('DATABASE_URL_RLS_TEST');   // ÖNCE
const db = await import('@/lib/db');                            // SONRA
const admin = db.createDbClient(PRIV_URL);                      // fixture + sayım
```
tsx `tsconfig.json`'daki `@/*` paths'ini çözüyor; ama üst-seviye `await`
"cjs output" hatası veriyor — `async function main()` içine al.

**vitest'te** (kalıcı test): imports hoist olduğu için tek yer `vi.hoisted`, ve
async olması gerekiyor çünkü `require()` eslint'te hata
(`@typescript-eslint/no-require-imports`):
```ts
const { rlsUrl, ownerUrl } = await vi.hoisted(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');   // ÖNCE yakala
  const rlsUrl = read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});
```
Örnek: `tests/stripe-webhook-idempotency-rls.live.test.ts`.

**Why:** iki tuzak yüzünden bu tarif yazıya değer.

1. `tests/helpers/dotenv.ts`'in `envValue()`'su **önce `process.env`'e bakıyor**.
   Rolü değiştirdikten sonra `envValue('DATABASE_URL')` çağırırsan RLS URL'ini
   geri alırsın; fixture'ları yazacak "admin" istemcin de `fabrika_app` olur ve
   `beforeAll` daha ilk `plan.create`'te `42501 new row violates row-level
   security policy` ile patlar. Ayrıcalıklı URL swap satırından ÖNCE yakalanmalı.
2. Fixture yazma ve satır sayma ayrıcalıklı rolde kalmalı; yalnız **test edilen
   handler** RLS rolünde koşmalı. Aksi hâlde neyi ölçtüğün belirsizleşir.

**How to apply:** Dosyanın ilk testi rolün gerçekten NOBYPASSRLS olduğunu SERT
biçimde doğrulasın (`select current_user, rolsuper, rolbypassrls`) — BYPASSRLS bir
rolde geçen bir dosya, geri kalan iddiaların hiçbirini ölçmez. `describe.skipIf`
ile DB yoksa atla, ama DB varken bu tek testi asla atlama.

Handler ortasında çökmeyi ölçmek için geçici bir `BEFORE INSERT` trigger'ı yaz ve
**yalnız kendi koşunun satırlarını** hedefle (`NEW."target" = '<run id>'`);
`finally` içinde düşür. Paylaşılan dev DB'de yetki `REVOKE` etme — komşuların
testleri kırılır.

İlgili: [[fabrika-a-done-marker-needs-a-tenant-isolation-table]] ·
[[fabrika-hand-applied-migration-and-prisma-migrations-table]]
