# TASK-MUMO3A8GOMJHY — FB İNCELEME-25 (fe-fb): belge ↔ kod tutarlılığı

**Sprint:** FB-KAMU-2 · **Dal:** dev (HEAD `9fff8c7f`) · **Tarih:** 29.09.2026 · **Kapsam:** yalnız inceleme, belge DEĞİŞTİRİLMEDİ

İncelenen:
1. TASK-MUMNAUBUDL5E7 (cs-fb): `7955009e`. ROADMAP, HUKUK paketi 1.3, `processing-register.md` §1/§11/§21, `agency-channel-notice-addendum.md`, SECURITY_COMPLIANCE, ADR-0006 notu, rapor `TASK-MUMNAUBUDL5E7-cs-fb.md`.
2. TASK-MUMJA8VJJ8YP0 (cs-fb): `b8311fdf`, `55d2ec03`, `49ccb924`. HUKUK paketi 1.1 PostHog/Sentry eki, `docs/kamu/ILKADIM-PILOT.md` §2.2 kurulum adımı, rapor `TASK-MUMJA8VJJ8YP0-cs-fb.md`.

## Karar: **DÜZELTME GEREKLİ**

İki kartın asıl iddiaları kodla örtüşüyor: Outlook, SSO, Microsoft girişi, PostHog olayları ve pilot modül akışı doğru anlatılmış. Sentry'nin kaldırılması da paketin güncel sürümüne doğru yansımış. Yine de bir yanlış kullanıcı yönlendirmesi var (B-1). Bunun yanında paketin 1.3 sürümü yayımlandığında zaten eskimiş olan Resend/Sentry satırları (B-2) ve birkaç eski satır numarası var.

## 1. Bulgular

### B-1 (orta): İlkadım rehberi pilotta "Planı Yükselt" düğmesi olduğunu söylüyor, kodda artık yok
- **Belge:** `docs/kamu/ILKADIM-PILOT.md:57`: "Sayfada M7, M9, M10 ve M11 kartlarında 'Planı Yükselt' düğmesi görünür … düğme yalnız bir bilgi sayfasına gider."
- **Kod:** `a50f53ac` (14:05, TASK-MUMJ9M19CZY56 `done`) bu belgeyi yazan `b8311fdf`'ten (13:32) SONRA geldi. Pilotta kilitli kart artık düğme yerine düz metin gösteriyor: `settings/modules/client.tsx:573-575` (`plan?.pilot` → `t('pilotLocked')`), `messages/tr.json:603` "Pilotta kapalı · kurum paketinde açılır". Pilotta yalnız başlıktaki "Planı Değiştir →" bağlantısı kalıyor (`client.tsx:318`).
- **Etki:** Belediyeye verilecek onboarding rehberi, ekranda olmayan bir düğmeyi anlatıyor.
- **Düzeltme:** cümle şöyle olmalı: "M7, M9, M10, M11 kartlarında 'Pilotta kapalı · kurum paketinde açılır' yazar; başlıktaki 'Planı Değiştir' bilgi sayfasına gider." Kanıt satırı `a50f53ac`'e bağlanmalı.

### B-2 (orta): HUKUK 1.3'te Resend ve Sentry durumu, 1.3 yazıldığında zaten eskimişti
- `docs/legal/HUKUK-SORULARI-2026-09.md:334`: "Resend … Uygulama TASK-MUMLF57HOYFSB'de sürüyor." Oysa Resend `fe9fd31c` ile (14:38) koddan çıktı. Bu, `7955009e`'den (15:25) önce. Bugün `src/lib/email/` altında `resend-mailer.ts` yok, gönderim `mailer.ts` (SMTP) ile yapılıyor ve `package.json`'da resend yok.
- Aynı dosyanın 391. satırı (§8 madde 6) "§17 ve §18 (Resend), §19a (Sentry) … bugünkü kodu anlatıyor" diyor. Bu iddia yanlış. `processing-register.md:338` "`SENTRY_DSN` boş, kod ağ çağrısı yapmıyor" diyor, `:402` ise Sentry'yi "bugün kapalı" bir alt işleyen olarak sayıyor. Ama `89eab729`'dan beri Sentry kodu hiç yok: `src`, `.env.example` ve `package.json`'da `sentry` 0 geçiş.
- Belgeler arasında da çelişki var: `docs/SECURITY_COMPLIANCE.md:103` Resend'i "kaldırıldı, `fe9fd31c`" olarak veriyor, hukuk paketi ise "sürüyor" diyor.
- cs-fb bunu kendi raporunda "kapsam dışı, dokunmadım" diye açıkça yazmış (`TASK-MUMNAUBUDL5E7-cs-fb.md` §4). Açıklık için teşekkürler, ama hukukçuya gidecek paket bugün yanlış bilgi veriyor. Microsoft için uygulanan "kod dev'e düşünce güncelle" ölçütü Resend ve Sentry'ye de uygulanmalı.

