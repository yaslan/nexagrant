# TASK-MUMLFLB2OPLY3 — Microsoft ile girişi kaldır, yalnız Google OAuth (fe-fb)

**Commit:** `acc35b07` (dev, push edilmedi) · **Tarih:** 29.09.2026 · **Karar:** patron 29.09, ADR-0006 güncelleme 2

> Not: Board aracı (`list_tasks`) kart açıklamasını döndürmüyor. Açıklama metnine erişemedim. İş, kart başlığı, görev mesajı ve leed-fb'nin 29.09 karar kaydına ("Microsoft Entra girişi kaldırıldı, yalnız Google") göre yapıldı. Kartta burada karşılanmayan bir madde varsa Açık sorular bölümüne bakın.

## 1. Ne yapıldı

Microsoft Entra ID girişi koddan **tamamen** çıkarıldı. Önceki "kod kalır, anahtar eklenince açılır" durumu artık yok. Tek OAuth sağlayıcısı Google.

- `src/lib/auth.ts`: `MicrosoftEntraID` importu ve koşullu sağlayıcı bloğu silindi. Artık kullanılmayan `configuredOAuthProviders` importu da kaldırıldı.
- `src/lib/demo-login.ts`: `OAuthProviderAvailability` yalnız `{ google }` oldu. `AUTH_MICROSOFT_ENTRA_ID_*` okunmuyor.
- `src/app/[locale]/login/AuthCard.tsx`: "Microsoft Kurumsal ile Giriş / Sign in with Microsoft" butonu silindi. `showMicrosoft` kaldırıldı, `showOAuth = oauthProviders.google` oldu. EN kayıt alt başlığı "Start in seconds with Google, Microsoft or work email." yerine "Start in seconds with Google." oldu.
- `src/lib/oauth-registration.ts`: `providerVerifiedEmail` içindeki Entra kuralı (`xms_edov` / `verified_primary_email`) silindi. Artık `microsoft-entra-id` kimliği "doğrulanmamış" sayılıyor ve var olan hesaba **bağlanmıyor** (kapalı-başarısız).
- `src/lib/actions/auth.ts`: `loginWithSocialAction(provider: 'google', …)`.
- Yorumlar (`registration-invite-cookie`, `registration-ack-cookie`, `registration-consent`, `registration-province-cookie`): "Google/Microsoft" yerine "Google" yazıldı.
- `.env.example`: `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET` satırları silindi. Yalnız bu hunk commit'lendi; be-fb'nin aynı dosyadaki SMTP satırları çalışma ağacında kaldı.
- **ADR-0006**: başlık "yalnız Google (OAuth)" oldu. Karar cümlesi düzeltildi ve "Güncelleme 2 — Microsoft girişi kaldırıldı" bölümü eklendi. Bölüm şunları içeriyor: kod, anahtarlar, hesap bağlama, var olan Entra hesapları, kapsam dışı (kiracı SSO, Outlook), diğer belgelerin cs-fb'de olduğu.
- Testler:
  - `auth-callbacks.test.ts`: "Entra yalnız iki anahtarla kaydolur" testi yerine regresyon koruması geldi: "Microsoft Entra is not registered, even with its old keys set".
  - `demo-login.test.ts`: eski Entra anahtarları bir şey listelemiyor.
  - `oauth-registration.test.ts`: "Entra (removed): no claim counts as verified".
  - `oauth-registration.live.test.ts`: "Entra (fake) provider-independent" kayıt testi silindi. Bağlama reddi (`email_unverified`) korundu.
  - `auth-card-signin-errors.test.tsx`: prop tipi güncellendi.
  - `tests/e2e/auth.spec.ts`: Microsoft butonu yerine `toHaveCount(0)` bekleniyor.

**Dokunulmadı (kapsam dışı):** kiracı SSO seçeneği `AZURE_AD` (`admin/billing/client.tsx`, TASK-MUML0QZAZ5M80), Outlook takvim bağlantısı, `messages/*.json` içindeki SSO metinleri (Entra ID bir SSO IdP olarak geçiyor), KVKK/hukuk belgeleri (`docs/kamu/VERI-YERLESIMI.md`, `docs/legal/processing-register.md`; cs-fb). `next-auth` bağımlılığı olduğu gibi kaldı; Entra ayrı bir paket değil.

