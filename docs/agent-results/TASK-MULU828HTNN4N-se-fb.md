# TASK-MULU828HTNN4N — FB CI E2E: 6 kırmızı e2e (se-fb)

Sprint FB-GAP-1 · dal `dev` · kaynak: [TASK-MULT5YZUFQR5F-se-fb.md §4](TASK-MULT5YZUFQR5F-se-fb.md) · başlangıç koşusu [36491973080](https://github.com/yaslan/fonbridge/actions/runs/36491973080) (`6 failed · 1 skipped · 2 did not run · 169 passed`).

## 1. Ne yapıldı

| #   | Test                                                   | Kök neden                                                                                                                                                                                                                                                                                                                | Karar                                                                                                                                                |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2 | `auth.spec.ts:37`, `:64`                               | `page.waitForLoadState('networkidle')` 60 sn doldu. Sayfa render olmuştu: hemen önceki `:22` testi başlığı ve iki OAuth butonunu 3,3 sn'de gördü. Aynı rota ve aynı bekleme 11 dk sonra `registration-consent.spec.ts:72/:116`'da geçti. Sorun auth.ts'te veya DEMO_LOGIN kapısında değil; bekleme koşulu tüm ağa bağlı. | **Düzeltildi (spec).** Bekleme artık "Google butonunu React hidrate etti mi" sorusuna bakıyor (`fixtures/hydration.ts`). Assertion'lar aynı kaldı.   |
| 3   | `evidence-fabrication.spec.ts:58`                      | Spec, `prisma/seed.ts`'in hiç yaratmadığı `cmtrhjys10001ncxk13gwtbcb` kiracısını (yalnız bir geliştirici DB'sinde var) ve `owner@demo.fabrika.test`'i ödünç alıyordu. İlk yazım FK'ye çarptı.                                                                                                                            | **Düzeltildi.** `fixtures/evidence-tenant.ts` kendi kiracısını kurup siliyor: plan `basic`, M3 `ON`, TENANT_OWNER üye.                               |
| 4   | `evidence-unverified-badge.spec.ts:88`                 | #3 ile aynı neden. Ayrıca test "bu kiracının tek belgesi" diye sayıyordu, ödünç kiracı bunu garanti edemez.                                                                                                                                                                                                              | **Düzeltildi**, aynı fixture (`'badge'` anahtarı, ayrı kiracı).                                                                                      |
| 5   | `invoice-foreign-currency-export.spec.ts:230` (`:252`) | Kısıt tanımlı: `prisma/migrations/add-invoice-fx-rate.sql:82-85` (`Invoice_fx_required_for_foreign_currency`). Koşu 36491973080'de CI yalnız `prisma db push` koşuyordu, kısıt kurulmuyordu.                                                                                                                             | **Devredildi → devop-fb TASK-MULU7SAA4EPP8.** O kartın `22c4d508`'i (CI'da `scripts/apply-migrations.sh`) bu push'tan önce dev'e girdi; sonuç §2'de. |
| 6   | `m8-matching.spec.ts:212` (seed `:102`)                | `SAMPLE-0001/0008/0011` CordisProject satırları yalnız `scripts/esr-calibration.ts` ile oluşuyor, seed onları kurmuyor. Bu yüzden `CordisParticipation_projectId_fkey` hatası.                                                                                                                                           | **Düzeltildi.** Fixture kendi `M8E2E-PROJ-1..3` projelerini ve `HORIZON-CL5-2026-D4-01` topic satırlarını kurup siliyor (cascade).                   |

| 7 (yeni) | `identity-strings.spec.ts:116` (ilk düzeltme koşusunda çıktı) | be-fb `f7a36779` (TASK-MULU7GVFBTRXX Ö-2) jwt callback'te `isPlatformAdmin`'i her çağrıda `User` satırından okuyor, satırla desteklenmeyen claim'i düşürüyor. Spec DB'de olmayan `e2e-admin-user` için admin token basıyordu. Sonuç: `/tr/admin/blog`'da "Yeni Blog Yazısı Ekle" butonu yok, click 60 sn'de doldu. Ürün davranışı doğru (fail-closed). | **Düzeltildi (spec).** Spec kendi admin `User` satırını (`isPlatformAdmin: true`) kurup siliyor. Kontrolün kendisine dokunulmadı. |

Commit'ler: `47c7a821` (`test(e2e): evidence and m8 specs own their fixtures; auth waits for hydration, not networkidle`) ve `4ad91143` (`test(e2e): identity-strings admin test backs its admin claim with a User row`). İkisi de TASK-MULU828HTNN4N.

**#1–2 kök neden, dürüst sınır:** CI'daki 60 saniyede hangi isteğin açık kaldığı **kanıtlanamadı**. CI `test-results/` yüklemiyor (koşunun artifact listesi boş), dolayısıyla trace yok. Yerelde yeniden üretilemedi. Denediğim ortam: taze `.next`, CI env'i (`env -i`, OAuth anahtarı yok, `DEMO_LOGIN_ENABLED=true`), `:22` gibi aç-kapat ardından yeni sayfa. Üçünde de networkidle 0,7 sn'de oluştu. "Erken koşuda dev sunucusu bir isteği açık tutuyor" bir **varsayım**. Bir daha olursa `expectHydrated` timeout mesajına açık istekleri (`trackInflight`) yazıyor, bir sonraki kırmızı kök isteği adıyla gösterecek.

## 2. Kanıt

**Yerel (izole worktree `origin/dev`, kendi dev sunucum :3417, CI benzeri env; R8 yüzünden `playwright test` değil, aynı adımları koşan tsx+chromium probe'u):**

```
A chunks-blocked __reactProps$ present: false
A chunks-blocked expectHydrated: FAILED as expected -> Error: React never hydrated getByRole('button', { name: /Google ile Devam Et/ }); requests still open: none
B :37 request -> https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=undefined&redire
C :64 message visible, providerFlowStarted = false
```

(A = negatif kontrol: JS chunk'ları abort edilince içerik görünüyor ama hidrasyon olmuyor; helper doğru yerde kırmızı veriyor.)

```
badge test 1: PASS                       # 1 rozet, data-badge-kind=UNVERIFIED, "0 Geçerli Belge"
badge test 2: upload status = UNVERIFIED # gerçek form + mock R2 yükleme
after teardown: tenant rows = 0 evidence rows = 0
```

```
topic-prefix rows found for fixture projects: 3 | participation FK ok
after delete: participations 0 topics 0
```

`pnpm exec tsc --noEmit -p .` yalnız silinen probe dosyasında hata verdi, spec'ler temiz. Değişen 6 dosyada `eslint` temiz.

**CI:**

| Koşu                                                                                    | Commit     | E2E sonucu                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [36491973080](https://github.com/yaslan/fonbridge/actions/runs/36491973080) (başlangıç) | `6d1df9e1` | 6 failed · 1 skipped · 2 did not run · 169 passed                                                                                                                                                                                                 |
| [36495597483](https://github.com/yaslan/fonbridge/actions/runs/36495597483)             | `47c7a821` | 1 failed · 1 skipped · 176 passed. Hedef 6 test yeşil: `auth.spec:39/:71`, `evidence-fabrication:42`, `evidence-unverified-badge:64/:86`, `m8-matching:230/:318`, `invoice-foreign-currency-export:230`. Tek kırmızı `identity-strings:116` (#7). |
| [36497365219](https://github.com/yaslan/fonbridge/actions/runs/36497365219)             | `4ad91143` | **success** — `1 skipped · 177 passed (14.5m)`, iş `conclusion: success`                                                                                                                                                                          |

#5 (`invoice-foreign-currency-export:230`) devop-fb'nin `754aa884` + `22c4d508` commit'leri (CI'da `scripts/apply-migrations.sh`) ile yeşile döndü. Spec'e dokunulmadı.

#7 yerel negatif kontrol (aynı token, izole dev sunucusu):

```
NO row (old spec) → url /tr/admin/blog | New Post buttons: 0
WITH admin row (new spec) → url /tr/admin/blog | New Post buttons: 1
```

Kalan `1 skipped`: `price-lock-deeper-campaign.spec.ts:68`. Başlangıç koşusunda da atlanıyordu. Bu kartın 6 hatasından biri değil, dokunulmadı.

## 3. Değişen dosyalar

- `tests/e2e/fixtures/hydration.ts` (yeni): `expectHydrated`, `trackInflight`
- `tests/e2e/fixtures/evidence-tenant.ts` (yeni): `evidenceTenant(key)` setup/teardown/signIn
- `tests/e2e/auth.spec.ts`: networkidle yerine hidrasyon beklemesi
- `tests/e2e/evidence-fabrication.spec.ts`, `tests/e2e/evidence-unverified-badge.spec.ts`: kendi kiracıları
- `tests/e2e/m8-matching.spec.ts`: kendi CordisProject ve topic satırları
- `tests/e2e/identity-strings.spec.ts`: kendi platform-admin `User` satırı

`src/`, `ci.yml` ve migration'lara dokunulmadı.

## 4. Riskler

- `__reactProps$` React'in iç anahtarı. React sürümü onu değiştirirse helper her yerde kırmızı verir; sessizce yeşile dönmez, yani fail-closed.
- `m8-matching` hâlâ seed'e bağlı: `demo-tenant`, `main` workspace'i, `alice@fabrika.test` ve `HORIZON-CL5-2026-D4-01` topic'i. Bu koşuda sorun çıkarmadı; kartın kapsamı proje fixture'ıydı.
- Diğer ~30 spec de `networkidle` kullanıyor (ör. `registration-consent`). Bu koşuda geçtiler, dokunmadım. Aynı timeout onlarda da görülürse aynı helper kullanılmalı.

## 5. Açık sorular / gözlem (düzeltilmedi)

- **Ürün gözlemi (be-fb / leed-fb'ye):** `src/app/[locale]/login/AuthCard.tsx:97-98` → `showGoogle = demoLoginEnabled || oauthProviders.google`. Demo açıkken Google anahtarı yoksa buton yine görünüyor ve kullanıcıyı `client_id=undefined` ile Google'ın `invalid_client` hata sayfasına götürüyor. Yerel probe B'de doğrulandı. Demo ortamında kötü bir UX, güvenlik açığı değil. `auth.spec:37` bu davranışa dayanıyor. Karar ürünün.

## 6. Sonraki adım

- Kart `review`'a alınabilir: E2E kapısı yeşil (36497365219).
- `price-lock-deeper-campaign.spec.ts:68` skip'inin gerekçesi ayrı bir kartta gözden geçirilmeli. "Skip yok" kuralı bu kart için geçerliydi, o test bu kartın kapsamında değildi.
- Demo modunda anahtarsız Google butonu (§5): ürün kararı be-fb/leed-fb'de.
- Kalan `networkidle` kullanımları kırmızı verirse `fixtures/hydration.ts` kullanılmalı.

Platform: doğrulama **macOS** (yerel probe, izole dev sunucusu) + **Linux** (GitHub Actions ubuntu-latest, CI koşusu). Dokunulan kod yolu platforma bağlı değil: DB fixture'ları ve DOM üzerinde tarayıcı beklemesi. Windows koşulamadı, bu repoda Windows CI hedefi yok.

Hafıza: `se-fb/e2e-networkidle-yerine-hidrasyon-sinyali.md` (yeni) ve `kapi-dogrulama-temiz-worktree-ve-negatif-kontrol.md` (next dev + db:generate güncellemesi).
