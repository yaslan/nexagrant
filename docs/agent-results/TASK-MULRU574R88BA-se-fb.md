# TASK-MULRU574R88BA — K-6: canlı testlerin rol doğrulaması ve CI'da sessiz atlamanın kapatılması (se-fb)

Kaynak bulgu: `docs/agent-results/TASK-MULQLVLW21FE2-crw-fb.md` K-6. Dal: `dev`.

## Ne yapıldı

Yeni ortak yardımcı: `tests/helpers/live-db-role.ts`.

- `assertRlsSubjectRole(client, suite)`: Bağlı rol `rolsuper` ya da `rolbypassrls` ise hata fırlatır. RLS'i ölçen her dosyada modül seviyesinde ya da `beforeAll` içinde çağrılıyor. Bu yüzden rol yanlışsa tek bir test değil, **dosyanın tamamı** kırmızıya düşüyor.
- `requireRlsTestUrl(url, suite)` ve `skipOrFailInCi(suite, reason)`: `CI` tanımlıysa (`''`, `0` ve `false` dışında bir değer) eksik `DATABASE_URL_RLS_TEST` ve erişilemeyen Postgres **hata** veriyor. Yerelde eski davranış sürüyor: uyarı basılıyor, test atlanıyor.
- `assertAppOwnerRole(client, suite)`: Ters yöndeki yanlış yeşil için. Bazı canlı testler RLS'i değil uygulama kodunun kendi kiracı kontrolünü ölçüyor ve bu yüzden bilerek uygulama rolüyle (BYPASSRLS) koşuyor. Gerekçe `concept-template-tenant-scope.live.test.ts` başlığında yazılı. Bu dosyalar RLS'e tabi bir role bağlanırsa kontrolü politika yapar ve test, kod hiç sınanmadan geçer. Yardımcı bu durumda hata fırlatıyor.

Canlı testlerin hepsi (B1 dosyası hariç) bu yardımcıyı kullanıyor.

| Dosya                                                                                                                                                                                 | Mod                                        | Ek düzeltme                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| billing-k1-tenant-scope                                                                                                                                                               | RLS-subject (swap edilmiş `prisma` tekili) | —                                                                                                                                                                      |
| stripe-event-retention                                                                                                                                                                | RLS-subject (swap edilmiş `prisma` tekili) | —                                                                                                                                                                      |
| iyzico-webhook-idempotency-rls                                                                                                                                                        | RLS-subject                                | `DATABASE_URL_RLS_TEST` artık `process.env`'den de okunuyor. Önceden yalnız `.env` dosyasına bakıyordu, bu yüzden `.env` olmayan CI'da her zaman sessizce atlanırdı.   |
| stripe-webhook-idempotency-rls                                                                                                                                                        | RLS-subject                                | aynı `process.env` düzeltmesi                                                                                                                                          |
| pipeline-surface-tenant-scope                                                                                                                                                         | RLS-subject                                | —                                                                                                                                                                      |
| registration-consent                                                                                                                                                                  | RLS-subject (izolasyon kolu)               | —                                                                                                                                                                      |
| system-scope                                                                                                                                                                          | RLS-subject                                | **Gizli yanlış yeşil kapatıldı:** BYPASSRLS rol eskiden `skipReason` atıyordu ve 6 testin hepsi `expect(skipReason).toBeTruthy()` ile **geçti** olarak raporlanıyordu. |
| calendar-token-db, concept-template-tenant-scope, gdpr-data-subject, m9-calendar-tenant-scope, relationship-owner-assignment, stripe-webhook-idempotency, stripe-webhook-tenant-scope | app-owner (BYPASSRLS olmalı)               | erişilemeyen Postgres CI'da hata veriyor                                                                                                                               |

Kapsam dışında kalanlar:

- `tests/marketplace-*.live.test.ts`: leed-fb'nin talimatıyla dokunulmadı. Dosyalar iş sırasında fe-fb tarafından silindi (`ae1615eb`).
- `tests/agency-invite.live.test.ts` (be-fb, B1): kurala uyularak değiştirilmedi. Bkz. Açık sorular.

## Kanıt

Ortam: macOS, `fabrika-postgres` Docker konteyneri (`localhost:5433`). Parolalar maskelendi.

**1. Doğru ortamda yeşil (CI=1 ile birlikte).** `DATABASE_URL`=fabrika, `DATABASE_URL_RLS_TEST`=fabrika_app:

