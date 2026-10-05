# TASK-MUM676F010E9G — FB giriş OAuth (ADR-0006) · be-fb

**Commit:** `9fbc81f8` (dal `dev`, push yok) · **Platform:** macOS (Darwin 27.0.0) üzerinde doğrulandı.

## 1. Ne yapıldı

1. **Kayıt ekranı** (`/kayit?kod=…`, `AuthCard.tsx`): Ajans kanalı eki kısa metni (başlık, ajans ne görür, ne görmez) ve tek onay kutusu Google/Microsoft butonlarından **önce** gösteriliyor. Kutu varsayılan olarak işaretsiz. Kodlu kayıtta etiket `disclosureAckAgency`, sürüm satırı üç belgeyi gösteriyor. S2-a ("kod varken OAuth gizli") kaldırıldı. Onay verilmeden OAuth başlatılamıyor: istemci bunu kontrol ediyor, `loginWithSocialAction` da ek sürümünü içeren damga yoksa `{ error }` dönüyor.
2. **İmzalı davet çerezi** (`src/lib/agency/registration-invite-cookie.ts`): Kod, onay damgası ve dil bilgisi HMAC-SHA256 ile imzalanıyor. Anahtar AUTH_SECRET'tan etiketle türetiliyor. Çerez `httpOnly`, `SameSite=Lax` ve 15 dakikalık `maxAge` taşıyor; ayrıca **imzalı `exp`** var, yani süre tarayıcıdan bağımsız da denetleniyor. Çerez kullanıldıktan sonra siliniyor. Onay çerezi de artık tek kullanımlık.
3. **`signIn` callback** (`src/lib/oauth-registration.ts` → `decideOAuthSignIn`): Adapter hiçbir satır yazmadan önce çalışıyor.
   - Bağlı hesap varsa giriş yapılır ve kod yok sayılır.
   - Aynı e-postayla kullanıcı varsa bağlama yalnız doğrulanmış e-postayla yapılır; kod yine yok sayılır.
   - Yeni kullanıcıda onay yoksa kullanıcı `/tr/kayit?error=disclosure_required` adresine gönderilir.
   - Çerez bozuk ya da süresi dolmuşsa, veya kod geri alınan deneme kullanımında (`redeem_agency_invite`, sayılmaz) reddedilirse `invite_invalid` döner. Bütün kötü kod durumları için mesaj tek tiptir ve ret `note_agency_invite_rejection` ile sayılır.
4. **Atomik kayıt** (`registerOAuthUserWithInvite`, `adapter.createUser` içinden): User, kodun kullanılması (`redeem_agency_invite`), `Tenant.agencyId`, workspace, membership, 3 Consent satırı ve `agency.invite.redeemed` audit kaydı **tek transaction** içinde yazılıyor. Kod reddedilirse hiçbir şey yazılmıyor. Bu yolda sahte kullanıcı fallback'i yok.
5. **Consent:** Yeni belge `AGENCY_CHANNEL_ADDENDUM` eklendi: `id: 'agency-channel-addendum'`, `version: '2026-09-29.1'`, `DISCLOSURE_ACK`, amaç `ACCOUNT_REGISTRATION`. `registrationAcknowledgementToken/acknowledgementMatchesCurrent/registrationConsentRows` fonksiyonları `{ agency }` kapsamı alıyor. **Şema değişikliği gerekmedi.** Belgeyi `documentId` ayırıyor, bu yüzden leed-fb'ye şema yazısı gönderilmedi. Credentials (demo) yolu da artık kodlu kayıtta ek sürümünü içeren damgayı istiyor. Bu gevşetme değil, sıkılaştırma; derleme zamanı kilidine dokunulmadı.
6. **Hesap bağlama:** `allowDangerousEmailAccountLinking: true` duruyor, ancak bağlamaya signIn callback'te `providerVerifiedEmail` izin veriyor:
   - Google: `email_verified === true` olmalı ve aynı adres olmalı.
   - Entra: v2'deki `email` claim'i doğrulanmamış bir claim ve yöneticiler değiştirebiliyor. Microsoft bu claim'in yetkilendirmede kullanılmamasını öneriyor. Bu yüzden yalnız opsiyonel `xms_edov` ya da `verified_primary_email` claim'i kabul ediliyor. Bu claim'ler uygulama kaydında eklenene kadar Entra ile var olan hesaba bağlama **reddediliyor**. İlk Entra kaydı normal çalışıyor.
   - Bilinmeyen sağlayıcı ya da claim yoksa bağlama reddediliyor.
   - Gerekçe: bayrağı tamamen kapatmak Google↔Microsoft arası meşru bağlamayı kırıyordu. Koşulsuz açık bırakmak ise doğrulanmamış bir adresle hesap ele geçirmeye yol açıyordu.
