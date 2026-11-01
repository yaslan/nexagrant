---
name: fabrika-rls-check-is-declaration-not-behaviour
description: '`pnpm rls:check` yeşilken izolasyon ölçülmemiş olabilir — davranışı `pnpm rls:verify` + tests/rls.spec.ts ölçer; 2026-09-07''de bunlar 42501 (şema yetkisi yok) ile kırmızıydı'
metadata:
  type: reference
updatedAt: 2026-09-07
---

`pnpm rls:check` **beyanı** doğrular ("39 kiracıya özel modelin hepsinde RLS politikası
kayıtlı"), **davranışı** değil — çıktısının kendisi bunu yazar:
*"(Declared, not measured — `pnpm rls:verify` asks the database.)"*
Kiracı izolasyonunun gerçekten uygulandığını yalnız `pnpm rls:verify` (`scripts/check-rls-live.ts`)
ve `tests/rls.spec.ts` ölçer.

2026-09-07 teşhisi: `tests/rls.spec.ts` 2 kırmızıydı ve sebep "docker/postgres yok" DEĞİLDİ.
DB ayaktaydı, `DATABASE_URL_RLS_TEST` (`fabrika_app`, NOBYPASSRLS) `.env`'de vardı; hata:
```
Database error. Code: `42501`. Message: `permission denied for schema public`
```
Kök neden: `scripts/setup-rls-role.ts` rolü oluşturup `.env`'e yazıyor ama role hiçbir
`GRANT` vermiyor (`grep -n "GRANT" scripts/setup-rls-role.ts` → sıfır eşleşme). Rol sorguyu
çalıştıramadığı için RLS politikası hiç devreye girmiyor. Kart: TASK-MTRGJ80LV3R7I.

**Why:** Kırmızı bir testi "ortam sorunu, DB yok" diye geçiştirmek CLAUDE.md §1'in en sert
kuralını kanıtsız bırakır. 42501 bir bağlantı hatası değil, YETKİ hatasıdır — teşhisi
hata KODUNDAN yap, tahminden değil.

**How to apply:** RLS kırmızısında önce `pnpm test tests/rls.spec.ts` tam çıktısını oku.
Test `DATABASE_URL_RLS_TEST` yoksa SKIP eder — "failed" görüyorsan rol vardır, sorun
başkadır. Rolü `BYPASSRLS`/superuser yaparak yeşile alma; testin tüm anlamı NOBYPASSRLS
olmasıdır. İlgili: [[fabrika-shared-dev-db-can-be-reset-under-you]]
