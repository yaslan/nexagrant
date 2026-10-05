# TASK-MUM74FUB1DRCM — İNCELEME-12 takip (be-fb): Ö-1, K-5, K-6

Kaynak: `docs/agent-results/TASK-MUM5YQCBNF5QW-crw-fb.md` (Ö-1, K-5, K-6). Dal `dev`, kod commit'i `15f70b0d`. Push yapılmadı.

## 1. Ne yapıldı

**Ö-1: kayıt çerezleri tek kullanımlık, Auth.js'in varsayılan giriş sayfası kapalı**

- Yeni `clearRegistrationProvinceCookie()` (`src/lib/registration-province-cookie.ts`) ve `clearRegistrationReadinessCookie()` (`src/lib/registration-readiness-cookie.ts`). İkisi de onay çerezindeki deseni izliyor: istek bağlamı yoksa sessizce geçiyor.
- `src/lib/auth.ts` içinde il ve karne çerezleri `clearRegistrationChoiceCookies()` ile, okunduktan hemen sonra siliniyor. Kayıt başarılı olsa da olmasa da siliniyorlar. Dört yol var:
  1. Adaptör, davet kodlu kayıt: okunuyor ve aynı anda siliniyor. Ek bildirimi eksik olduğu için gelen ret de bu yola dahil.
  2. `events.createUser`, kodsuz kayıt: okunuyor ve silinip transaction öyle açılıyor.
  3. `events.createUser`, var olan hesaba e-postayla bağlama ve davetli kayıt (`created !== 'pending'`): çerezler kullanılmıyor ama siliniyor.
  4. `signIn` callback'i reddettiğinde (`decision.allow === false`): akış bittiği için siliniyor. crw-fb bu yolu yazmamıştı. Burada kapatılmasa A'nın vazgeçtiği kayıttan sonra B'nin reddedilen denemesi çerezleri bırakırdı.
- `authConfig.pages.signIn = "/tr/giris"`. Artık `GET /api/auth/signin` Auth.js'in kendi sayfasını çizmiyor; 302 ile `/tr/giris?callbackUrl=…` adresine yönlendiriyor. OAuth yalnız `loginWithSocialAction` üzerinden başlıyor ve bu eylem her kayıt çerezini önce yazıyor ya da siliyor. ADR-0006 ile de uyumlu.

**K-5.** `src/lib/agency/funnel.attack.test.ts` dosyasındaki 12 özellik testine `PROPERTY_TIMEOUT_MS = 30_000` eklendi.

**K-6.** `docs/RELEASE_CHECKLIST.md` dosyasına **§4** eklendi. Bölüm, zincir yeniden koşarken açılan `redeem_agency_invite` penceresini anlatıyor. Pencere ölçüldü ve `BEGIN … ROLLBACK` içinde tekrar üretildi. Yayın için iki madde ve bir kontrol sorgusu da içeriyor.

## 2. Kanıt

### Ö-1: canlı test (gerçek Auth.js callback, sahte sağlayıcı, `fabrika_app`)

`tests/oauth-registration.live.test.ts` dosyasına yeni `describe` eklendi. 5 yeni test var, eski 8 test aynen duruyor.

```
$ npx vitest run tests/oauth-registration.live.test.ts
 Test Files  1 passed (1)
      Tests  13 passed (13)          ← skip yok
```

Yeni testler:
- **Ortak tarayıcı:** A kutuyu işaretleyip vazgeçiyor (çerezler park edilmiş durumda). B aynı tarayıcıda kayıt oluyor: il `Ankara` ve karne B'nin kiracısına yazılıyor, çerezler siliniyor. Ardından C seçim yapmadan kayıt oluyor: C'nin kiracısında `province = NULL` ve `settings.readiness` yok.
- **Davet kodlu kayıt:** kiracı `agencyId` ve `province` alıyor, iki çerez de siliniyor.
- **Reddedilen kayıt** (ek bildirimi yok): kullanıcı oluşmuyor, iki çerez de siliniyor.
- **Var olan hesaba bağlama:** iki çerez de siliniyor.
- **`GET /api/auth/signin`:** 302 dönüyor ve yol `/tr/giris`.

### Mutasyon kanıtı (her silme noktası tek tek geri alındı)

