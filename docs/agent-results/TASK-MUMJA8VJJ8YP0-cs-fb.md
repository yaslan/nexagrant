# TASK-MUMJA8VJJ8YP0 — HUKUK paketi PostHog eki (K-5a) + pilot rehberine modül adımı (N-4c) · cs-fb

**Kaynak:** İNCELEME-18 (`docs/agent-results/TASK-MUMIIMRN92JDQ-crw-fb.md` §4 N-4c, §5 K-5a). Board kartının gövdesi worker pane'den okunamıyor. Spec, bu raporun kaynağı ve görev metninden alındı.

## 1. Ne yapıldı

**`docs/legal/HUKUK-SORULARI-2026-09.md` → sürüm 1.1**

- Başlık: "kontrol edilen commit" satırı `858c139a` → `84d11af4` (commit anındaki dev HEAD). 1.0'ın commit'i de not edildi.
- §3.3 madde 1'e **istisna** alt maddesi eklendi. PostHog anahtarı girilirse ve ziyaretçi "Tümünü Kabul Et" derse karne sayfası üç olay gönderir: başlama (tür), tamamlama (tür, puan, seviye), kayda tıklama (tür, seviye). Cevaplar, il, ad, e-posta, kurum adı ve URL gitmez. Kimlik anonimdir (tarayıcıda rastgele, localStorage). Kişi profili ve geoip kapalıdır, varsayılan sunucu AB'dedir, bugün anahtar yok. Envanterde §19a.
- §3.3'e **12e** sorusu (analitik olayı kişisel veri mi, çerez onayı yeterli mi?) ve "cevaba göre ne değişir" satırı eklendi. Kanıt satırı analitik kod yollarıyla genişletildi.
- §5 madde 3 (alıcılar): **PostHog** ve **Sentry** alt maddeleri ve kanıt satırı eklendi. Sentry maddesi, e-posta dışındaki serbest metnin bugün maskelenmediğini (K-3a açık) ve açılmanın patron onayına bağlı olduğunu söylüyor.
- Profil eylemindeki satır kaymaları düzeltildi (`actions.ts:39→40`, `:25→26`, `:44→45`; `0b93f2ed` kaydırmış).

**`docs/kamu/ILKADIM-PILOT.md`**

- §2.2'ye **"Kurulum adımı — pilot atandıktan sonra modülleri açın"** bloğu eklendi. Adımlar: pilot ataması modül açmaz, bu yüzden sayfa 0 aktif gösterir. Kurum sahibi sol menüde Ayarlar'a gider (`/ayarlar/moduller`) ve modülleri tek tek etkinleştirir. M4 ve M8, M1'e bağlıdır. Sayfayı yalnız kurum sahibi kullanır. M7/M9/M10/M11 kartlarında "Planı Yükselt" görünür, ama pilotta yükseltme kapalıdır. Bloğa kanıt satırı eklendi.
- §2.1 koltuk 1 rolü "Kiracı yöneticisi" → "Kurum sahibi (Tenant Owner)". Gerekçe: `manage_modules` yalnız `TENANT_OWNER`'da. Tenant Admin modül sayfasında "Erişim Reddedildi" görür, yani eski metin yanlış kişiyi işaret ediyordu.
- §4 hafta 1 Fabrika sütununa "kurum sahibiyle modülleri açar (§2.2)" eklendi.

## 2. Kanıt (her iddia koddan)

