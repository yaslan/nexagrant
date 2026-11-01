# TASK-MULSMP4IFCB6B — FB CI RLS ROLÜ (devop-fb)

Repo: `/Users/macbook/alan/FONBRIDGE` · dal `dev` · GitHub `yaslan/fonbridge` · Tarih: 29.09.2026
Commit: `2d94335c ci: create the fabrika_app RLS test role before db:rls (TASK-MULSMP4IFCB6B)`
CI koşusu: [36490204589](https://github.com/yaslan/fonbridge/actions/runs/36490204589)

**Sonuç:** CI artık `fabrika_app` rolünü kuruyor (NOSUPERUSER, NOBYPASSRLS) ve `DATABASE_URL_RLS_TEST` job env'inde tanımlı. 7 RLS dosyasından 6'sı CI'da gerçekten koştu ve geçti: 31 test, hiçbiri skip değil. 7. dosya `system-scope` CI'da "refusing to skip" ile düşüyor. Sebep rol değil, test verisi: seed yalnız 1 kiracı üretiyor, test en az 2 kiracı istiyor (§4). Kapsam dışı olduğu için düzeltmedim, dosya:satır ile raporluyorum. Test adımındaki öteki kırmızı dosya beklenen `PlanVersion.updatedAt` hatası (TASK-MULS4C0R8EEIE); ona dokunulmadı.

## 1. Ne yapıldı

Yalnız `.github/workflows/ci.yml` değişti (+12 satır):

1. Job env'ine `DATABASE_URL_RLS_TEST: postgresql://fabrika_app:fabrika_app_ci@localhost:5432/fabrika` eklendi. Parola, servis konteynerindeki `fabrika:fabrika` gibi atılabilir bir test değeri. Gerçek sır değil.
2. `Prepare database` adımına `pnpm db:rls-role` eklendi. Sıra: `prisma db push` → **`db:rls-role`** → `db:rls` → `db:seed`.

**Sıra neden önemli (yerelde bulundu).** Kart "Prepare database'den sonra" diyordu. Rolü bu şekilde, `db:rls`'ten SONRA kurunca temiz DB'de 5 test `permission denied for function enter_system_scope` hatası verdi. Sebep `prisma/rls.sql:174-179`: EXECUTE izni `fabrika_app` için yalnız rol o anda **varsa** veriliyor. Geliştirici makinesinde rol önceden kurulu olduğu için bu hata görünmüyordu. Çözüm olarak rol `db push`'tan sonra kuruluyor, çünkü tablo grant'leri için tabloların var olması gerekiyor. `db:rls`'ten önce kurulması da EXECUTE iznini alabilmesi için gerekli. Gerekçe ci.yml'de yorum olarak yazılı.

`scripts/setup-rls-role.ts` değiştirilmedi. Parolayı zaten `process.env.DATABASE_URL_RLS_TEST`'ten okuyor, env tanımlı olduğunda `.env`'e yazmıyor, yalnız localhost'a izin veriyor ve rol superuser ya da bypassrls çıkarsa işi durduruyor.

## 2. Kanıt

### 2.1 CI — koşu 36490204589 (commit `2d94335c`)

```
✓ Install pnpm · ✓ Use Node.js · ✓ Install dependencies · ✓ Validate Prisma schema
✓ Generate Prisma client · ✓ Prepare database · ✓ Lint · ✓ Typecheck · X Test
```

`Prepare database` log'u (rol NOBYPASSRLS ve giriş yapabiliyor):

```
│ 0       │ 'fabrika_app' │ false    │ false        │ true        │ false       │ false         │
            rolname         rolsuper   rolbypassrls   rolcanlogin   rolcreatedb   rolcreaterole
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
```

`Test` log'u, 7 RLS dosyası (ANSI kodları temizlendi):

```
 ✓ tests/stripe-webhook-idempotency-rls.live.test.ts (7 tests) 640ms
 ✓ tests/iyzico-webhook-idempotency-rls.live.test.ts (6 tests) 521ms
 ✓ tests/pipeline-surface-tenant-scope.live.test.ts (5 tests) 201ms
 ✓ tests/stripe-event-retention.live.test.ts (5 tests) 219ms
 ✓ tests/registration-consent.live.test.ts (4 tests) 550ms
 ✓ tests/billing-k1-tenant-scope.live.test.ts (4 tests) 265ms
 ❯ tests/system-scope.live.test.ts (6 tests | 6 skipped) 381ms
Error: system-scope live test: refusing to skip in CI — needs Membership rows in 2+ tenants; found 1. Run `pnpm db:seed`.. …
 ❯ tests/system-scope.live.test.ts:78:5

 Test Files  2 failed | 171 passed | 2 skipped (175)
      Tests  1979 passed | 27 skipped (2006)
```

Öteki kırmızı dosya `tests/plan-entitlement-version.spec.ts:57`: `null value in column "updatedAt" of relation "PlanVersion"`. Bu TASK-MULS4C0R8EEIE'nin kapsamında, dokunulmadı.

Karşılaştırma: bir önceki koşuda ([36488340685](https://github.com/yaslan/fonbridge/actions/runs/36488340685), rol yoktu) 6 RLS dosyası "refusing to skip" ile düşüyor ya da hiç koşmuyordu. Şimdi 31 RLS testi gerçekten koşup geçiyor.

### 2.2 Yerel — temiz klon + yalıtılmış geçici DB (CI adımlarının aynısı)

Temiz klon scratchpad'de açıldı, `.env` yoktu. Yalnız bana ait `pgvector/pgvector:pg16` konteyneri `:55433`'te koştu. Paylaşılan `fabrika-postgres`'e ve `:3000`'e dokunulmadı. İş bitince konteyner ve klon silindi. `CI=true`.

a) İlk sıra (`db:rls` → `db:seed` → `db:rls-role`): 7 dosyadan 3'ü kırmızı. Bu sonuç sıralama hatasını ortaya çıkardı.

```
FAIL tests/billing-k1-tenant-scope.live.test.ts > recordLifetimeLicence writes the licence under the RLS role
  cause: permission denied for function enter_system_scope (42501)
FAIL tests/stripe-event-retention.live.test.ts  (4 test, aynı hata)
 Test Files  3 failed | 4 passed (7) · Tests  5 failed | 26 passed | 6 skipped (37)
```

b) Düzeltilmiş sıra (`db push` → `db:rls-role` → `db:rls` → `db:seed`), DB sıfırdan kuruldu:

```
✅ prisma/rls.sql applied. Policies in public: 0 → 112
 FAIL tests/system-scope.live.test.ts — refusing to skip in CI — needs Membership rows in 2+ tenants; found 1
 Test Files  1 failed | 6 passed (7) · Tests  31 passed | 6 skipped (37)
```

Sonuç CI ile birebir aynı. Idempotency de sınandı: `pnpm db:rls-role` ikinci kez koşunca yine exit 0 verdi ve `.env` oluşmadı. DB'de `select "tenantId",count(*) from "Membership"` sorgusu `demo-tenant|11` döndü; `Tenant` sayısı 1.

## 3. Değişen dosyalar

- `.github/workflows/ci.yml`
- `docs/agent-results/TASK-MULSMP4IFCB6B-devop-fb.md` (bu rapor)

## 4. Riskler / açık bulgular

- **`system-scope` CI'da kırmızı (gerçek bir bulgu, rol sorunu değil).** Hata `tests/system-scope.live.test.ts:74-78` noktasında: `beforeAll` en az 2 kiracıda Membership arıyor. `prisma/seed.ts` ve `prisma/seed-tenant-workspace.ts` yalnız `demo-tenant` üretiyor. Geliştirici DB'sinde ise elle eklenmiş 7 kiracı var (`prisma/rls.sql:108` yorumu: "17 Membership rows across 7 tenants"). Hata mesajındaki öneri ("Run `pnpm db:seed`") temiz DB'de sorunu çözmüyor. Önerilen çözüm (se-fb, testin sahibi): test kendi ikinci kiracı fikstürünü kursun ya da seed'e ikinci bir kiracı eklensin. CI'da elle SQL ile sahte kiracı eklemedim; kapıyı sahte veriyle yeşillemek olurdu.
- **Yerel ortamlar da aynı tuzağa düşebilir.** `db:rls-role`'ü `db:rls`'ten sonra koşan geliştirici `permission denied for function enter_system_scope` hatası alır. Rolü kurduktan sonra `pnpm db:rls` yeniden koşulunca düzeliyor. README sırası belgelenmeli. Bu değişiklik src/scripts dışı olduğu için kapsamın dışında kaldı.
- Rapor talimatında ikinci bir yol vardı: `/Users/macbook/alan/docs/agent-results/TASK-MULRU574R88BA-se-fb.md`. Bu, se-fb'nin başka bir görevinin rapor adı. Onun yerine kartta belirtilen kendi yoluma yazdım, başkasının raporunu oluşturmadım ya da üzerine yazmadım.

## 5. Geri alma

`git revert 2d94335c` ve dev'e push. Rol yalnız CI'daki atılabilir servis konteynerinde yaşıyor, kalıcı bir altyapı değişikliği yok. Yerelde `pnpm db:rls-role:rollback` kullanılabilir.

## 6. Sonraki adım

1. se-fb: `system-scope` testi için ikinci kiracı fikstürü (yukarıda).
2. se-fb / fe-fb: `PlanVersion.updatedAt` (TASK-MULS4C0R8EEIE).
3. İkisi kapanınca CI'da `Test` yeşile dönmeli, ardından ilk kez `E2E Test` koşacak. devop-fb o koşuyu izler.
4. devop-fb sırası: TASK-MULRUCLPGIVIL (K-8). Bu delegasyonda yapılmadı.

## Platform beyanı

- **Linux:** CI'da doğrulandı (GitHub Actions `ubuntu-latest`, koşu 36490204589).
- **macOS:** Yerelde doğrulandı (Darwin 27.0.0, Docker `pgvector:pg16`, temiz klon).
- **Windows:** Koşulmadı. Workflow yalnız `ubuntu-latest` kullanıyor ve Postgres servis konteyneri Linux runner gerektiriyor. Değişen adımlar (`pnpm db:rls-role`, env değişkeni) platformdan bağımsız: süreç öldürme, dosya yolu ayrımı ya da kabuk özelliği içermiyor.