## 2. Kanıt

**Birim testleri (yeni kod):**
```
npx vitest run src/lib/auth-callbacks.test.ts src/lib/demo-login.test.ts tests/oauth-registration.test.ts tests/auth-card-signin-errors.test.tsx
 Test Files  4 passed (4)
      Tests  45 passed (45)
```

**Mutasyon:** `auth.ts`, `demo-login.ts` ve `oauth-registration.ts` HEAD~ (eski) sürümüne döndürüldü. Geri alma `git checkout` ile değil, yedek kopyayla yapıldı. Sonuç:
```
     × lists an OAuth provider only when both id and secret are set
     × Entra (removed): no claim counts as verified
     × Microsoft Entra is not registered, even with its old keys set
      Tests  3 failed | 32 passed (35)
(yeni koda geri) Tests  35 passed (35)
```

**Lint:** değişen 11 kod/test dosyasında `npx eslint …` exit 0.

**Typecheck:** `tsc --noEmit` benim dosyalarımda hata vermiyor. Kalan hatalar be-fb'nin commit'lenmemiş Resend→SMTP işinden geliyor: `resend` modülü, `src/lib/email/mailer.ts` ve `env.ts` tipleri, `scripts/efatura-preflight.ts`. Bu hataların hiçbiri auth/login dosyalarında değil.

**i18n:** `pnpm i18n:check` sonucu "✅ i18n check passed … no file gained hard-coded text". Baseline artmadı. Düşüş (−7) be-fb'nin `smtp-form.tsx` dosyasından geliyor; baseline güncellenmedi.

**Gerçek tarayıcı (:3000, Google Chrome, Playwright sürücüsü, çerez penceresi gerçek kullanıcı gibi kapatıldı):**
```
/tr/giris    desk google button h=42 w=382 microsoftButtons=0
/tr/giris    mob  google button h=38 w=308 microsoftButtons=0
/en/login    desk google button h=42 w=382 microsoftButtons=0
/en/login    mob  google button h=38 w=308 microsoftButtons=0
/tr/kayit    desk google button h=42 w=382 microsoftButtons=0
/tr/kayit    mob  google button h=38 w=308 microsoftButtons=0
/en/register desk google button h=42 w=382 microsoftButtons=0
/en/register mob  google button h=38 w=308 microsoftButtons=0
(sayfa metninde "microsoft" geçmiyor; mobilde scrollWidth=390 → yatay kaydırma yok)
keyboard focus reached: "Google ile Devam Et"          (Tab ile)
after Enter on Google button, url host: accounts.google.com/v3/signin/identifier
/tr/kayit    Google without tick → alert: "Devam edebilmek için aydınlatma metnini okuduğunuzu ve kullanım koşullarını kabul ettiğinizi onaylamanız gerekir." still on /tr/kayit
/tr/kayit    Google with tick → accounts.google.com
/en/register Google without tick → alert: "To continue, please confirm that you have read the privacy notice and accept the terms of service." still on /en/register
/en/register Google with tick → accounts.google.com
```

**Kareler** (`docs/agent-results/assets/TASK-MUMLFLB2OPLY3/`):
- `after-tr_giris-desk.png`, `after-tr_giris-mob.png`
- `after-en_login-desk.png`, `after-en_login-mob.png`
- `after-tr_kayit-desk.png`, `after-tr_kayit-mob.png`
- `after-en_register-desk.png`, `after-en_register-mob.png`
- `after-tr_kayit-no-tick-click.png`, `after-en_register-no-tick-click.png`
- `after-tr_giris-keyboard-focus.png`