```
CI=1 npx vitest run <14 canlı dosya>
 Test Files  14 passed (14)
      Tests  86 passed (86)          # 0 skipped
```

Değişiklik öncesi temel koşuda 16 dosya ve 100 testin hepsi geçiyordu. Aradaki fark, sonradan silinen 2 marketplace dosyası.

**2. Mutasyon: RLS dosyaları BYPASSRLS role bağlandı → 7/7 kırmızı.**

a) `DATABASE_URL_RLS_TEST` = `fabrika` (superuser + bypass):

```
 Test Files  7 failed (7)
Error: billing K1 tenant-scope test: connected as "fabrika" (rolsuper=true, rolbypassrls=true). RLS does not apply to this role, so every isolation assertion here would pass vacuously. …
(stripe event retention, iyzico, stripe webhook RLS, pipeline-surface, registration-consent, system-scope için aynı hata)
```

b) Yalnız-BYPASSRLS dalını da sınamak için geçici bir rol açıldı: `k6_bypass_probe` (NOSUPERUSER BYPASSRLS, `IN ROLE fabrika_app`). Test bitince silindi, `DROP ROLE` sonrası `count = 0`.

```
 Test Files  7 failed (7)
Error: billing K1 tenant-scope test: connected as "k6_bypass_probe" (rolsuper=false, rolbypassrls=true). …
(7 dosyanın hepsinde aynı)
```

**Negatif kontrol.** Aynı mutasyon (b), değişiklikten önceki kodda (HEAD `ec7799b4`) ayrı bir worktree'de koşuldu. Hatanın gerçekten var olduğunu gösteriyor:

```
 ✓ stripe-event-retention … 5/5 geçti         ← BYPASSRLS rolde tamamen yeşil
 ✓ system-scope … 6/6 geçti                   ← log: "skipped: the test role is BYPASSRLS" ama rapor yeşil
 ↓ iyzico-…-rls, stripe-webhook-…-rls atlandı ← env yok sayıldı (yalnız .env okunuyordu)
 Test Files  2 passed | 2 skipped (4)
```

**3. Ters mutasyon: app-owner dosyaları RLS rolüne (`DATABASE_URL`=fabrika_app) bağlandı → 7/7 kırmızı.**

```
 Test Files  7 failed (7)
Error: concept-template tenant-scope test: connected as "fabrika_app", which is subject to RLS. This suite measures the application's own guard under the app's BYPASSRLS role; …
(calendar-token, gdpr, m9-calendar, relationship-owner, stripe-webhook-idempotency, stripe-webhook-tenant-scope için aynı hata)
```

**4. CI=1 ve `DATABASE_URL_RLS_TEST` yok → hata.** Koşu `.env` dosyası bulunmayan ayrı bir worktree'de yapıldı. Yeni dosyalar oraya kopyalandı, `DATABASE_URL` tanımlıydı.

```
env -u DATABASE_URL_RLS_TEST CI=1 npx vitest run <7 RLS dosyası>
 Test Files  7 failed (7)
Error: system-scope live test: refusing to skip in CI — DATABASE_URL_RLS_TEST is not set (run `pnpm db:rls-role`). Provide the database and DATABASE_URL_RLS_TEST (`pnpm db:rls-role`) in the CI job.
```

Aynı koşu `CI` tanımsızken:

```
stderr | system-scope live test skipped: DATABASE_URL_RLS_TEST is not set (run `pnpm db:rls-role`)
stderr | billing K1 tenant-scope test skipped: DATABASE_URL_RLS_TEST is not set (run `pnpm db:rls-role`)
 Test Files  2 passed | 5 skipped (7)
```

Yerelde uyarıyla atlama davranışı korunuyor.

**5. Statik kontroller.** `tsc --noEmit`: 0 hata. ESLint (değişen dosyalar): temiz. Prettier yalnız yeni yardımcı dosyaya uygulandı. Değişen test dosyaları HEAD'de de prettier'a uymuyordu; tüm dosyayı yeniden biçimlendirip diff'i şişirmemek için onlara dokunulmadı.

## Değişen dosyalar