```
== M1 event pending-path clear removed   × shared browser: A parks a result, B registers, C registers next — only B gets it   Tests 1 failed | 12 passed
== M2 adapter invite-path clear removed  Tests 13 passed (13)        ← HAYATTA KALDI, aşağıya bakın
== M3 pages.signIn removed               × Auth.js's own sign-in page redirects to /tr/giris                                  Tests 1 failed | 12 passed
== M4 signIn-refusal clear removed       × a refused invite registration spends them too                                      Tests 1 failed | 12 passed
== M5 link-path clear removed            × linking to an existing account spends them                                         Tests 1 failed | 12 passed
restored   (cmp auth.ts == yedek)
```

M2'nin hayatta kalmasının sebebi şu: davetli kayıt başarılı olunca `events.createUser` ('bootstrapped' dalı) çerezleri zaten siliyor. Adaptördeki silme yalnız adaptör hata fırlattığında fark yaratıyor. Örneğin kod, `signIn` yoklaması ile adaptör arasında iptal edilirse. Bu yarışı testte kurmadım. Adaptördeki silme o yol için savunma olarak duruyor ve bu yol testle kapsanmıyor.

### Ö-1: curl ve gerçek tarayıcı (:3000'deki dev sunucusu, cwd FONBRIDGE, hot reload)

```
$ curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/api/auth/signin
302 http://localhost:3000/tr/giris?callbackUrl=http%3A%2F%2Flocalhost%3A3000
$ curl -s -L -o /dev/null -w 'final=%{http_code} %{url_effective}\n' http://localhost:3000/api/auth/signin
final=200 http://localhost:3000/tr/giris?callbackUrl=http%3A%2F%2Flocalhost%3A3000
```

Değişiklikten önce aynı adres Auth.js'in kendi sayfasını 200 ile çiziyordu. crw-fb'nin raporunda `grep pages:` sonucu boştu. M3 mutasyonunda da test kırmızıya düşüyor.

Gerçek tıklama, Chrome başsız modda: `/tr/kayit?il=Ankara&kaynak=fon-hazirlik&karne=…` açıldı, bildirim onayı ve karne kutusu işaretlendi, "Google ile Devam Et" butonuna basıldı:

```
default page -> http://localhost:3000/tr/giris?callbackUrl=http%3A%2F%2Flocalhost%3A3000 200
readiness box ticked
google authorize: https://accounts.google.com/o/oauth2/v2/auth redirect_uri= http://localhost:3000/api/auth/callback/google
parked registration cookies: fabrika_registration_ack, fabrika_registration_province, fabrika_registration_readiness
```

Yani asıl akış bozulmadı: eylem çerezleri park ediyor ve tarayıcı Google'a gidiyor. Ekran görüntüleri:
- `TASK-MUM74FUB1DRCM-screenshots/1-api-auth-signin-redirects.png`: `/api/auth/signin` adresinin açtığı sayfa, yani uygulamanın kendi giriş kartı.
- `TASK-MUM74FUB1DRCM-screenshots/2-kayit-before-google.png`

### K-5

```
$ npx vitest run src/lib/agency/funnel.attack.test.ts           → Tests 24 passed (24), 7.2 s
8 CPU yakıcı altında (verbose): en yavaş seed 1242 ms            → bu makinede 5 s'yi aşan yük üretemedim
Mutasyon: PROPERTY_TIMEOUT_MS = 500 → "Error: Test timed out in 500ms." · Tests 12 failed | 12 passed (24)
```

12 özellik testinin hepsi sabite bağlı. Sabit geri `30_000` yapıldı.

### K-6: pencere (yerel Postgres `fabrika-postgres`, `BEGIN … ROLLBACK`)

```
 after chain (current state)           | k6-agency     ← maxUses = NULL olan kod kabul ediliyor
 --- re-running add-agency-invite-code.sql (file 23)
 window: file 23 done, file 30 not yet |               ← NULL: reddediliyor
 --- re-running agency-invite-no-max-uses.sql (file 30)
 file 30 done                          | k6-agency     ← yeniden kabul
 probe_rows_left = 0                                   ← ROLLBACK, kalıcı iz yok
```

- Süre: 23.-30. dosyalar sırayla **1,20 sn** sürdü, dosya başına 0,08-0,10 sn.
- Kontrol sorgusu (§4) pencere içinde `t`, ROLLBACK sonrası `f` döndü.

### Kapı

```
pnpm typecheck  → OK
pnpm lint       → OK
pnpm test       → Test Files 200 passed | 2 skipped · Tests 2322 passed | 8 skipped, 0 failed
pnpm i18n:check → passed
rls:check rc=0 · rls:bypass-check rc=0 · rls:verify rc=0
```

