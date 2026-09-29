# TASK-MUN2793A57Z9I — cs-fb — FB davet kabul sayfası (Sprint FB-KAMU-2)

Dal `dev`. Kod commit'leri: `0ae3175b` (özellik), `24666974` (canlı test). be-fb, TASK-MUN2KUHP1BP18 kapsamında `acceptInvitationIn`'e bir id koruması ekledi (`f09e910a`). Bu değişiklik benim tasarımımla uyumlu: boş anahtarda `'lost'` döner.

## 1. Ne yapıldı

Davet e-postasındaki bağlantı artık çalışıyor. Akış şöyle:

1. **`GET /[locale]/accept-invite?token=…`** (`src/app/[locale]/accept-invite/route.ts`): token'ı biçim kontrolünden geçirir (64 hex) ve `fabrika_invitation_accept` çerezine koyar. Çerez httpOnly, SameSite=Lax, 30 dk geçerli, değeri `<dil>.<token>`. Sonra `303` ile token'sız `/[locale]/accept-invite/continue` adresine yönlendirir. Yanıtta `Referrer-Policy: no-referrer` ve `Cache-Control: no-store` var. Bu adımda hiçbir şey yazılmaz ve karar verilmez. E-posta tarayıcısı bağlantıya tıklarsa yalnız bir çerez alır. Bozuk token gelirse eski çerez silinir. (se-fb (d))
2. **Kabul ekranı** `/[locale]/accept-invite/continue` (`page.tsx`, `AcceptInviteActions.tsx`, `actions.ts`): token'ı çerezden okur. Durumlar ayrı mesajlarla gösterilir: geçersiz, iptal (kuruluş silinmiş), süresi dolmuş, kullanılmış, salt-okunur (pilotu bitmiş kiracı), yanlış hesap (davet edilen adres maskeli gösterilir: `i***@example.test`), bekleyen. Sayfanın `<meta name="referrer" content="no-referrer">` etiketi ve `noindex` ayarı var. `next.config.ts` bu yol için de Referrer-Policy ve no-store başlıklarını ekler. Metinlerin hepsi tr/en katalogda (`AcceptInvite`).
3. **Kabul çekirdeği** `src/lib/invitations/accept.ts`:
   - `lookupInvitation`: satır `tokenHash` ile bulunur, sonra `secretTokenMatches` (timingSafeEqual) ile kontrol edilir. Sorgu `withSystemScope('tenant-discovery')` ile yapılır, çünkü davetlinin henüz kiracısı yok. Baseline'a gerekçeli bir girdi eklendi. (se-fb (a))
   - `acceptInvitationIn`: bağlantıyı tek bir koşullu `UPDATE … WHERE acceptedAt IS NULL AND expires > now` ile harcar. Sonra `Membership` açılır (rol davettekidir, `workspaceIds: []` = tüm alanlar) ve `invitation.accepted` denetim satırı yazılır (adres yazılmaz). Aynı anda gelen iki kabulden yalnız biri kazanır. (se-fb (b))
   - `acceptInvitation`: oturumdaki e-posta davetteki e-postayla aynı değilse `email_mismatch` döner. Zaten üyeyse sonuç idempotent olur ve kişi çalışma alanına gider. Pilotu bitmiş kiracıda `pilot_expired` döner; kontrol `assertTenantActionWritable`'ın kullandığı `getPilotState` ile yapılır. (se-fb (c))
4. **Hesabı olmayan davetli (Google)**:
   - `decideOAuthSignIn` (`src/lib/oauth-registration.ts:177`) yeni bir davet dalı aldı. Adres Google tarafından doğrulanmış olmalı, davet edilen adresle aynı olmalı, gizlilik onayı işaretlenmiş olmalı, kiracı yazılabilir olmalı. Koşulların biri tutmazsa kişi hata koduyla kabul ekranına döner ve hesap açılmaz.
   - Bu dal **hiçbir durumda düz kayda düşmez**, yani yeni kiracı açılmaz.
   - Adaptörün `createUser` adımı (`src/lib/auth.ts:152`) `registerInvitedOAuthUser` çağırır. Kullanıcı, üyelik, harcanan bağlantı, denetim satırı ve onay satırları davet eden kiracıda **tek transaction** içinde yazılır. `events.createUser` kiracı kurmaz.