- `tests/helpers/live-db-role.ts` (yeni)
- `tests/billing-k1-tenant-scope.live.test.ts`
- `tests/stripe-event-retention.live.test.ts`
- `tests/iyzico-webhook-idempotency-rls.live.test.ts`
- `tests/stripe-webhook-idempotency-rls.live.test.ts`
- `tests/pipeline-surface-tenant-scope.live.test.ts`
- `tests/registration-consent.live.test.ts`
- `tests/system-scope.live.test.ts`
- `tests/calendar-token-db.live.test.ts`
- `tests/concept-template-tenant-scope.live.test.ts`
- `tests/gdpr-data-subject.live.test.ts`
- `tests/m9-calendar-tenant-scope.live.test.ts`
- `tests/relationship-owner-assignment.live.test.ts`
- `tests/stripe-webhook-idempotency.live.test.ts`
- `tests/stripe-webhook-tenant-scope.live.test.ts`

Workflow dosyalarına ve `prisma/schema.prisma`'ya dokunulmadı.

## Riskler

- **CI bu commit'le kırmızıya dönecek. Bu bilinçli bir sonuç.** `.github/workflows/ci.yml` yalnız `DATABASE_URL` (fabrika) tanımlıyor. `pnpm db:rls-role` adımı ve `DATABASE_URL_RLS_TEST` yok. GitHub Actions `CI=true` atadığı için 7 RLS dosyası artık "refusing to skip in CI" hatası verecek. Bugüne kadar bu 7 dosya CI'da **hiç koşmuyordu** (iyzico ve stripe-rls `.env` yokken zaten atlanıyordu). Workflow'a dokunmak bu kartın kapsamı dışında, bu yüzden devop-fb için aşağıda bir iş önerisi var.
- `assertAppOwnerRole`, 7 dosyayı uygulama rolüne sabitliyor. İleride uygulama NOBYPASSRLS bir role geçerse (hedef mimari bu) bu dosyalar kırmızı olur ve bilinçli olarak yeniden sınıflandırılmaları gerekir. Bu, sessizce anlam değiştirmelerinden daha iyi.
- `calendar-token-db` hâlâ skip mantığı olmadan koşuyor, DB yoksa önceden de düşüyordu. Davranışı değişmedi, yalnız `beforeAll` içine rol kontrolü eklendi.

## Açık sorular

- **be-fb (B1):** `tests/agency-invite.live.test.ts:91-95` aynı gizli yanlış yeşili taşıyor. BYPASSRLS rolde `skipReason` atıyor ve uyarı basmadan dönüyor. CI'da eksik env de sessiz atlama. Yardımcının eklenmesi gerekiyor: `requireRlsTestUrl(RLS_URL, SUITE)`, bağlandıktan sonra `await assertRlsSubjectRole(rls, SUITE)` ve atlama noktalarında `skipOrFailInCi(SUITE, reason)`. Örnek kalıp `tests/system-scope.live.test.ts` `beforeAll`.
- **devop-fb:** `ci.yml` "Prepare database" adımına `pnpm db:rls-role` eklensin ve job env'ine `DATABASE_URL_RLS_TEST: postgresql://fabrika_app:<ci-parola>@localhost:5432/fabrika` yazılsın. `setup-rls-role.ts` parolayı bu değişkenden okuyor ve yalnız localhost'a izin veriyor. Bu adım eklenmeden CI kırmızı kalır.

## Sonraki adım

1. devop-fb: CI'a RLS rolü ve env eklenecek (yukarıda). Ardından 7 RLS dosyasının CI'da gerçekten koştuğu, "skipped" olmadan, loglardan doğrulanacak.
2. be-fb: `agency-invite.live.test.ts` yardımcıya geçirilecek.

## Platform beyanı

Doğrulama **macOS** (Darwin 27.0.0) üzerinde yapıldı. Postgres, Docker'daki `fabrika-postgres` konteynerinde koştu. Dokunulan kod platformdan bağımsız: `pg_roles` üzerinde SQL sorgusu, `process.env.CI` okuma ve Vitest `describe`/`beforeAll` akışı. Süreç öldürme, dosya yolu ayrımı, kabuk ya da ikili adı içermiyor. `CI` değişkeni GitHub Actions'ın Linux ve Windows runner'larında aynı biçimde (`true`) atanıyor.

- **Linux:** koşulmadı; bu makinede yalnız mac var, CI koşusu da devop-fb'nin workflow işine bağlı.
- **Windows:** koşulmadı; aynı sebep.