`test:e2e` ve `alerts:check` koşulmadı. Playwright kendi `next dev` sunucusunu açıyor (`reuseExistingServer: false`); aynı dizinde başka bir ajanın :3000 sunucusu çalıştığı için bu çakışırdı. Gerçek tıklama kanıtı yukarıdaki tarayıcı koşusunda.

## 3. Değişen dosyalar (commit `15f70b0d`)

- `src/lib/auth.ts`
- `src/lib/registration-province-cookie.ts`
- `src/lib/registration-readiness-cookie.ts`
- `tests/oauth-registration.live.test.ts`
- `src/lib/agency/funnel.attack.test.ts`
- `docs/RELEASE_CHECKLIST.md`
- Rapor ve ekran görüntüleri ayrı bir commit'te.

`AuthCard.tsx` dosyasına dokunulmadı; fe-fb paralel çalışıyor.

## 4. Riskler

- **Auth.js oturum açma hataları artık `/tr/giris?error=<Tip>` adresine gidiyor.** `pages.signIn` tanımlı olduğu için `kind = "signIn"` sınıfındaki hatalar (`OAuthAccountNotLinked`, `OAuthCallbackError`, `OAuthSignInError`, `MissingCSRF`, `AccountNotLinked`) Auth.js'in İngilizce hata sayfası yerine giriş kartına düşüyor. `AuthCard.tsx:91` yalnız üç bilinen kodu mesaja çeviriyor, bu tipleri sessizce yok sayıyor. Sonuç: kullanıcı hata metni görmeden giriş sayfasına dönüyor. Bu bir güvenlik sorunu değil, UX eksiği. Çözüm fe-fb'ye düşüyor: bu tipler için genel bir "Giriş tamamlanamadı, tekrar deneyin" mesajı. `kind = "error"` sınıfındaki hatalar (`Configuration` vb.) eskisi gibi `/api/auth/error` adresine gidiyor.
- **Tüm diller `/tr/giris`'e gidiyor.** Bu adres yalnız doğrudan `/api/auth/signin` açılınca ve Auth.js hatalarında kullanılıyor. Uygulamanın kendi yönlendirmeleri (`oauth-registration.ts`) dili koruyor.
- **Tam hazırlanmış bir POST hâlâ mümkün.** `/api/auth/csrf` adresinden token alıp `POST /api/auth/signin/google` göndermek eylemi atlatır; bunu `pages.signIn` engellemez. Ama çerezler artık tek kullanımlık: var olan tek olası sonuç, A'nın 15 dakika içinde vazgeçtiği seçimlerin B'nin **ilk** kaydına yazılması. B'nin bunu bilerek yapması gerekiyor. Tam kapatmak için `signIn` callback'inde çerezin eylemden geldiğini imzalı bir işaretle kanıtlamak gerekir; bu ayrı bir kart olur.
- **M2 testle kapsanmıyor.** Adaptördeki silme yalnız hata yolunda anlamlı ve bu yarış testte kurulmadı.
- **Yerel dev veritabanında zincir 8. dosyada duruyor.** `retire-eur-plan-ladder.sql` "1 subscription(s) still on an unmapped plan" diyerek kendi koruması yüzünden duruyor. Bu işle ilgili değil; ölçüm için 23.-30. dosyaları ayrıca koştum. Yerel veride eşleşmemiş planda bir abonelik var.

## 5. Açık sorular

- `/api/auth/error` sayfası da kapatılmalı mı (`pages.error`)? Şu an yalnız yapılandırma hatalarında görünüyor ve üzerindeki "Sign in" bağlantısı artık `/tr/giris`'e gidiyor.
- K-6 penceresini migration'la kapatalım mı? 23. dosya fonksiyonu yalnız hiç yokken oluşturabilir. Ayrı kart gerekir; §4'te yazılı.

## 6. Sonraki adım

- crw-fb yeniden incelemesi.
- fe-fb: `AuthCard.tsx` içinde Auth.js hata tipleri için genel mesaj (Risk 1).
- İsteğe bağlı kart: 23. dosyada `redeem_agency_invite` fonksiyonunu yalnız hiç yokken oluşturmak (K-6'yı kalıcı kapatır).

**Platform:** mac (Darwin 27, Node 26.5, Chrome başsız, Postgres docker). Değişen kod platformdan bağımsız: çerez API'si, Auth.js yapılandırması ve SQL. Windows ve Linux'ta koşulmadı; kodda platforma bağlı yol yok. K-6 ölçümü yerel docker Postgres'te yapıldı. Üretimde süre, ağ gecikmesi × 8 dosya kadar uzar; §4'te bu yazılı.