7. **Patron kararı (29.09):** Entra kodu duruyor. Sağlayıcı yalnız `AUTH_MICROSOFT_ENTRA_ID_ID` ve `…_SECRET` ikisi de doluysa kaydediliyor; buton da yalnız o zaman görünüyor. **Entra: anahtarlar eklenince açılır.**
8. **Bulunan ve düzeltilen hata:** Auth.js e-posta ile bağlamada da `events.createUser`'ı çağırıyor (`@auth/core` handle-login.js). Bu yüzden Google'ı var olan bir hesaba bağlayan kişiye **ikinci, boş bir "My Organization" kiracısı** açılıyordu. Artık yalnız adapter'ın gerçekten yarattığı kullanıcı için kiracı kuruluyor (`createdByAdapter`).

## 2. Kanıt

**Canlı test, gerçek Auth.js callback'i, sahte sağlayıcı, `fabrika_app` (NOBYPASSRLS):** `tests/oauth-registration.live.test.ts`

Bu test uygulamanın `authConfig`'ini (signIn, adapter, events) sahte Google ve Entra sağlayıcılarıyla çalıştırıyor. Sahte sağlayıcılar yerel bir HTTP sunucusunda token ve userinfo uç noktalarını taklit ediyor. **Gerçek Google/Entra anahtarı kullanılmadı.** Uygulamanın `prisma` bağlantısı `DATABASE_URL_RLS_TEST` adresine yönlendirildi ve `assertRlsSubjectRole` ile rolün RLS'ye tabi olduğu doğrulandı. 8 senaryo:

- Kodlu kayıt (Google) → oturum çerezi, `Tenant.agencyId = ajans`, 3 Consent satırı (`agency-channel-addendum@2026-09-29.1` dahil), audit 1, `usedCount = 1` (deneme kullanımı sayılmadı), çerez silindi.
- Kodlu kayıt (sahte Entra) → aynı akış; sağlayıcıdan bağımsız.
- Damgada ek sürümü yok → `/tr/kayit?error=disclosure_required`, kullanıcı oluşmadı.
- Hiç onay yok → aynı ret, kullanıcı oluşmadı.
- Süresi dolmuş çerez (16 dk) → `invite_invalid`, kullanıcı oluşmadı, kod kullanılmadı.
- Bilinmeyen kod ve iptal edilmiş kod → **aynı** yönlendirme, kullanıcı oluşmadı. Ret sayıldı: iptal edilen kod için ajansın AuditEvent'ine +1, bilinmeyen kod için SystemAlert sayacına +1 (sayaç eski haline getirildi).
- Doğrulanmamış e-postayla bağlama (Google `email_verified:false` ve düz Entra) → `/tr/giris?error=email_unverified`, Account satırı yok. Doğrulanmış e-postayla → bağlandı, **membership 0** (hata düzeltmesinin kanıtı), kod kullanılmadı.
- Kodsuz, düz onayla kayıt → 2 Consent satırı, `agencyId` null.

```
$ npx vitest run tests/oauth-registration.live.test.ts tests/oauth-registration.test.ts
 Test Files  2 passed (2)
      Tests  25 passed (25)
```

Hata düzeltmesinden önceki koşu, bağlama hatasını gerçekten yakaladı: `expected [ { …(7) } ] to have a length of +0 but got 1`.

**Tam kapı** (`set -a; source .env; set +a`):

```
pnpm lint            → exit 0
pnpm typecheck       → exit 0
pnpm test            → Test Files 200 passed | 2 skipped (202) · Tests 2314 passed | 8 skipped
pnpm i18n:check      → ✅ i18n check passed … no file gained hard-coded text (baseline 325/325)
pnpm rls:check       → ✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation
pnpm rls:bypass-check→ ✅ SUCCESS: no new tenant bypass … 0 still owed
pnpm rls:verify      → ✅ 47 kiracıya özel tabloda … fabrika_app rolüyle GERÇEKTEN ölçüldü
```