**Önce karesi yok.** İlk denemede :3000, be-fb'nin yarım Resend kaldırma işi yüzünden "Module not found: resend" derleme hatası veriyordu. O kareler işe yaramadığı için silindi. Görsel fark da zaten beklenmez: yerelde Entra anahtarları tanımlı olmadığı için Microsoft butonu önceden de görünmüyordu. Değişiklik, anahtar eklenince butonun ve sağlayıcının **geri gelememesi**. Bunu yukarıdaki mutasyon testi kanıtlıyor.

**e2e (`tests/e2e/auth.spec.ts`) koşulmadı.** `playwright.config.ts` içinde `reuseExistingServer: false` var; runner aynı dizinde ikinci bir `next dev` başlatırdı ve paylaşılan :3000 sunucusuyla çakışırdı. Spec'teki beklentinin (Google görünür, Microsoft 0) aynısı yukarıdaki gerçek tarayıcı koşusunda doğrulandı.

## 3. Değişen dosyalar (acc35b07, 17 dosya)
`.env.example` (yalnız 2 satır silme) · `docs/adr/ADR-0006-oauth-only-sign-in.md` · `src/app/[locale]/login/AuthCard.tsx` · `src/lib/actions/auth.ts` · `src/lib/agency/registration-invite-cookie.ts` · `src/lib/auth-callbacks.test.ts` · `src/lib/auth.ts` · `src/lib/demo-login.test.ts` · `src/lib/demo-login.ts` · `src/lib/legal/registration-ack-cookie.ts` · `src/lib/legal/registration-consent.ts` · `src/lib/oauth-registration.ts` · `src/lib/registration-province-cookie.ts` · `tests/auth-card-signin-errors.test.tsx` · `tests/e2e/auth.spec.ts` · `tests/oauth-registration.live.test.ts` · `tests/oauth-registration.test.ts`

Paylaşılan ağaç olayı: İlk commit denemesinde be-fb, `git add` ile commit arasındaki kısa aralıkta `resend-mailer.ts` ve testinin silinmesini index'e almıştı. Bu silme benim commit'ime girdi (19 dosya). Commit henüz push edilmemişti. `reset --soft` ile geri alındı ve yalnız benim 17 dosyamla yeniden commit'lendi (`acc35b07`). be-fb'nin iki silmesi index'te staged olarak yerine konuldu (`D  src/lib/email/...`).

## 4. Riskler
- **Var olan Microsoft hesapları:** Microsoft ile açılmış bir `Account(provider='microsoft-entra-id')` satırı olan kullanıcı artık bu yoldan giremez. Aynı e-postanın Google hesabı varsa ve Google e-postayı doğruluyorsa bağlanır; yoksa hesaba giriş yolu kalmaz. Pilot öncesi üretimde böyle bir kullanıcı beklenmiyor. Yerel ya da üretim veritabanında sayım yapılmadı.
- Birim testleri ve tarayıcı dışında `oauth-registration.live.test.ts` (fabrika_app, `DATABASE_URL_RLS_TEST`) bu turda koşulmadı. Yalnız bir testin silinmesi ve yorum değişikliği yapıldı; tip denetimi temiz.

## 5. Açık sorular
- Kart açıklamasının tam metnine erişemedim (araç açıklama döndürmüyor). Kartta ek bir madde varsa lider bildirsin: örneğin üretimdeki `microsoft-entra-id` Account satırlarının temizliği ya da gizlilik metinleri.

## 6. Sonraki adım
- cs-fb: `VERI-YERLESIMI.md` ve `processing-register.md` içindeki "Google / Microsoft ile giriş" satırlarını daraltsın.
- Patron anahtar kartı TASK-MULQM3LFB4KRA: Entra anahtarı artık gerekmiyor.
- crw-fb incelemesi.

## Platform beyanı
Doğrulama **macOS**'ta yapıldı (Darwin 27, Chrome, Node 26). Değişen kod platforma bağlı değil: süreç, dosya yolu, kabuk ya da kısayol içermiyor. Yalnız Auth.js sağlayıcı listesi ve React UI değişti; Windows ve Linux'ta davranış aynıdır. Bu platformlar koşulmadı, çünkü makinede yoklar ve değişen kod platforma özgü bir yol içermiyor.