5. **Çakışma incelemesi (OAuth kayıt akışı)**:
   - `loginWithSocialAction`, her OAuth başlangıcında davet çerezini siler. Böylece yarım bırakılmış bir davet sonradan `/kayit`'taki düz kaydı ele geçiremez.
   - Kabul ekranının Google düğmesi ajans davet kodu, il ve karne çerezlerini temizler.
   - Mevcut hesaplar (dönen giriş ya da doğrulanmış adresle bağlama) eskisi gibi girer. Kabul ekranda tıkla yapılır.
   - Ajans davet kodu (`invite_invalid`) mantığı değişmedi: davet çerezi yokken akış birebir aynı. Bunu unit testteki "no invitation" vakası gösteriyor.
6. **Şema ve koltuk**:
   - `Invitation.acceptedAt` eklendi (`prisma/migrations/invitation-accepted-at.sql` + `.down.sql`, `apply-order.txt`).
   - Koltuk sayımı yalnız kabul edilmemiş davetleri sayar (`seat-limit.ts`).
   - Aynı adrese yeniden davet `acceptedAt`'ı sıfırlar (`route.ts`, tek satır, be-fb'nin satırlarına dokunulmadı).
7. **Belge**: `docs/legal/processing-register.md` §2'de veri kategorileri, alıcı notu ve saklama güncellendi; §22 md.14 kapatıldı. Yeni alıcı yok. Hukuk paketi (HUKUK-SORULARI) bu konuya değinmiyor, sürümü değişmedi.

## 2. Kanıt

**Unit** (`src/lib/invitations/accept.test.ts`): `Tests 18 passed (18)`. Kapsam: durum sınıflama, çerez biçimi, e-posta eşleştirme ve maskeleme, `decideOAuthSignIn` davet dalının 8 vakası. `f09e910a`'dan sonra yeniden koşuldu: 18/18.

