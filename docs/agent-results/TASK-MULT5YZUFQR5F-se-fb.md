# TASK-MULT5YZUFQR5F — FB CI son kırmızı: tests/system-scope.live.test.ts (se-fb)

Repo: `/Users/macbook/alan/FONBRIDGE` · dal `dev` · GitHub `yaslan/fonbridge` · Tarih: 29.09.2026
Commit: `6d1df9e1 test(rls): system-scope live suite brings its own two-tenant fixture (TASK-MULT5YZUFQR5F)`
CI koşusu: [36491973080](https://github.com/yaslan/fonbridge/actions/runs/36491973080)

**Sonuç:** CI'daki **Test** adımı yeşil: `Test Files 175 passed | 2 skipped (177)` ve `Tests 2014 passed | 8 skipped`, kırmızı dosya yok. `system-scope` artık seed'e bağlı değil. `beforeAll` kendi iki kiracısını kuruyor, `afterAll` bunları siliyor. Skip'e dönülmedi, rol ve CI kontrolleri aynen duruyor. İş akışı yine kırmızı, sebebi **E2E Test** adımı: 6 failed, 169 passed. Kart gereği bunlara dokunmadım, aşağıda §4'te dosya:satır ile listeledim.

## 1. Ne yapıldı

Yalnız `tests/system-scope.live.test.ts` değişti. `tests/helpers` dosyalarına gerek olmadı.

1. **Kendi fixture'ı.** `beforeAll`, `assertRlsSubjectRole`'den sonra sahip handle'ı (`DATABASE_URL`, BYPASSRLS) kullanarak iki geçici kiracı yazıyor: `t-sysscope-{a,b}-<ts>-<pid>`. Her kiracı için bir `User` ve bir `Membership` da oluşturuyor. RLS rolü başka kiracının satırını yazamaz, bu yüzden bu işi sahip handle yapıyor. Yazımdan sonra `groupBy` ile sahip handle üzerinden 2 kiracıda üyelik olduğu tekrar okunuyor, değilse test `throw` ediyor. Yazım hiçbir yerde `catch` edilmiyor. Fixture kurulamazsa dosya veritabanının kendi hatasıyla kırmızıya düşüyor.
2. **Temizlik.** `afterAll` önce `tenant.deleteMany` ile kiracıları, sonra `user.deleteMany` ile kullanıcıları siliyor. Membership kayıtları `onDelete: Cascade` ile gidiyor. Kiracı kimlikleri koşuya özgü. Test başlamadan önce de aynı silme çalışıyor, böylece test tekrar koşulabiliyor.
3. **"Run `pnpm db:seed`" bağımlılığı kaldırıldı.** `SELECT DISTINCT "tenantId"` ile kiracı keşfi ve "needs Membership rows in 2+ tenants" skip dalı silindi. Kalan skip dalları eskisi gibi: URL yoksa ya da DB erişilemiyorsa yerelde uyarı veriyor, CI'da `skipOrFailInCi` ile düşüyor.
4. **Sayım yarışı düzeltildi (yerelde bulundu).** 16 canlı dosyayı birlikte koşunca `inside the path` testi 2 koşudan 1'inde düştü (`system-scope.live.test.ts:127`). Sebep şu: `truth = admin.membership.count()` bütün tabloyu sayıyordu. Aynı anda koşan canlı dosyalar (gdpr-data-subject, registration-consent, weekly-active-users, relationship-owner-assignment) Membership yazıyor, bu yüzden sayı iki okuma arasında değişebiliyordu. Artık hem `truth` hem kapsamlı okuma `where: { tenantId: { in: FIXTURE_TENANTS } }` ile sınırlı. Ölçülen özellik değişmedi: bağlantıda `app.tenant_id` yok, buna rağmen kapsam iki ayrı kiracının satırlarını tam sayıda görüyor. Bir kontrol de sıkılaştırıldı: iki fixture kiracısının da görülmesi ayrıca doğrulanıyor. Kapsam dışındaki okumada 0 satır beklentisi hâlâ **bütün tabloya** bakıyor.

## 2. Kanıt

### 2.1 CI — koşu 36491973080 (commit `6d1df9e1`)

```
success Prepare database · success Lint · success Typecheck · success Test
success Install Playwright browsers · failure E2E Test
```

Test adımı (ANSI kodları temizlendi):

```
 ✓ tests/system-scope.live.test.ts (6 tests) 513ms
 Test Files  175 passed | 2 skipped (177)
      Tests  2014 passed | 8 skipped (2022)
```

Önceki koşu [36490945769](https://github.com/yaslan/fonbridge/actions/runs/36490945769): `Test Files 1 failed | 174 passed`.

### 2.2 Yerel — boş DB, seed YOK, `CI=1`

Kurulum: scratchpad'de `origin/dev` üzerinden ayrık worktree (`.env` yok), `node_modules` symlink ile bağlandı. Yalnız bana ait `pgvector/pgvector:pg16` konteyneri `:55437`'de koştu (`sefb-sysscope-pg`). İş bitince silindi (`docker ps -a` → 0). Paylaşılan `fabrika-postgres`'e ve `:3000`'e dokunulmadı. Sıra CI ile aynı, yalnız seed yok: `prisma db push` → `db:rls-role` → `db:rls` (`Policies in public: 0 → 112`).

| Durum                                                       | Sonuç                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Değişiklikten önce, boş DB (kırmızıyı üretme)               | `refusing to skip in CI — needs Membership rows in 2+ tenants; found 0` · 1 failed                |
| Değişiklikten sonra, boş DB (`Tenant/Membership = 0/0`)     | `Test Files 1 passed (1) · Tests 6 passed (6)`                                                    |
| Koşudan sonra kalan veri (`Tenant/User/Membership`)         | `0/0/0`, fixture temizlendi                                                                       |
| Mutasyon: fixture yalnız 1 kiracı yazıyor                   | `fixture wrote memberships in 1 of 2 tenants` · 1 failed                                          |
| Negatif: `DATABASE_URL_RLS_TEST` = superuser `fabrika`      | `connected as "fabrika" (rolsuper=true, rolbypassrls=true) … would pass vacuously` · 1 failed     |
| Negatif: DB erişilemiyor                                    | `refusing to skip in CI — database unavailable` · 1 failed                                        |
| Seed'li DB, 16 `*.live.test.ts` birlikte, 5 kez             | 5/5 kez `Test Files 16 passed (16)`. Yarış düzeltmesinden önce 2 koşudan 1'i `:127`'de kırmızıydı |
| `eslint tests/system-scope.live.test.ts` · `pnpm typecheck` | exit 0 · exit 0                                                                                   |

## 3. Değişen dosyalar

- `tests/system-scope.live.test.ts` (+52 / −20)
- `docs/agent-results/TASK-MULT5YZUFQR5F-se-fb.md` (bu rapor)

## 4. E2E durumu (koşu 36491973080) — DÜZELTİLMEDİ, kapsam dışı

Özet: `6 failed · 1 skipped · 2 did not run · 169 passed (16.0m)`.

| #   | Dosya:satır                                             | Hata                                                                                                       |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | `tests/e2e/auth.spec.ts:37`                             | `page.waitForLoadState: Test timeout of 60000ms exceeded` ("should redirect to auth provider on click")    |
| 2   | `tests/e2e/auth.spec.ts:64`                             | aynı timeout ("the provider flow does not start until the disclosure is acknowledged")                     |
| 3   | `tests/e2e/evidence-fabrication.spec.ts:35`             | `prisma.moduleState.upsert()` → FK `ModuleState_tenantId_fkey` (test :58)                                  |
| 4   | `tests/e2e/evidence-unverified-badge.spec.ts:53`        | `prisma.moduleState.upsert()` → FK `ModuleState_tenantId_fkey` (test :88)                                  |
| 5   | `tests/e2e/invoice-foreign-currency-export.spec.ts:252` | `expect(received).rejects.toThrow()`: DB, kuru olmayan döviz faturasını reddetmedi (test :230)             |
| 6   | `tests/e2e/m8-matching.spec.ts:102`                     | `prisma.cordisParticipation.createMany()` → FK `CordisParticipation_projectId_fkey` (test :212, seed :161) |

Gözlem (varsayım, doğrulanmadı): #3, #4 ve #6'daki FK hataları, bu E2E spec'lerinin de var olmayan kiracı ya da proje satırlarına güvendiğini düşündürüyor. Bu, `system-scope`'taki "paylaşılan veriye güvenme" sorununun aynısı olabilir. #5 bir DB kısıtının CI şemasında olmamasıyla açıklanabilir: CI `db push` kullanıyor, elle yazılmış SQL migration'ları uygulanmıyor olabilir. Log'da ayrıca `[users-scheduled-deletion] … NullConstraintViolation` görünüyor, ama ilgili spec (`purge-failure-alert-console.spec.ts:95`) geçti. Bu satır beklenen bir hata senaryosunun log'u olabilir.

## 5. Riskler

- Fixture kullanıcılarının e-postaları `u-t-sysscope-…@system-scope.test` biçiminde (`.test` TLD'si, gerçek kişi değil). Test yarıda kesilirse (SIGKILL) satırlar DB'de kalabilir. Kimlikler koşuya özgü olduğu için sonraki koşuları etkilemez. CI DB'si zaten atılıyor.
- Kapsam dışındaki okumada tüm-tablo `count() === 0` beklentisi paralel yazımlardan etkilenmez, çünkü RLS altında sonuç her durumda 0.
- Paylaşılan ağaç: ana ağaçta `dev`, origin'in önündeydi (`56890f1f`, `91f4752a`, sonra crw-fb'nin `ea1dab82`, `64d30c95`; başkalarının pushlanmamış işleri). Onları pushlamamak için kod commit'ini `origin/dev`'den açtığım ayrık worktree'den `git push origin HEAD:dev` ile gönderdim (fast-forward `cd895589..6d1df9e1`). Bu rapor ana ağaçta yerel commit olarak duruyor ve pushlanmadı, çünkü push o commit'leri de götürürdü.

## 6. Açık sorular

- E2E'deki 6 kırmızı için ayrı kart gerekli. Önerim: #3, #4 ve #6 için spec içi fixture kurulmalı, #5 için CI'daki şema adımının DB kısıtını içerip içermediğine bakılmalı.

## 7. Sonraki adım

- E2E kartı açılsın (yukarıdaki tablo girdi olarak kullanılabilir).
- Ana ağaçtaki yerel commit'ler (`56890f1f`, `91f4752a`, `ea1dab82`, `64d30c95` ve bu raporun commit'i) sahipleri tarafından `git pull --rebase` ile pushlanacak.

**Platform beyanı:** macOS'ta (Darwin 27, Docker pgvector pg16) ve GitHub Actions `ubuntu-latest` üzerinde (Linux, koşu 36491973080) doğrulandı. Windows'ta koşulamadı, bu makinede Windows yok. Değişen kod yalnız Prisma sorguları ve `process.pid` / `Date.now()` kullanıyor: dosya yolu, kabuk ya da süreç yönetimi yok. Bu yüzden platforma bağlı bir yol yok ve Windows'ta farklı davranması için koddan görünen bir sebep yok.