### B-3 (düşük): §8 madde 6 kendi içinde çelişiyor
- `HUKUK-SORULARI-2026-09.md:391`: başlık "1.3'te Microsoft kısmı kapandı — §1, §11, §21 güncellendi" diyor. Gövde ise hâlâ "§1 (Microsoft) … §21 (Microsoft, Resend) bugünkü kodu anlatıyor" ve "kartlar `done` olunca güncellenmeli" diyor. cs-fb raporunda ölçütün "kod dev'e düşünce" olarak değiştirildiği ve bunun maddede yazıldığı söyleniyor, ama gövdede bu yazılı değil.

### B-4 (düşük): `acc35b07` sonrası kayan satır numaraları
`acc35b07` `oauth-registration.ts`'den 13 satır sildi.
- `HUKUK-SORULARI-2026-09.md:91`: `oauth-registration.ts:236` / `:239`. Bugün `:225` (`name: \`${…} Organization\``) ve `:228` (`orgType: 'SME'`).
- `HUKUK-SORULARI-2026-09.md:386`: `oauth-registration.ts:239`. Bugün `:228`.
- `ILKADIM-PILOT.md:59`: `oauth-registration.ts:251` (`TENANT_OWNER`). Bugün `:248`. Aynı satırdaki `routes.ts:115-116` bugün `:114-115` (`0fdbcb8d` `routes.ts`'e dokundu).
- Paket 1.2 başlığı "satır numaraları `89eab729`'a kadar tarandı" diyor. `acc35b07` bundan sonra geldi, 1.3 bu satırları yeniden taramamış.

### B-5 (düşük): Envanter §11 satırı güncellenmiş ama şema satır numarası eski
- `processing-register.md:160` ("satır 1195-1198") ve `:162` ("satır 1195, 1199"). Bu satır `7955009e`'de düzenlendi, ama `CalendarConnection` token kolonları bugün `prisma/schema.prisma:1328` (`accessToken`) ve `:1332` (`refreshToken`) satırlarında. 1195 civarı artık Stripe olay tablosunun yorumu. Ayrıca şema yorumu `:1326-1327` hâlâ `'outlook'` diyor. Bu kod tarafında bir iş; cs-fb raporu §6'da not edilmiş.

### B-6 (düşük): Envanter §1'in güncellenen satırında eski parola cümlesi kalmış
- `processing-register.md:20`: "E-posta/parola girişinde üçüncü taraf yok." Oysa ADR-0006 ve `SECURITY_COMPLIANCE.md:95` "şifre ve e-posta bağlantısı yok, giriş yalnız Google" diyor. `auth.ts:312`'deki `Credentials` yalnız yerel demo içindir. Satır bu kartta yeniden yazıldığı için bu cümle de düzeltilmeliydi.

### B-7 (bilgi): SSO kanıtında satır aralığı yazma yerini göstermiyor
- `HUKUK-SORULARI-2026-09.md:54`: "ayar … yazılıyor (`src/lib/sso.ts:49-59`)". `9a9aa6ef`'te 49-59 `configureEnterpriseSso` fonksiyonunun başı ve alan adı kontrolü. Asıl yazma `:80`'de (`prisma.tenant.update`, `settings.sso`). İddianın kendisi doğru.

### B-8 (bilgi): Kart durumu eskidi
- HUKUK `:331`, ROADMAP ve SECURITY_COMPLIANCE, TASK-MUMLFLB2OPLY3 için "inceleme bekliyor" diyor. Kart panoda bugün `done`. Yazıldığı anda doğruydu. Bir sonraki sürümde güncellenmeli.

## 2. Doğrulanan iddialar (doğru)

| İddia | Kanıt |
| --- | --- |
| `15313bc6` Outlook sağlayıcısını ve `outlook.ts`'i siliyor; `4dc067ef` bilgi metnini düzeltiyor; ikisi de dev'de | `git show --stat` (outlook.ts −47, factory/provider; messages en/tr + e2e); `merge-base --is-ancestor` → evet |
| `src` altında Outlook yalnız "kaldırıldı" yorumlarında ve testte geçiyor | `grep -rni outlook src` → `calendar/errors.ts:72`, `m9/server/calendar-actions.ts:25` (yorum), `provider.test.ts:119-129` (ret testi) |
| `0fdbcb8d` ile form, action, `sso.ts` ve testler silindi; `src` altında `sso`/`saml` 0 geçiş | stat: `sso.ts` −177, `sso.test.ts` −227, `admin/billing/actions.ts` −20, `billing-iyzico-sso.test.ts` −67; `grep -rniwE 'sso\|saml' src prisma messages` → boş |
| SSO ayarı girişte okunmuyordu | `git grep -l resolveSsoProviderForDomain 9a9aa6ef` → yalnız `sso.ts`, `sso.test.ts`, `tests/billing-iyzico-sso.test.ts` (+1 eski rapor) |
| Microsoft girişi `acc35b07` ile kalktı; `auth.ts` yalnız Google ve Credentials içeriyor | `auth.ts:2-3` import, `:300` `Google(`, `:312` demo `Credentials`; `AuthCard.tsx:159` `showOAuth = oauthProviders.google` |
| `MICROSOFT_OAUTH_*` `src` ve `.env.example`'da 0 | grep boş. Not: `src/lib/*.test.ts` hâlâ `AUTH_MICROSOFT_ENTRA_ID_*` stub'lıyor (negatif test; belge bunu iddia etmiyor) |
| Takvim: `connectCalendar` reddediyor, callback rotası yok | `calendar-actions.ts:86` `CALENDAR_OAUTH_NOT_CONFIGURED`; `src/app/api/calendar` yok |
| Kiracıyı güncelleyen yerler: il, ajans türü, ortak marka | `profile/actions.ts:40`, `agency/actions.ts:59`, `agency/cobrand-store.ts:113` |
| PostHog: 3 karne olayı ve alanları | `readiness-check.tsx:86` `{orgType}`, `:113` tamamlama, `:594` kayda tıklama |
| PostHog: anonim, profil ve geoip kapalı, AB varsayılanı, onay kapısı | `analytics.ts:28` `eu.i.posthog.com`, `:111-112` `$process_person_profile:false`, `$geoip_disable:true`, `:119-122` anahtar + `hasAnalyticsConsent()` |
| Sentry: güncel paket 1.1 açıklamasını geçersiz sayıyor | `HUKUK:333` "Sürüm 1.1'deki Sentry açıklaması geçersizdir … `89eab729` ile silindi". Paketin başka yerinde canlı Sentry iddiası yok (`grep -n -i sentry` → `:3`, `:333`, `:339`, `:391`) |
| `89eab729` Sentry göndericisini siliyor | stat: `observability/sentry.ts` −210, `env.ts` −7, `.env.example` −5; `grep -rni sentry src .env.example package.json` → boş |
| Pilot ataması `ModuleState` yazmıyor | `billing/pilot.ts:259` `subscription.upsert`; dosyada `moduleState` 0 |
| Ayarlar → `/ayarlar/moduller`; sayfayı yalnız TENANT_OWNER açabiliyor; diğer roller "Erişim Reddedildi" görüyor | `SidebarNav.tsx:37`; `routes.ts:114-115`; `modules/page.tsx:18`, `actions.ts:32`; `rbac.ts` `manage_modules` yalnız `TENANT_OWNER` listesinde, `can()` hiyerarşi kullanmıyor (`:72-76`) |
| M4 ve M8 M1'i gerektiriyor | `m4/manifest.ts:14`, `m8/manifest.ts:14` `requires: ['M1']` |
| `55d2ec03`: kanıt commit'i `84d11af4` | dev'de var (`merge-base` evet) |
| agency addendum: "Google ile kayıtta" (2 yer) | diff `:81`, `:96`; Microsoft girişi yok (yukarıda) |

## 3. Kanıt (komutlar, özet)

```
$ git merge-base --is-ancestor a50f53ac b8311fdf || echo AFTER      → a50f53ac AFTER b8311fdf   (B-1)
$ git log -1 --format=%ad --date=iso fe9fd31c / 7955009e             → 14:38:55 / 15:25:53       (B-2)
$ git ls-tree -r --name-only 7955009e src/lib/email src/lib/observability
  src/lib/email/{mailer.ts,invitation-email.ts,__tests__/mailer.test.ts}, observability/system-alert.ts   (resend/sentry yok)
$ grep -n "Organization\`\|orgType: 'SME'" src/lib/oauth-registration.ts → 225, 228   (B-4)
$ grep -n TENANT_OWNER src/lib/oauth-registration.ts                   → 248        (B-4)
$ grep -n 'accessToken\|refreshToken' prisma/schema.prisma            → 1328, 1332 (B-5)
$ git show 9a9aa6ef:src/lib/sso.ts | grep -n tenant.update             → 80         (B-7)
list_tasks FB-KAMU-2: MUMLFLB2OPLY3 done · MUML0QZAZ5M80 review · MUMMIHYY2F4KB review · MUMJ9M19CZY56 done
```

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUMO3A8GOMJHY-fe-fb.md` (yalnız bu rapor). Belgelere ve koda dokunulmadı.

## 5. Riskler
- B-1 ve B-2 hukukçuya ve belediyeye gidecek metinlerde. Düzeltilmeden gönderilirlerse dış tarafa yanlış bilgi gider.
- Sentry (TASK-MUMLEUIQWSI59) ve Resend (TASK-MUMLF57HOYFSB) kartlarının pano durumunu bu sprint listesinde göremedim. Paket bu kartların durumuna atıf yapıyor.

## 6. Açık sorular
- Envanter ve hukuk paketi için hangi ölçüt geçerli: "kod dev'e düştüğünde" mi, "kart `done` olduğunda" mı? Microsoft birincisine göre, Resend ve Sentry ikincisine göre işlendi. Hangisinin uygulanacağına karar verilmeli (B-3).

## 7. Sonraki adım
- cs-fb için düzeltme kartı: B-1 (İlkadım §2.2), B-2 + B-3 (HUKUK §5/§8 ve envanter §17/§18/§19a/§21 Resend ve Sentry), B-4…B-6 satır numaraları ve parola cümlesi.
- fe-fb/be-fb: `prisma/schema.prisma:1326-1327`'deki `'outlook'` yorumu (B-5, kod tarafı).

**Platform beyanı:** yalnız belge ↔ kod incelemesi; macOS'ta (darwin, zsh) `git` ve `/usr/bin/grep` ile doğrulandı. Çalıştırılan ya da değiştirilen bir kod yolu yok. İncelenen iddialar platforma bağlı değil (OAuth sağlayıcı listesi, RBAC, metin dosyaları). Windows/Linux'ta koşulmadı çünkü koşulacak bir şey yok; sonuç orada da aynı olur.

## Ek — `77f557e7` sonrası yeniden kontrol (15:47, TASK-MUMO301VCLCWR, cs-fb)

Bu inceleme yazılırken dev'e `77f557e7` geldi: hukuk paketi **1.4**, Resend temizliği. Bu commit'e göre yeniden kontrol:
- **B-2 Resend kısmı KAPANDI.** `HUKUK:334` artık "Sürüm 1.4: kodda kaldırıldı (`fe9fd31c`)" diyor. `:391`'e "1.4'te Resend kısmı kapandı — §17, §18, §21" eklendi.
- **B-2 Sentry kısmı AÇIK.** `processing-register.md:338` hâlâ "`SENTRY_DSN` boş, kod ağ çağrısı yapmıyor" diyor. `:403` Sentry'yi "bugün kapalı" alt işleyen olarak sayıyor. `HUKUK:391` §19a'yı da "bugünkü kodu anlatıyor" diye listelemeye devam ediyor. Oysa Sentry kodu `89eab729`'dan beri yok.
- **B-1 AÇIK.** `77f557e7` `ILKADIM-PILOT.md`'de yalnız bir satırı değiştirdi; `:57`'deki "Planı Yükselt" cümlesi aynen duruyor.
- B-3…B-8 bu commit'ten etkilenmedi.

**Karar değişmedi: DÜZELTME GEREKLİ** (B-1, B-2 Sentry kısmı, B-3…B-6).
