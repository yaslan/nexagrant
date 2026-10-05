# TASK-MULS4C0R8EEIE: PlanVersion.updatedAt şema ↔ migration hizalaması (be-fb)

## 1. Ne yapıldı

- `prisma/schema.prisma` içinde `add-plan-versioning` migration'ının oluşturduğu üç tablonun `updatedAt` alanı `@updatedAt` iken `@default(now()) @updatedAt` oldu: `PlanVersion`, `PlanFeature`, `PlanAssignment`. Migration üçüne de `DEFAULT CURRENT_TIMESTAMP` veriyor (`prisma/migrations/add-plan-versioning/migration.sql:48,62,74`). Şema bu default'u tanımlamadığı için CI'daki `prisma db push` sütunu default'suz kuruyordu.
- Yeni migration yazılmadı. Yerel DB'de üç sütunun default'u zaten `CURRENT_TIMESTAMP`, şema artık migration'la aynı şeyi söylüyor. Değişiklik yalnız ekleme yapıyor ve idempotent; veri etkisi yok.
- Test dosyası (`tests/plan-entitlement-version.spec.ts`) değiştirilmedi.
- `prisma format` dosyanın tamamını yeniden biçimlendiriyordu (1270 satırlık diff). Bu yüzden geri alındı ve yalnız 3 satır elle değiştirildi.

## 2. Kanıt

**Yerel DB (`fabrika`, :5433): default zaten var**

```
PlanAssignment|updatedAt|CURRENT_TIMESTAMP|NO
PlanFeature|updatedAt|CURRENT_TIMESTAMP|NO
PlanVersion|updatedAt|CURRENT_TIMESTAMP|NO
```

**`prisma migrate diff --from-config-datasource --to-schema …` (yerel DB → şema)**

- Eski şema (HEAD): `ALTER TABLE "PlanAssignment" ALTER COLUMN "updatedAt" DROP DEFAULT;` ve aynı satır `PlanFeature` ile `PlanVersion` için. Eski şema, DB'deki default'u silmek istiyordu.
- Yeni şema: Plan* tablolarında `updatedAt` farkı yok.

**Boş geçici DB'de CI adımları** (`prisma db push` → `db:rls-role` → `db:rls` → `db:seed`, `CI=true`)

- Yeni şema: `updatedAt` default'u `CURRENT_TIMESTAMP` (3 tablo).
  ```
  pnpm exec vitest run plan-entitlement-version
   Test Files  1 passed (1)
        Tests  8 passed (8)
  ```
- Negatif kontrol (eski şema ile ikinci boş DB): `PlanVersion.updatedAt` default'u boş.
  ```
  Raw query failed. Code: `23502`. Message: `null value in column "updatedAt" of relation "PlanVersion" violates not-null constraint`
   Test Files  1 failed (1)
        Tests  8 skipped (8)
  ```
  CI'daki hata böylece yerelde yeniden üretildi ve düzeltmenin onu giderdiği görüldü.
- Tam paket (`CI=true pnpm test`, yeni şemalı geçici DB): `Test Files 1 failed | 174 passed | 2 skipped (177)`, `Tests 2008 passed | 14 skipped`. Tek kırmızı dosya aşağıda (§4).
- Geçici DB'ler (`fabrika_befb_tmp_*`, `*_old`) `DROP DATABASE … WITH (FORCE)` ile silindi; `pg_database` sayımı 0.

**GitHub CI**: §7'de.

## 3. Değişen dosyalar

- `prisma/schema.prisma` (3 satır)
- `docs/agent-results/TASK-MULS4C0R8EEIE-be-fb.md`

## 4. Riskler / kapsam dışı bulgular (dokunulmadı)

- `tests/system-scope.live.test.ts:78`: boş DB + `db:seed` sonrası CI modunda şu hatayla düşüyor: `refusing to skip in CI — needs Membership rows in 2+ tenants; found 1. Run pnpm db:seed.` (`tests/helpers/live-db-role.ts:52`). Seed yalnız bir tenant'a Membership yazıyor. Bu şema değişikliğiyle ilgili değil ve GitHub CI'da da aynı sonucu vermesi beklenir. Düzeltme seed tarafında, ayrı bir iş.
- Aynı `migrate diff` şemayla migration arasında başka iki sapma da gösteriyor: `PlanVersion.modules` sütununda `DROP DEFAULT` ve Plan*/Subscription FK'lerinin yeniden kurulması. Bu kartın kapsamı dışında, dokunulmadı.
- Bilinen: tam `.env` yüklüyken `src/lib/calendar/__tests__/{encryption,sync}.test.ts` içinde 3 test düşüyor (fe-fb raporu). Dokunulmadı. Bu koşuda `.env` source edilmediği için görülmedi.
- Prisma client'ı `pnpm db:generate` ile yeniden üretildi. :3000 dev sunucusunun yeniden başlatılması leed-fb'den istendi.

## 5. Açık sorular

- `system-scope.live` için seed'e ikinci bir tenant Membership'i eklensin mi? Karar seed sahibinde.

## 6. Sonraki adım

- CI'daki Test adımının sonucu §7'de. Kalan kırmızılar orada dosya:satır ile listeli.

## 7. GitHub CI

(push sonrası dolduruldu, aşağıya bakın)

**Platform beyanı:** Doğrulama macOS'ta (Darwin 27, Docker `fabrika-postgres` pg) yapıldı; GitHub CI ubuntu-latest'te koşuyor. Değişiklik yalnız Prisma şema default'u, platforma bağlı kod yolu yok; Windows koşulmadı, çünkü etkisi DB DDL'i ile sınırlı ve platformdan bağımsız.