**Canlı** (`tests/invitation-accept.live.test.ts`, `fabrika_app` NOBYPASSRLS, izole DB `csfb_mun27` = `fabrika`'nın pg_dump kopyası + göç), `--reporter=verbose`:
```
✓ GET … moves the token into an httpOnly cookie and redirects to a URL without it
✓ GET … a malformed token clears an earlier cookie instead of keeping it
✓ valid: membership with the invited role, link spent, audit row; a second accept is idempotent
✓ expired: refused, no membership
✓ used (accepted, and this account is not a member): refused
✓ another account (the inviter holds the raw token too): email_mismatch, link stays pending
✓ unknown token: invalid; deleted tenant: revoked
✓ expired pilot: refused as a write, no membership, link stays pending
✓ two concurrent accepts: one membership, one audit row, both land in the workspace   (4 paralel çağrı)
✓ the core refuses a link spent after the caller looked (race window): lost, no membership
✓ seat limit: an accepted invitation is no longer a pending seat
✓ Google (gerçek Auth.js callback, sahte sağlayıcı): joins the inviting tenant, no tenant of its own, consent rows there
✓ a different Google address: back to the accept screen, no user, link pending
✓ no acknowledgement: disclosure_required, no user
✓ address not verified by Google: email_unverified, no user
✓ an expired invitation never becomes a plain registration: no user, no tenant
✓ an existing account signs in as before; the invitation waits for its click
Tests 17 passed (17)
```
Test verisi yalnız bu dosyanın oluşturduğu id'lerle, tek tek siliniyor (`tenant.delete({where:{id}})`, kullanıcı başına `consent.deleteMany({where:{userId:id}})`). Koşudan sonra: `Tenant slug like 'inv-%'` = 0, `User email like 'inv-%'` = 0.

**Mutantlar** (15/15 ÖLDÜ; her mutantın ardından dosya işlenmemiş haline döndü, `git status` temiz):
```
M1 email match skipped (existing account)            ÖLDÜ   M9  signIn: unverified accepted              ÖLDÜ
M2 acceptedAt IS NULL dropped from claim             ÖLDÜ*  M10 adapter: no invitation branch            ÖLDÜ
M3 pilot gate skipped                                ÖLDÜ   M11 GET: no Referrer-Policy                  ÖLDÜ
M4 expiry not checked                                ÖLDÜ   M12 GET: token kept in redirect URL          ÖLDÜ
M5 deleted tenant not revoked                        ÖLDÜ   M13 seat limit counts accepted               ÖLDÜ
M6 signIn: email mismatch not refused                ÖLDÜ   M14 membership create skipped                ÖLDÜ
M7 signIn: acknowledgement not required              ÖLDÜ   M15 cookie not httpOnly                      ÖLDÜ
M8 signIn: unusable falls through to plain registr.  ÖLDÜ
```
\* M2 ilk turda HAYATTA kaldı, çünkü eşzamanlı testte `Membership` unique anahtarı kurtarıyordu. Bunun üzerine "race window" testi eklendi ve M2 öldü.

**Gerçek uçtan uca** (Playwright + sistem Chrome, gerçek tıklama). Ortam: temiz worktree `88dad4b5`, kendi `next dev -p 3327`, kendi mailpit `csfb-mun27-mailpit` (11327/18327), izole DB. Davet eden `admin@yasinaslan.com.tr` (demo-tenant sahibi, izole DB'de `seatsExtra=20`).
```
INVITE davetli-mun27@example.test → HTTP 200 emailSent=true reason=null
MAIL subject="Fabrika Beta — FonBridge daveti / invitation" link=http://localhost:3327/tr/accept-invite?token=93c9678c… mailpit_total=1
HOPS: 307 …?token=… (Chrome'un Critical-CH iç yeniden denemesi) → 303 …?token=… RP=no-referrer CC=no-store → 200 /tr/accept-invite/continue RP=no-referrer
URL after link: http://localhost:3327/tr/accept-invite/continue  token_in_url=false
meta referrer=no-referrer
cookie httpOnly=true sameSite=Lax value_is_locale_dot_token=true
PAGE signed-out: Fabrika Beta sizi davet ediyor … üye olarak … 6 Ekim 2026 tarihine kadar geçerli …
PAGE signed-in: … davetli-mun27@example.test olarak giriş yaptınız. Daveti kabul et
URL after accept: http://localhost:3327/tr/default/dashboard
DB after accept: MEMBER fabrika-beta | acceptedAt set: true | audit: 1
Second click, same user → http://localhost:3327/tr/default/dashboard
PAGE other account, used link: Bu davet zaten kullanıldı …
INVITE ikinci-mun27@example.test → HTTP 200 emailSent=true
PAGE other account, pending link: Bu davet başka bir e-posta adresine gönderildi. Davet i***@example.test adresine gönderildi, siz ise baska-mun27@example.test ile giriş yaptınız …
DB ikinci pending: true | baska memberships: 0
PAGE expired: Davetin süresi doldu …
PAGE invalid (en): The invitation link is not valid …
```
Google'a devir (gerçek düğme): `→ https://accounts.google.com/o/oauth2/v2/auth redirect_uri=http://localhost:3327/api/auth/callback/google token_in_google_url=false`. Devir anındaki çerezler: `fabrika_invitation_accept(httpOnly), fabrika_registration_ack(httpOnly), authjs.pkce…, authjs.callback-url`.

**Sınır — açıkça:** gerçek Google onay ekranı yerelde tamamlanamaz (test Google hesabı yok). Tarayıcı e2e'sinde giriş, yereldeki demo e-posta yoluyla yapıldı; davetli önceden `User` satırı olarak vardı ve üyeliği yoktu. Hesabı olmayan davetlinin Google dönüşü canlı testte doğrulandı: **gerçek** `/api/auth/callback/google` rotası, uygulamanın kendi `authConfig`'i (signIn callback, adaptör, events) ve sahte bir token/userinfo sunucusuyla. Bu, `tests/oauth-registration.live.test.ts` ile aynı yöntem.

Ekran görüntüleri: `docs/agent-results/TASK-MUN2793A57Z9I-cs-fb/` (1 bekleyen/çıkış yapılmış, 2 bekleyen/giriş yapılmış, 3 kabul sonrası, 4 başka hesap/kullanılmış, 5 yanlış hesap, 6 süresi dolmuş, 7 geçersiz-en).

**Kapılar** (temiz worktree, `88dad4b5` = benim iki commit'im + sonrası):
- `pnpm lint` → exit 0.
- `pnpm typecheck` → **exit 2, tek hata benim değil:** `tests/helpers/where-guard-scan.ts(212,13): error TS7022`, `a2c2a9b3`'ten geliyor (be-fb, TASK-MUN2KUHP1BP18).
- O satıra yalnız worktree'de, **commit'lenmeden** bir tip notu (`const call: ts.Node = n.parent;`) koyunca: `typecheck=0`, `build=0`. Rota tablosunda `ƒ /[locale]/accept-invite` ve `ƒ /[locale]/accept-invite/continue` görünüyor.
- `pnpm i18n:check` → geçti. Baseline değişmedi, yeni sabit metin yok.
- `pnpm rls:bypass-check` → SUCCESS. 34 sanctioned site; yeni giriş `src/lib/invitations/accept.ts` gerekçesiyle kayıtlı.
- Komşu süitler (izole DB, `SMTP_HOST=` boş): `oauth-registration.live`, `invitation-mail-limit.live`, `bearer-token-hash.live`, `invitation-accept.live` → `Tests 51 passed (51)`.
- SMTP açıkken `bearer-token-hash.live`'ın bir testi düştü. İkinci davet 10 dk soğumaya girip `inviteLink` döndürmüyor (`fc763927` davranışı). Test SMTP'nin kapalı olduğunu varsayıyor; benim commit'lerim bu teste dokunmuyor.

**Temizlik:** kendi `next` sürecim (pid 38456, cwd kontrol edildi) durduruldu, :3327'de dinleyen yok. `csfb-mun27-mailpit` silindi. `csfb_mun27` `DROP … WITH (FORCE)` ile silindi. Worktree `git worktree remove` ile kaldırıldı. :3000'e ve başka ajanların dosyalarına dokunulmadı.

**Paylaşılan DB:** `fabrika`'ya yalnız `invitation-accepted-at.sql` uygulandı: `ADD COLUMN IF NOT EXISTS`, nullable, 0 satır değişti. Ana ağaçta Prisma istemcisi yeniden üretildiği için bu gerekliydi; yoksa :3000'deki davet akışı koltuk sayımında düşerdi. Toplu silme ya da tam süit koşulmadı.

## 3. Değişen dosyalar
- Yeni: `src/app/[locale]/accept-invite/route.ts`, `src/app/[locale]/accept-invite/continue/{page.tsx,actions.ts,AcceptInviteActions.tsx}`, `src/lib/invitations/{accept.ts,accept-cookie.ts,accept.test.ts}`, `tests/invitation-accept.live.test.ts`, `prisma/migrations/invitation-accepted-at{,.down}.sql`
- Değişen: `prisma/schema.prisma`, `prisma/migrations/apply-order.txt`, `src/lib/oauth-registration.ts`, `src/lib/auth.ts`, `src/lib/actions/auth.ts`, `src/app/api/invitations/route.ts` (1 satır), `src/lib/billing/seat-limit.ts`, `next.config.ts`, `messages/{tr,en}.json`, `scripts/tenant-bypass-baseline.json`
- Belge: `docs/legal/processing-register.md` (§2, §22 md.14), bu rapor, `docs/agent-results/TASK-MUN2793A57Z9I-cs-fb/*.png`

## 4. Riskler
1. **Token sunucu erişim günlüklerinde görünebilir.** Uygulama token'ı hiçbir yerde günlüğe yazmıyor. Ama `next dev` kendi istek günlüğüne tam URL'yi basıyor (`GET /tr/accept-invite?token=<64 hex> 303`). `next start` istek günlüğü tutmuyor, fakat barındırma ya da ters vekil erişim günlükleri ilk GET'i görür. Bu, se-fb'nin `karne=` için yazdığı risk sınıfıyla aynı. Kalıcı çözüm için bkz. Açık soru 1.
2. **Chrome ilk GET'i iki kez gönderiyor.** `next.config.ts` her yola `Critical-CH` başlığını koyduğu için ilk GET sunucuya iki kez geliyor (dev günlüğü satır 238 ve 253). Zararı yok: bu adım yan etkisiz, iki yanıt da 303 ve aynı çerezi veriyor.
3. **MEMBER/WRITER/GUEST_PARTNER rolleri panoda "Erişim Reddedildi" görüyor.** Kabulden sonra `/tr/default/dashboard`'a iniyorlar ve pano PIPELINE_MANAGER+ istiyor (ekran 3). Girişin varsayılan hedefi de aynı sayfa, yani bu önceden var olan bir davranış. Ama davetlinin ilk izlenimi kötü oluyor. Ayrı kart önerisi: role göre açılış sayfası.
4. **Kendi kiracısı olan mevcut kullanıcı kabulden sonra hâlâ kendi kiracısında kalıyor.** Oturum `memberships[0]`'ı seçiyor (`auth.ts` jwt) ve kiracı değiştirme özelliği yok. Üyelik yazılıyor (DB'de doğrulandı), fakat ekran eski kiracıyı gösteriyor. Hesabı olmayan ya da kiracısız davetli doğrudan davet eden kiracıya iniyor.
5. **Demo e-posta girişi (yalnız yerel, `DEMO_LOGIN_ENABLED`) yeni bir adresle hâlâ kendi kiracısını açar.** Üretimde bu sağlayıcı kayıtlı değil. Kabul ekranındaki "Giriş sayfasına git" bağlantısı yalnız demo açıkken görünür.
6. **"İptal" durumu için ayrı bir özellik yok.** Kodda daveti iptal eden bir yol bulunmuyor. "İptal" = kuruluş silinmiş (`Tenant.deletedAt`). Yeniden gönderilmiş davetin eski bağlantısı "geçersiz" mesajını alıyor ve mesaj "en son e-postadaki bağlantı" diye yönlendiriyor.
7. **Diğer ajanların DB kopyalarında sütun yok** (`befb_b4`, `fabrika_sefb_mun2`, …). Güncel `dev` ile o DB'lerde koşan davet ya da koltuk kodu, `invitation-accepted-at.sql` uygulanana kadar düşer.
8. **`dev`'de typecheck ve build şu an kırmızı.** Neden be-fb'nin `a2c2a9b3`'teki TS7022 hatası (benim değil). be-fb'nin ana ağaçta `where-guard-scan.ts` üzerinde commit'lenmemiş düzenlemesi görünüyor; muhtemelen üzerinde çalışıyor.

## 5. Açık sorular
1. Davet bağlantısında token, sorgu dizesi (`?token=`) yerine URL parçasında (`#token=`) taşınsın mı? Parça sunucuya hiç gitmez, böylece erişim günlüğü riski (Risk 1) tamamen kalkar. Maliyeti: istemci tarafında küçük bir sayfa gerekir, ve daha önce gönderilmiş e-postalar için `?token=` yolu 7 gün daha açık kalmalı. Karar ürün ve güvenlik tarafının.
2. Kabulden sonraki açılış sayfası role göre mi seçilsin (Risk 3)? Kiracı değiştirme (Risk 4) ayrı bir özellik mi olacak?

## 6. Sonraki adım
- se-fb ya da crw-fb bu kartı incelesin. Özellikle (a)–(d) ve `decideOAuthSignIn` davet dalı.
- be-fb TS7022'yi kapatsın; ardından `dev`'de `pnpm build` yeniden koşulsun.
- Diğer ajan DB'lerine `invitation-accepted-at.sql` uygulansın (kendi sahipleri).
- TASK-MUN2J9LLXNREG (davet satırı temizliği): artık kabul edilmiş satırlar da süresiz duruyor (`acceptedAt` dolu). Temizlik işi bunları da kapsamalı.
- Risk 3 ve 4 için kart açılabilir (patron kararı).

**Platform beyanı:** mac üzerinde doğrulandı (Darwin 27, zsh, Docker Desktop, Postgres 16 @5433, Node 26 + pnpm 11, sistem Chrome, Playwright). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. Koddan bakıldığında değişen yollar platformdan bağımsız: Next.js route handler, çerez, Prisma, `node:crypto` SHA-256/timingSafeEqual ve Auth.js callback. Süreç öldürme, dosya yolu, kabuk ya da ikili adı kullanılmıyor. Test/e2e betiklerindeki `docker exec` çağrıları yalnız doğrulama içindir, üründe yoktur.
