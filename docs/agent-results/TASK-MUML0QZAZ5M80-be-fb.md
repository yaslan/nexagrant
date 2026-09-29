# TASK-MUML0QZAZ5M80 — FB SSO'yu tamamen kaldır (be-fb)

Kapsam 29.09 patron kararıyla değişti: kiracı SSO self-servisi **iptal**, SSO kaldırıldı.
Kod commit'i: `0fdbcb8d` (dal `dev`). Baseline, kareler ve rapor ayrı commit'te.

## 1) Ne yapıldı

**Envanter.** Komut: `/usr/bin/grep -rniE "sso|saml|idpEntityId|ssoAcsUrl|configureEnterpriseSso|handleConfigureSso|manage_sso" src tests prisma .env.example`

Yanlış pozitifler ayıklandı: `ReadinessOrgType`, `accessor`, `predecessor`, `cheaper per token than either`… Gerçek bulgular:

| Yer | Durum |
|---|---|
| `src/lib/sso.ts` (`configureEnterpriseSso`, `resolveSsoProviderForDomain`) + `src/lib/sso.test.ts` | **silindi** |
| `src/app/[locale]/admin/billing/actions.ts`: tek export'u `handleConfigureSso` | **dosya silindi** |
| `src/app/[locale]/admin/billing/client.tsx`: SSO sekmesi, formu, state'i ve handler'ı | **kaldırıldı**. Tek sekme kaldığı için sekme çubuğu da kalktı. Faturalama içeriği koşulsuz render ediliyor (girinti 2 boşluk azaldı; `git diff -w` ile okunur). `BillingSsoClient` → `BillingClient`, kullanılmayan `tenantId` prop'u çıkarıldı. |
| `src/app/[locale]/admin/billing/page.tsx` | Yeni bileşen adı kullanılıyor, `tenantId` prop'u gitti. "SSO portal" yorumu da "Stripe portal" olarak düzeltildi. |
| `src/lib/routes.ts`: `settingsSso` rotası (`/ayarlar/sso`) | **kaldırıldı**. Hiçbir çağıran yoktu, sayfası da yoktu. |
| `tests/billing-iyzico-sso.test.ts`: yalnız 2 SSO testi vardı | **silindi** |
| `tests/admin-actions-authz.test.ts`: `handleConfigureSso` satırı ve "tenant scope" describe'ı | **kaldırıldı**. Blog ve CORDIS'in 11 action'ı × 3 çağıran matrisi **aynen** duruyor. |
| `messages/{tr,en}.json` → `billingPanels.admin` | 18 anahtar silindi: `tabSso`, 16 `sso*` anahtarı ve artık kullanılmayan `tabBilling`. `kicker` ve `title` SSO'suz metne çevrildi. |
| `src/lib/agency/cobrand-store.ts` | Yalnız yorum: silinen `src/lib/sso.ts` referansı çıkarıldı. |
| İzin/rol tanımları (`manage_sso`) | **Yok.** Kodda SSO'ya özgü izin ya da rol tanımı hiç yoktu, kaldırılacak bir şey çıkmadı. |
| `prisma/`, `.env.example` | SSO izi yok. Migration yok. |

**DB.** SSO ayarı olan kiracılar yalnız sayıldı, veri silinmedi.

**i18n baseline.** Ratchet sıkılaştırıldı:
- `admin/billing/client.tsx` 4 → 0 oldu ve baseline'dan çıktı.
- `smtp-form.tsx` 13 → 6 oldu (önceki TASK-MUMLF57HOYFSB işimden kalan borç).

## 2) Kanıt

**Grep (sonrası)**
```
$ /usr/bin/grep -rniE "\bsso\b|saml|idpEntityId|ssoAcsUrl|configureEnterpriseSso|handleConfigureSso|manage_sso|settingsSso|BillingSso" src tests prisma .env.example messages
tests/admin-actions-authz.test.ts:8: * point. (The SSO action this file also covered was removed with SSO itself,
```
Kalan tek eşleşme, kaldırmayı açıklayan yorum.

**DB sayımı** (yerel `fabrika-postgres`, db `fabrika`, salt-okunur SELECT)
```
select count(*), count(*) filter (where settings ? 'sso'), count(*) filter (where settings ? 'sso' and "deletedAt" is null) from "Tenant";
→ toplam=49 sso_anahtarli=0 sso_silinmemis=0
```
Yerelde `settings.sso` taşıyan kiracı **0**. Üretim DB'sine erişimim yok, orada sayım **yapılmadı**. Lider isterse aynı sorgu üretimde koşulabilir. Kayıt çıkarsa bile girişte okunmuyor, zararsız artık veri olarak kalır. Silme kararı liderde.

