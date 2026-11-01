# TASK-MUMAC1VT7DT5Q — FB giriş hata mesajları (İNCELEME-14 K-3) — fe-fb

## 1. Ne yapıldı

- `src/app/[locale]/login/AuthCard.tsx`: `?error=` okuması genişletildi.
  - Bizim üç kod (`invite_invalid`, `disclosure_required`, `email_unverified`) aynı mesajlarını koruyor.
  - `OAuthAccountNotLinked` → kendine özgü, anlaşılır mesaj ("bu e-posta başka bir giriş yöntemiyle açılmış; ilk yöntemle girin").
  - Diğer her boş olmayan kod (`OAuthCallbackError`, `Configuration`, `AccessDenied`, uydurma kodlar) → genel mesaj.
  - Parametre yok ya da boşsa uyarı gösterilmiyor. Kodun metni hiçbir zaman ekrana basılmıyor, kod yalnızca mesajı seçiyor. Bu sayede hazırlanmış bir bağlantı sayfaya rastgele metin koyamaz.
- Uyarı kutusuna `role="alert"` eklendi (ekran okuyucu duyuruyor). Adsız `✕` düğmesine `aria-label` ("Kapat"/"Close") ve `type="button"` verildi. Bu küçük a11y düzeltmesi aynı öğeye dokunduğu için yapıldı.
- `messages/{tr,en}.json` → `Auth.signInError.OAuthAccountNotLinked` ve `Auth.signInError.generic` eklendi.
- `src/lib/auth.ts` ve `src/lib/actions/auth.ts` dosyalarına **dokunulmadı**.

Kaynak doğrulaması: `@auth/core@0.41.3` `errors.js` içinde istemciye yalnız `CredentialsSignin, OAuthAccountNotLinked, OAuthCallbackError, AccessDenied, Verification, MissingCSRF, AccountNotLinked, WebAuthnVerificationError` gidiyor, geri kalanlar `Configuration` oluyor. `index.js:130-137`: `kind === "signIn"` olan hata `pages.signIn` (= `/tr/giris`) adresine `?error=<type>` ile yönlendiriliyor.

## 2. Kanıt

**Auth.js'in gerçek yönlendirmesi (çalışan dev sunucusu, :3000):**
```
$ curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3000/api/auth/signin?error=OAuthAccountNotLinked"
302 http://localhost:3000/tr/giris?callbackUrl=http%3A%2F%2Flocalhost%3A3000&error=OAuthAccountNotLinked
```

**Gerçek tarayıcı** (AgentSpace iç tarayıcısı, dar/mobil genişlik):
- `/tr/giris?error=OAuthAccountNotLinked`: `[role="alert"]` okuması "Bu e-posta adresiyle başka bir giriş yöntemiyle açılmış bir hesap var. Hesabı ilk açtığınız yöntemle (e-posta ve şifre ya da diğer sağlayıcı) giriş yapın." → `TASK-MUMAC1VT7DT5Q-screenshots/01-oauth-account-not-linked-tr.png`
- `/tr/giris?error=OAuthCallbackError`: genel TR mesajı → `02-oauth-callback-error-tr.png`. Ardından `[role="alert"] button[aria-label="Kapat"]` **gerçek tıklama** yapıldı. Sonrasında `read [role="alert"]` sonucu `selector not found`, yani uyarı kapandı.
- `/en/login?error=Hesabiniz_askiya_alindi_0850` (uydurma kod): genel EN mesajı var, kodun metni yok → `03-unknown-code-en.png`

**Bileşen testi** `tests/auth-card-signin-errors.test.tsx` (vitest + jsdom + gerçek next-intl mesajları):
```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```
**Mutasyon kontrolü:** genel dal `null` yapıldığında 5 test kırıldı (OAuthCallbackError / Configuration / AccessDenied / uydurma kod / kapatma düğmesi):
```
      Tests  5 failed | 5 passed (10)
```
Dosya yedekten geri yüklendi (checkout kullanılmadı).

**Lint:** `npx eslint AuthCard.tsx + 2 test dosyası` → exit 0.
**Typecheck:** `tsc --noEmit` hataları yalnızca `src/lib/billing/subscription-sync.ts` içinde (5 × TS2339). Bu dosya bu görevin değil; paylaşımlı ağaçta başka bir ajanın commit'lenmemiş değişikliği. Bu görevin dosyalarında tip hatası yok.

**Playwright e2e** `tests/e2e/signin-error-messages.spec.ts` yazıldı ama **yerelde koşulamadı**: AgentSpace kill-guard (`R8-canli-app-varken-acilis`) `playwright test` komutunu canlı uygulama açıkken engelliyor ve onayını ben veremem. Spec'teki seçiciler (`role=alert`, `Kapat` düğmesi, `/en/login`) yukarıdaki tarayıcı koşusunda aynen doğrulandı. CI'da ya da `MURAT_LIVE_OK=1` onayıyla koşulmalı.

## 3. Değişen dosyalar
- `src/app/[locale]/login/AuthCard.tsx`
- `messages/tr.json`, `messages/en.json`
- `tests/auth-card-signin-errors.test.tsx` (yeni)
- `tests/e2e/signin-error-messages.spec.ts` (yeni, yerelde koşulmadı)
- `docs/agent-results/TASK-MUMAC1VT7DT5Q-screenshots/01..03*.png`
- bu rapor

## 4. Riskler
- `AccessDenied` / `Verification` gibi `kind !== "signIn"` hatalar `pages.error` ayarlı olmadığı için `/api/auth/error` sayfasına gidiyor, giriş kartına gelmiyor. Bu, be-fb'nin `auth.ts` kapsamında. Oraya da `pages.error` verilirse bu kart onları otomatik olarak genel mesajla gösterir.
- Genel mesaj, gerçek bir yapılandırma hatasını (`Configuration`) da "tekrar deneyin" diye gösteriyor. Ayrıntı yalnızca sunucu logunda kalıyor. Bu bilinçli bir tercih: istemciye iç ayrıntı sızmıyor.

## 5. Açık sorular
- `OAuthAccountNotLinked` metni "e-posta ve şifre ya da diğer sağlayıcı" diyor. Demo kapalı üretimde e-posta formu yok, yalnız Google/Microsoft var. Metin yine doğru kalıyor ama ürün sahibi daha sade bir ifade isterse yalnızca JSON değişir.

## 6. Sonraki adım
- e2e spec'i CI'da ya da onaylı yerel koşuda çalıştırmak.
- be-fb `pages.error` eklerse bu kartı yeniden doğrulamak.

**Platform beyanı:** mac (Darwin 27.0.0) üzerinde doğrulandı. Değişiklik yalnızca tarayıcıda çalışan React/JSON kodu. Süreç, dosya yolu, kabuk ya da kısayol gibi platforma bağlı bir yol yok, bu yüzden Windows/Linux'ta davranış aynı. O platformlar ayrıca koşulamadı çünkü bu makinede yoklar.