| İddia                                       | Kod                                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Üç olay ve alanları; `province` gönderilmez | `src/app/[locale]/fon-hazirlik/readiness-check.tsx:86` `{ orgType }`, `:113-117` `{ orgType, total, level }`, `:594-597` `{ orgType, level }` |
| Anahtar + onay kapısı                       | `src/lib/analytics.ts:119-122`; `src/lib/cookie-consent.ts:14-25` (yalnız `accepted === true`)                                                |
| Anonim kimlik                               | `analytics.ts:88-98` (`crypto.randomUUID`, localStorage `fabrika_analytics_anon_id`)                                                          |
| Profil/geoip kapalı, URL yok                | `analytics.ts:101-115` (gövde: `$process_person_profile:false`, `$geoip_disable:true`, URL/referrer alanı yok)                                |
| AB varsayılanı                              | `analytics.ts:28` `https://eu.i.posthog.com`                                                                                                  |
| Sentry yalnız e-postayı maskeler            | `src/lib/observability/sentry.ts:86-88` `scrubText`, `:106-120` `buildSentryEvent`, `:132` DSN kapısı; `system-alert.ts:340` yalnız `error`   |
| K-3a hâlâ açık                              | `git log -- src/lib/observability` → son commit `488313b1`, düzeltme yok                                                                      |
| Pilot ataması ModuleState yazmaz            | `src/lib/billing/pilot.ts:259` (`subscription.upsert`) ve `:262` (`auditEvent.create`), dosyada başka yazma yok                               |
| Ayarlar → modül sayfası                     | `src/components/SidebarNav.tsx:37` (`settings` → `settingsModules`), `src/lib/routes.ts:115-116`                                              |
| Yalnız kurum sahibi                         | `settings/modules/page.tsx:18`, `actions.ts:32`; `src/lib/rbac.ts` (`manage_modules` yalnız `TENANT_OWNER` listesinde)                        |
| Kaydı açan kurum sahibidir                  | `src/lib/oauth-registration.ts:251` `role: 'TENANT_OWNER'`                                                                                    |
| M4/M8 → M1                                  | `src/modules/m4/manifest.ts:14`, `m8/manifest.ts:14` `requires: ['M1']`                                                                       |
| M7/M9/M10/M11 pilot paketinde yok           | `npx tsx` → `plansGrantingModule`: M1 pro,ultra · M6 pro,ultra · M7/M9/M10/M11 `["ultra"]`; pilot tabanı `pro`                                |
| "Planı Yükselt" kartta var                  | `settings/modules/client.tsx:579`                                                                                                             |

**Paketin eski kanıt satırları neden hâlâ geçerli:** `git diff --stat 858c139a 84d11af4 -- src/lib/agency src/lib/oauth-registration.ts src/lib/readiness src/lib/registration-*-cookie.ts src/lib/auth.ts src/lib/legal src/lib/province.ts src/app/[locale]/login prisma/migrations/add-tenant-province.sql …/fix-agency-invite-rejection-audit.sql .github/workflows/ci.yml …/agency-monthly-report.ts src/app/api/agency` → **boş çıktı**, yani bu dosyalar değişmedi. Değişen yalnız `settings/profile/actions.ts`; satırları düzeltildi. `grep "tenant.update(" src` → 40 / cobrand-store:113 / agency/actions:59 / sso:80 (paketle aynı).

**Biçim:** `npx prettier --check docs/kamu/ILKADIM-PILOT.md docs/legal/HUKUK-SORULARI-2026-09.md` → `All matched files use Prettier code style!`

**Commit'ler (dev, push yok):**

- `b8311fdf`: iki belge
- `55d2ec03`: kanıt commit'i `84d11af4`'e alındı (commit sırasında HEAD ilerledi)

## 3. Değişen dosyalar

- `docs/legal/HUKUK-SORULARI-2026-09.md`
- `docs/kamu/ILKADIM-PILOT.md`
- `docs/agent-results/TASK-MUMJA8VJJ8YP0-cs-fb.md` (bu rapor)

## 4. Riskler

- Sentry maddesi K-3a'nın **bugünkü** hâlini anlatıyor. se-fb K-3a'yı kapatınca (yalnız ilk satır gönderilince) §5'teki "serbest metin maskelenmez" cümlesi güncellenmeli.
- Modül sayfasının başlığı ve toast'ları kodda sabit Türkçe. Commit'lenmemiş bir i18n işi sürüyor. Rehberde bu yüzden yalnız menü adı ("Ayarlar") ve yol geçiyor, sayfa başlığı alıntılanmadı.
- Belgeler hukukçuya gitmeden önce yeniden kod kayması taranmalı (hafıza: fonbridge-hukuk-belgesi-kod-kaymasi).

## 5. Açık sorular

- K-4b ("Planı Yükselt" pilotta yapılamayan eylemi vaat ediyor) ürün tarafında düzeltilirse rehberdeki son cümle kısalır. Karar lider/fe-fb'nin.
- Pilot atandığında modüllerin otomatik açılması istenir mi? Bu bir ürün kararı; rehber bugünkü davranışı anlatıyor.

## 6. Sonraki adım

- crw-fb: K-5a + N-4c yeniden inceleme (yalnız bu iki belge).
- se-fb K-3a'yı kapatınca: §5 Sentry maddesi tek cümleyle güncellenir.

## Platform beyanı

- **Doğrulandı: macOS** (Darwin 27.0.0). Bu yalnız belge değişikliği. Doğrulama kod okuma, `git diff`, `grep`, `npx tsx` (katalog sorgusu) ve `prettier` ile yapıldı.
- **Windows / Linux: koşulamadı** (bu makinede yok). Gerek de yok: dokunulan kod yolu yok. Anlatılan davranışlar (tarayıcı `localStorage`/`fetch`, sunucu RBAC, Prisma yazmaları) koddan okunduğu üzere işletim sisteminden bağımsız.