**Kapılar** (`dev` ağacı, commit `0fdbcb8d`)
```
pnpm typecheck                 → exit 0
pnpm lint                      → exit 0
pnpm test                      → Test Files 214 passed | 2 skipped (216) · Tests 2448 passed | 8 skipped (2456), exit 0
vitest tests/admin-actions-authz.test.ts → 33 passed (11 action × anonim / başka kiracı admini / platform admini)
pnpm i18n:check                → exit 0 ("both catalogs agree … no file gained hard-coded text")
```

**Temiz worktree build.** `git worktree add --detach <scratch>/wt-sso 0fdbcb8d`, ardından `pnpm install --frozen-lockfile`, `pnpm db:generate` ve `pnpm build`:
```
INST=0  GEN=0  BUILD=0
```
Worktree sonradan kaldırıldı.

**Gerçek tarayıcı** (:3000 dev sunucusu, cwd FONBRIDGE)
- Ortam: Chrome (Playwright `channel:'chrome'`), platform-admin oturum çerezi (e2e specleriyle aynı `encode` deseni).
- Kontrol edilenler: `/tr/admin/billing` ve `/en/admin/billing`.
```
{"loc":"tr","status":200,"h1":"Stripe ödeme altyapısı","planCards":3,"ssoTextHits":[],"ssoInputs":0}
{"loc":"en","status":200,"h1":"Stripe payment infrastructure","planCards":3,"ssoTextHits":[],"ssoInputs":0}
errors []   (pageerror + console.error yok)
```
- `ssoTextHits`: sayfa metninde `/SSO|SAML|Okta|Entra|IdP|x509/i` eşleşmeleri.
- `ssoInputs`: `#sso-*` alanlarının sayısı.
- Kareler: `docs/agent-results/TASK-MUML0QZAZ5M80-screenshots/admin-billing-{tr,en}.png`. Sekme çubuğu ve SSO bölümü yok. Başlık, Stripe portal düğmesi ve 3 plan kartı var.

## 3) Değişen dosyalar
- Silinen: `src/lib/sso.ts`, `src/lib/sso.test.ts`, `src/app/[locale]/admin/billing/actions.ts`, `tests/billing-iyzico-sso.test.ts`
- Değişen: `src/app/[locale]/admin/billing/{client,page}.tsx`, `src/lib/routes.ts`, `src/lib/agency/cobrand-store.ts` (yorum), `tests/admin-actions-authz.test.ts`, `messages/{tr,en}.json`, `i18n-baseline.json`
- Yeni: bu rapor ve 2 kare
- `src/locales/*/settings.json`, takvim dosyaları (`src/lib/calendar`, m9) ve belgeler: **dokunulmadı**

## 4) Riskler
- Üretimde `Tenant.settings.sso` kaydı varsa artık okunmayan ölü veri olarak kalır. Güvenlik etkisi yok, çünkü hiçbir kod yolu okumuyor.
- `docs/` altında SSO/SAML anlatan belgeler olabilir (ROADMAP, ADR vb.). Kural gereği dokunmadım, belge sahibinin işi.
- `client.tsx` diff'i girinti yüzünden büyük görünüyor (438 satır). `git diff -w` ile gerçek değişiklik yalnız silme.

## 5) Açık sorular
- Üretimde `settings.sso` sayımı ve varsa temizliği: karar liderde. Önerim: sayım 0 değilse tek seferlik `settings - 'sso'` güncellemesi, öncesinde yedek.

## 6) Sonraki adım
- crw-fb İNCELEME-21'deki SMTP bulgusu B-1 (aynı adrese sınırsız davet e-postası, TASK-MUMLF57HOYFSB) düzeltmesi.

**Platform beyanı:** Doğrulama **macOS**'ta yapıldı (Darwin 27, Chrome, Node 26). Değişiklik yalnız kod silme, UI ve i18n içeriyor. Süreç, dosya yolu, kabuk ya da ikili adı gibi platforma bağlı bir yola dokunmuyor. Bu yüzden Linux ve Windows'ta davranış aynı olur (koddan). Windows ve Linux'ta ayrıca koşulmadı, çünkü bu makinede yalnız macOS var.