**Gerçek tıklama, gerçek Google** (leed-fb'nin :3000 sunucusu, aynı ağaç, ikinci `next dev` açılmadı). Yerelde test ajansı `mum676-google-test-agency` ve gerçek bir kod oluşturuldu.

- `01-kayit-kodlu.png`: ek kutusu, il seçimi ve onay kutusu (3 sürüm) Google butonundan önce görünüyor.
- `02-onaysiz-ret.png`: kutu işaretlenmeden Google'a tıklandığında hata kutusu metni okundu: "Devam edebilmek için aydınlatma metnini ve ajans kanalı ekini okuduğunuzu, kullanım koşullarını kabul ettiğinizi onaylamanız gerekir." Hata sayfanın üstünde; kare kaydırılmış konumda alındığı için metin karede görünmüyor, `read` ile doğrulandı.
- `03-onayli-yonlendirme.png` ve `04-google-oturum-sayfasi.png`: kutu işaretlenip tıklandıktan sonra **gerçek Google oturum açma sayfası** geldi. **`redirect_uri_mismatch` alınmadı.**
- **Tamamlanmayan son adım:** Google hesabıyla giriş yapılıp callback'e dönülmesi. Test hesabım yok ve kimlik bilgisi girmedim. Bu adımı bir insanın yapması gerekiyor. Callback tarafı yukarıdaki canlı testle kanıtlandı.

Kareler: `docs/agent-results/TASK-MUM676F010E9G-screenshots/`. Karelerde kişisel veri yok.

## 3. Değişen dosyalar

- `src/app/[locale]/login/AuthCard.tsx`: ek kutusu, kayıt bloğu butonlardan önce, S2-a kaldırıldı, `?error=` mesajları eklendi.
- `src/lib/auth.ts`: `authConfig` dışa açıldı, signIn callback, adapter ile atomik kodlu kayıt, events tekrarı düzeltildi, Entra yapılandırmaya bağlandı.
- `src/lib/oauth-registration.ts` (yeni): karar kapısı, `providerVerifiedEmail`, deneme kullanımı, kiracı kurulumu.
- `src/lib/agency/registration-invite-cookie.ts` (yeni).
- `src/lib/actions/auth.ts`, `src/lib/legal/consent-documents.ts`, `src/lib/legal/registration-consent.ts`, `src/lib/legal/registration-ack-cookie.ts`.
- `messages/tr.json`, `messages/en.json`: `Auth.agencyInvite.*`, `disclosureAckAgency`, `disclosureRequiredAgency`, `signInError.*`.
- `tests/oauth-registration.test.ts`, `tests/oauth-registration.live.test.ts` (yeni) ve `src/lib/auth-callbacks.test.ts` (Entra koşullu kaydı).
- `vitest.config.mts`: `server.deps.inline: ['next-auth']`. Gerekçe: next-auth'un ESM'i `next/server`'ı uzantısız import ediyor ve Node dış yükleme sırasında bunu reddediyor. Tam kümede regresyon yok.

## 4. Riskler

- **Google tüketici adı "cevreportal":** Google oturum sayfası "cevreportal uygulamasına devam edin" diyor. OAuth istemcisi ya da izin ekranı başka bir projeye ait görünüyor. Pilotta kullanıcı yanlış marka görecek. Patron kartı TASK-MULQM3LFB4KRA kapsamında düzeltilmeli.
- **Davranış değişikliği:** Onay vermemiş yeni OAuth kullanıcısı artık reddediliyor. Örneğin "Giriş Yap" sekmesinden yeni bir Google hesabıyla gelen kişi `/kayit?error=disclosure_required` sayfasına gidiyor. Önceki A3 tasarımında hesap açılıyor ve uyarı düşülüyordu; ADR-0006 bunu gerektiriyor.
- **Fail-closed:** signIn callback'te veritabanı hatası olursa OAuth girişi reddediliyor (AccessDenied). Eskiden adapter'ın fallback'i sahte kullanıcı açabiliyordu.
- **Entra bağlama:** `xms_edov` claim'i uygulama kaydına eklenmeden Entra ile var olan hesaba bağlama yapılamaz. Bu bilerek seçildi.
- **Yarış:** Deneme kullanımı ile gerçek kullanım arasında kod iptal edilirse adapter hata fırlatıyor ve kullanıcı Auth.js hata sayfasını görüyor, tek tip mesajı değil. Hiçbir şey yazılmıyor ve ret sayılıyor.
- **İmza anahtarı:** AUTH_SECRET döndürülürse o anda uçuşta olan davet çerezleri geçersiz olur; kullanıcı `invite_invalid` görüp yeniden dener.

## 5. Açık sorular

- Ek sürümü `2026-09-29.1` yalnız ekrandaki kısa metni kapsıyor. Tam ek sayfası (`/privacy/agency-channel`) hukuk onayını bekliyor (ek §6). Sayfa yayınlandığında `href` güncellenmeli ve sürüm artırılmalı.
- Ekrandaki "ajans ne görür" metni cs-fb önerisinden sapıyor: öneride "kaç başvuru yapıldı" yazıyordu, ek §6 ise "Başvuru sayısını görmez" diyor. Metin eke uyduruldu. Ajans adı gösterilmiyor, çünkü sunucu tarafında koddan adı okuyan bir fonksiyon yok (şema/SECURITY DEFINER gerektirir).
- Yerel test ajansı `mum676-google-test-agency` ve kodu, insan tarafından yapılacak son adım için DB'de bırakıldı. Kod leed-fb'ye ayrıca iletildi; bu raporda yok.

## 6. Sonraki adım

- Bir insan, bir test Google hesabıyla `http://localhost:3000/tr/kayit?kod=<kod>` → kutuyu işaretle → Google akışını tamamlamalı, ardından DB'de `Tenant.agencyId` ve Consent satırlarını kontrol etmeli.
- Google izin ekranındaki uygulama adı düzeltilmeli; Entra uygulama kaydına `xms_edov` opsiyonel claim'i eklenmeli (TASK-MULQM3LFB4KRA).

**Platform beyanı:** macOS'ta doğrulandı. Değişen kod platformdan bağımsız: süreç, dosya yolu ya da kabuk kullanımı yok; yalnız HTTP, çerez ve Postgres. Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. Koddan bakıldığında davranış farkı beklenmiyor.
