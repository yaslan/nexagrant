# TASK-MUMAC8JELIZ5H — OAuth M2 testi + davetli kayıt yarışının "Configuration" sayfasına düşmesi · be-fb

Commit: `555935bc` (dev, push yok).

## 1) Ne yapıldı

**Ö-1: M2 testi.** crw-fb'nin deterministik testi `tests/oauth-registration.live.test.ts`'e eklendi. Test yalnız o koda bağlı bir `BEFORE UPDATE` trigger'ı kuruyor. Trigger signIn yoklamasını geçiriyor, adaptörün harcamasını atlıyor. Trigger kurulumu `withCodeDyingAfterProbe()` yardımcısına alındı, K-1 testleri de aynı yardımcıyı kullanıyor. Paralel testleri etkilememesi için trigger adı kodun ID'sine bağlı ve `finally` içinde düşürülüyor. Bu not test yorumunda da yazıyor (crw-fb'nin istediği gibi).

**K-1: yarışı kaybeden kayıt.** Karar: kartın iki seçeneği ayrı ayrı çalışmıyor, ikisinin birleşimi gerekiyor.

- **"Adaptör hatayı `invite_invalid`'e çevirsin" tek başına mümkün değil.** `@auth/core` `lib/init.js:153` `adapterErrorHandler`, adaptörün attığı her hatayı `AdapterError` ile sarıyor. `AdapterError` istemciye güvenli tür listesinde (`errors.js:412`) yok. Bu yüzden `lib/index.js:131` her durumda `?error=Configuration` üretiyor ve `pages.error`'a gönderiyor. Adaptör hangi hatayı atarsa atsın sonuç aynı.
- **"`pages.error` → `/tr/giris`" tek başına yetmiyor.** Kullanıcı İngilizce sayfa yerine giriş kartını görür, ama kart yarışı gerçek bir yapılandırma hatasından ayıramaz. Sonuçta `invite_invalid` değil, genel mesaj gösterir.
- **Uygulanan çözüm:**
  - `pages.error: "/api/auth/hata"` eklendi. Bu küçük bir route handler (`src/app/api/auth/hata/route.ts`). Statik segment olduğu için Next.js onu Auth.js catch-all'ından önce eşliyor.
  - Adaptör `InviteCodeRejectedError` aldığında, hatayı atmadan önce tek kullanımlık bir not bırakıyor: `fabrika_registration_refused` çerezi. Değer yalnız dil (`tr`/`en`). Çerez httpOnly, Lax, 60 sn.
  - Route notu okuyup siliyor ve `oauthRefusalPath(locale, 'kayit', invite_invalid)` adresine yönlendiriyor. Bu, signIn reddiyle aynı adres ve aynı mesaj.
  - Not yoksa `/tr/giris?error=<kod>` adresine yönlendiriyor. Kod yalnız `[A-Za-z]{1,64}` ise geçiyor, değilse `Configuration` oluyor. AuthCard bilinmeyen her kod için genel mesajı gösteriyor (fe-fb K-3).
  - Bu değişiklik be-fb'nin önceki açık sorusunu (`pages.error`) da kapatıyor.
  - `refuse()` içindeki yol üretimi `oauthRefusalPath` olarak dışa açıldı. Davranışı değişmedi.
- **Güvenlik:** Not kod taşımıyor, yalnız sabit bir mesaj seçiyor. Birisi çerezi kendisi yerleştirse en fazla "davet kodu geçersiz" mesajını görür. Route'a gelen `error` parametresi URL'ye yalnız düz kelime olarak geçiyor.

## 2) Kanıt

### Canlı test (`fabrika_app`, NOBYPASSRLS, sahte sağlayıcı)

HEAD'de, K-1 düzeltmesinden önce (M2 testi eklendikten sonra):

```
M2 probe location: http://localhost:3000/api/auth/error?error=Configuration     ← K-1 yeniden üretildi
Tests  19 passed (19)
```

K-1 testleri yazılınca, düzeltmeden önce (kırmızı):

```
× K-1: the registration that loses the race gets invite_invalid, not the Configuration page
× K-1: any other Auth.js error lands on the login card, not the English Configuration page
AssertionError: expected '/api/auth/error' to be '/api/auth/hata'
AssertionError: expected 500 to be 302
Tests  2 failed | 1 passed | 18 skipped (21)
```

Düzeltmeden sonra:

```
K-1 race (tr): http://localhost:3000/api/auth/hata?error=Configuration
K-1 race (en): http://localhost:3000/api/auth/hata?error=Configuration
✓ code dies between probe and adapter: choice cookies are spent
✓ K-1: the registration that loses the race gets invite_invalid, not the Configuration page
✓ K-1: any other Auth.js error lands on the login card, not the English Configuration page
Tests  21 passed (21)
```

### Mutasyon kanıtı (6/6 öldü; her biri tek eşleşmeyle uygulandı ve `cmp` ile geri alındığı doğrulandı)

```
[M2]             adaptör davet yolunda `await clearRegistrationChoiceCookies();` silindi
                 → × code dies between probe and adapter: choice cookies are spent   (1 failed | 20 passed)
[K1-note]        adaptörde setRegistrationInviteRefusal(...) silindi        → × K-1 race           (1 failed)
[K1-locale]      not hep 'tr' yazıyor                                        → × K-1 race           (1 failed)
[K1-single-use]  takeRegistrationInviteRefusal içinde jar.delete silindi     → × K-1 race           (1 failed)
[K1-sanitize]    route'ta kod süzgeci kaldırıldı                              → × K-1 other error    (1 failed)
[K1-pages-error] pages.error satırı silindi                                  → × K-1 race + other   (2 failed)
```

M2, commit öncesinde HEAD kodunda da ayrıca öldürüldü (`1 failed | 18 passed (19)`, `git checkout` ile geri alındı).

### :3000'de (bu ağaçtan koşan `next dev`, pid cwd = /Users/macbook/alan/FONBRIDGE)

```
== curl -i /api/auth/error?error=Configuration
HTTP/1.1 302 Found
location: /api/auth/hata?error=Configuration
== curl -i /api/auth/hata?error=Configuration
HTTP/1.1 302 Found
location: http://localhost:3000/tr/giris?error=Configuration
== curl -i /api/auth/hata?error=%3Cscript%3E
location: http://localhost:3000/tr/giris?error=Configuration
== curl -i -H "Cookie: fabrika_registration_refused=en" /api/auth/hata?error=Configuration
location: http://localhost:3000/en/kayit?error=invite_invalid
set-cookie: fabrika_registration_refused=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```

Gerçek tarayıcı (Chromium headless-shell 1243), yönlendirme zincirini izleyerek. Kareler `docs/agent-results/TASK-MUMAC8JELIZ5H-screenshots/` altında:

```
01-yaris-kaybeden-tr.png | final /tr/kayit?error=invite_invalid | chain [302 /api/auth/error -> /api/auth/hata, 302 /api/auth/hata -> /tr/kayit?error=invite_invalid] | alert "Davet kodu geçersiz ya da artık kullanılamıyor." | note left false
02-yaris-kaybeden-en.png | final /en/kayit?error=invite_invalid | alert "This invite code is invalid or can no longer be used." | note left false
03-diger-hata-giris.png   | final /tr/giris?error=Configuration  | alert "Giriş tamamlanamadı. Lütfen tekrar deneyin; …" | note left false
```

Tarayıcıda yarışın notu çerez olarak elle yerleştirildi. Adaptörün notu gerçekten yazdığını canlı test gösteriyor (K1-note mutantı).

### Kapılar

```
pnpm typecheck      rc=0
pnpm lint           rc=0 (tam)
pnpm test           Test Files 213 passed | 2 skipped (215) · Tests 2434 passed | 8 skipped (2442)
pnpm rls:check      ✅ SUCCESS
pnpm i18n:check     ❌ — yalnız application/client.tsx 38 → 39 (+1). Bu benim değişikliğim değil: 587a50e0'dan geliyor,
                    crw-fb İNCELEME-19 B-5'te raporlandı. Bu kartın dosyalarında JSX/metin yok.
DB artığı           oauth-%@example.com kullanıcı 0 · crw_m2_% trigger 0 · fonksiyon 0
```

## 3) Değişen dosyalar

- `src/lib/auth.ts`: `pages.error`, adaptörde not yazımı, import.
- `src/lib/agency/registration-invite-cookie.ts`: `REGISTRATION_REFUSAL_COOKIE`, `setRegistrationInviteRefusal`, `takeRegistrationInviteRefusal`.
- `src/lib/oauth-registration.ts`: `oauthRefusalPath` dışa açıldı, `refuse()` onu kullanıyor.
- `src/app/api/auth/hata/route.ts` (yeni).
- `tests/oauth-registration.live.test.ts`: M2 testi, 2 K-1 testi, trigger yardımcısı.
- Bu rapor ve 3 kare.

## 4) Riskler

- **Artık her "error" türü hata giriş kartına gidiyor.** Buna gerçek yapılandırma hataları da dahil (ör. `AUTH_SECRET` yok). Önceden Auth.js sayfası "server configuration" diyordu. Şimdi kullanıcı genel mesajı görüyor. Sunucu logu aynı (`[auth][error]`), yani teşhis kaybı yok. Sentry/log akışı değişmedi.
- **`/en/...` hatalar da `/tr/giris`'e gidiyor.** Bu, mevcut `pages.signIn: "/tr/giris"` ile aynı davranış. Davet yarışı ise kaydın diline göre yönleniyor.
- Not çerezi 60 sn. Yönlendirme zinciri bundan uzun sürerse kullanıcı genel mesajı görür. Bu kabul edilebilir bir düşüş.

## 5) Açık sorular

- Yok.

## 6) Sonraki adım

- crw-fb incelemesi.
- 587a50e0 i18n +1 sahibine (B-5) ayrı kart zaten önerildi.

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, Node 26.5, Docker Postgres 16, `next dev` :3000, Chromium headless-shell 1243). Değişen kod sunucu tarafında TS: Auth.js yapılandırması, Next.js route handler ve çerez. Süreç, dosya yolu, kabuk ya da ekran bağımlılığı yok. Windows ve Linux'ta aynı davranış beklenir. Bu platformlarda **koşulamadı**, çünkü makinede yalnız macOS var.
