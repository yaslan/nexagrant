# TASK-MUN3O475HC3T8 — fe-fb — İNCELEME-34: davet kabul sayfası (TASK-MUN2793A57Z9I, cs-fb)

## Karar: **DÜZELTME GEREKLİ** (küçük — yalnız test)

Kod doğru. se-fb'nin (a)–(d) şartları karşılanıyor, davranış gerçek tarayıcı ve mailpit ile uçtan uca doğrulandı. Düzeltme isteği yalnız teste yönelik: raporda iddia edilen dört koruma satırını hiçbir test tutmuyor, bu satırlar silinse bile süit yeşil kalıyor (B-1…B-4). Koltuk sınırı aşılmıyor.

İncelenen commit'ler: `0ae3175b` (özellik), `24666974` (canlı test), `f09e910a` (be-fb id koruması), `6e8505d4` (rapor). Temiz worktree `a8322a79` (dal `dev`). İnceleme süresince `dev`'e gelen commit'ler (`362ee353..208a9ed7`) incelenen dosyalara dokunmadı. **Kod değiştirilmedi.**

## 1. Ne yapıldı

- Kabul çekirdeğini okudum: `src/lib/invitations/{accept.ts,accept-cookie.ts}`, `src/app/[locale]/accept-invite/{route.ts,continue/*}`, `decideOAuthSignIn` davet dalı, adaptörün `createUser` dalı, `seat-limit.ts`, `api/invitations/route.ts` ve `next.config.ts`. Her şartı kodla eşleştirdim (§2.1).
- Kendi 7 mutantımı izole DB'de, davetle ilgili 10 test dosyasına karşı koştum.
- Tam süiti izole DB'de koştum. Ardından tsc, lint, i18n ve build kapılarını geçirdim.
- `next start` (üretim modu) ile token'ın günlüğe düşüp düşmediğini ve başlıkları denedim.
- Mailpit ile uçtan uca akışı bir kez koştum: gerçek form, gerçek e-posta, gerçek tıklama, 390px, tr/en, yanlış hesap, iki sekmeden aynı anda kabul.

## 2. Kanıt

### 2.1 Şart ↔ kod

| Şart | Kod | Sonuç |
|---|---|---|
| Token URL'den hemen siliniyor (d) | `route.ts`: token çereze yazılıyor, ardından token'sız `/continue` adresine `303` dönülüyor. Bozuk token gelirse eski çerez siliniyor. | ✓ canlı (§2.4) |
| `Referrer-Policy: no-referrer` (d) | Başlık hem route yanıtında, hem `next.config.ts` üzerinden `/:locale/accept-invite/:path*` için, hem de sayfada `<meta name="referrer">` olarak var. | ✓ üretim modunda curl ile |
| Token loglanmıyor (d) | Uygulama kodunda token, hash ya da adres günlüğe yazılmıyor. `actions.ts:80` yalnız `error.name` basıyor. | ✓ `next start` günlüğünde token 0 kez geçiyor. `next dev` istek günlüğünde 5 kez geçiyor (cs-fb Risk 1, yalnız dev). |
| Sabit zamanlı hash (a) | `findUnique({tokenHash: sha256})` ile aranıyor, ardından `secretTokenMatches` (timingSafeEqual) ile kontrol ediliyor. | ✓ |
| Tek kullanımlık (b) | `updateMany WHERE id, tenantId, tokenHash, acceptedAt IS NULL, expires > now` ile harcanıyor. | ✓. se-fb (b) "tokenHash silinsin" diyordu; cs-fb `acceptedAt` yolunu seçmiş. Ham token artık yalnız "kullanıldı" ekranını açıyor, yetki vermiyor. Kabul edilebilir. |
| Doğrulanmış Google e-postası = davet adresi (c) | `oauth-registration.ts:186-187`: önce `providerVerifiedEmail`, sonra adres eşitliği. Mevcut hesap için `acceptInvitation` → `sameEmail`. | ✓ |
| Yanlış hesap reddi | Mevcut hesapta `email_mismatch` dönüyor ve bağlantı bekleyen kalıyor. Google'da kişi hesap açılmadan kabul ekranına dönüyor. | ✓ canlı: davet eden, elindeki ham token'la açınca maskeli uyarıyı görüyor (kare 3) |
| Davetliye yeni kiracı açılmıyor | Davet dalının her çıkışı `allow:true` (yalnız katılım) ya da `back()`. `plainRegistration` yok. `createUser` → `registerInvitedOAuthUser` → `createdByAdapter='bootstrapped'`. | ✓ canlı test "no tenant of its own" |
| Gizlilik onayı | `readAcknowledged()` son kontrol olarak çalışıyor. Onay satırları `consentLocale` ile aynı transaction içinde yazılıyor. | ✓ |
| Süresi dolmuş pilot | Kabul ekranında, `acceptInvitation`'da, signIn dalında (`readOnly`) ve `registerInvitedOAuthUser`'da, yani dört yerde kontrol ediliyor. | ✓ (M3 ve N7 öldü) |
| Eşzamanlı iki kabul → tek Membership | İkinci transaction satır kilidinde bekliyor, ardından `count=0` alıyor ve üyeliği görüp `already_member` dönüyor. | ✓ canlı: 2 sekme aynı anda → 1 üyelik, 1 denetim satırı |

### 2.2 Çerez temizliğinin yan etkisi

`startInvitationSignInAction`, ajans kodu, il ve karne çerezlerini `null` ile siliyor. Bu üç çerez yalnız bir OAuth kaydı boyunca yaşayan geçici çerezler (15 dk). `registration-readiness-cookie.ts:5` "cleared on every other OAuth start" diyor. Mevcut kurala uyuluyor ve kalıcı bir kullanıcı verisi kaybolmuyor. Tek görünür etki şu: kişi yarım kalmış bir `/kayit?kod=…` akışından sonra davet ekranında Google'a basarsa ajans kodu gidiyor. Davet dalı zaten ajans kodunu reddettiği (`clearInvite`) için bu tutarlı.

Ters yön de kapalı: `/giris` ve `/kayit`'taki tek OAuth başlangıcı `loginWithSocialAction` ve o davet çerezini siliyor. Başka bir `signIn('google')` çağrısı yok (grep). Ama bu satırı hiçbir test tutmuyor, bkz. B-2.

### 2.3 Koltuk sınırı (`seat-limit.ts`)

Değişiklik, kabul edilmiş davetleri "bekleyen koltuk" sayımından çıkarıyor. Kabulde bekleyen −1, üye +1 oluyor; toplam değişmiyor. Zaten üye olan biri kabul ederse bekleyen −1, üye 0 oluyor; bu çift sayımın düzelmesi. Süresi dolmuş davet zaten sayılmıyordu ve kabul de edilemiyor. **Bu değişiklik sınırı aşmaya yol açmıyor.** Yalnız, sınır yalnız davet anında kontrol ediliyor (Risk 2). N5 mutantı (filtre kaldırılınca) öldü.

### 2.4 Uçtan uca (mailpit, gerçek tıklama)

Ortam:
- Temiz worktree, kendi `next dev -p 3334`.
- Kendi mailpit'im `fefb-in34-mailpit` (11334/18334).
- İzole DB `fefb_in34` (`fabrika`'nın pg_dump kopyası).
- Playwright + sistem Chrome.
- Davet eden `admin@yasinaslan.com.tr` (demo-tenant sahibi). İzole DB'de `seatsExtra=10` yapıldı, çünkü kopyada 11 üye / 8 koltuk vardı; bkz. Risk 3.
```
INVITE HTTP 200 (ilk koşu e-posta gönderdi; ikinci koşu recently_sent)
MAIL subject= "Fabrika Beta — FonBridge daveti / invitation" link= http://localhost:3334/tr/accept-invite?token=<64hex>
EN URL after link http://localhost:3334/en/accept-invite/continue token_in_url= false
EN 390 overflow= false | Fabrika Beta is inviting you … as writer. The invitation is valid until 6 October 2026 …
TR URL http://localhost:3334/tr/accept-invite/continue cookie httpOnly= true sameSite= Lax value=locale.token true
TR 390 overflow= false | Fabrika Beta sizi davet ediyor … yazar olarak … 6 Ekim 2026 tarihine kadar geçerli …
requests: en?token=<T> no-referer ×2 (Chrome Critical-CH yeniden denemesi) → en/continue no-referer → tr?token=<T> no-referer → tr/continue no-referer
OWNER opens link: Bu davet başka bir e-posta adresine gönderildi. Davet f***@example.test adresine gönderildi, siz ise admin@yasinaslan.com.tr ile giriş yaptınız …
SIGNED-IN text: … fefb-in34-davetli@example.test olarak giriş yaptınız. Daveti kabul et
after concurrent accept: tab1 /tr/default/dashboard | tab2 /tr/default/dashboard
DB memberships of invitee: WRITER@demo-tenant
DB invitation acceptedAt set: t | audit rows: 1
OWNER reopens used link: Bu davet zaten kullanıldı …
```
Üretim modu (`DEMO_LOGIN_ENABLED= next start -p 3334`, temiz build):
```
GET /tr/accept-invite?token=<rastgele 64hex>
HTTP/1.1 303 See Other · Referrer-Policy: no-referrer · Cache-Control: no-store
set-cookie: fabrika_invitation_accept=tr.<TOKEN>; Max-Age=1800; Secure; HttpOnly; SameSite=lax
location: http://localhost:3334/tr/accept-invite/continue
GET /en/accept-invite/continue → 200 · Referrer-Policy: no-referrer · Cache-Control: no-store · <meta name="referrer" content="no-referrer"/>
token, start.log içinde: 0 satır
```
Kareler: `docs/agent-results/TASK-MUN3O475HC3T8-fe-fb/`
1. en, 390px, çıkış yapılmış
2. tr, 390px, çıkış yapılmış
3. davet eden hesap, yanlış hesap uyarısı
4. tr, 390px, giriş yapılmış
5. kabul sonrası

Klavye: iki Tab ile önce onay kutusuna, sonra Gizlilik bağlantısına gidiliyor. Düğmeler gerçek `<button>`, hata kutusu `role="alert"`.

Temizlik: test verisi tek id'lerle, tek transaction içinde silindi ve her silme `DELETE 1` döndü. Silinenler: 2 AuditEvent, 1 Membership, 1 Invitation (`cmun4fkvg0000nexk9hwrdu9m`) ve 1 User (`fefbin34davetli`). Ardından `seatsExtra` 0'a geri alındı. Sonra kendi sunucum durduruldu (pid'in cwd'si kontrol edildi) ve `:3334` boş. Mailpit silindi, `fefb_in34` `DROP … WITH (FORCE)` ile silindi, worktree kaldırıldı. Paylaşılan `fabrika` DB'sine ve `:3000`'e dokunulmadı.

### 2.5 Mutantlar (kendi 7'm, cs-fb'nin 15'inden farklı)

Test kümesi: davetle ilgili 10 dosya, 107 test. İzole DB, `SMTP_HOST=` boş. Her mutanttan sonra dosya yedekten geri kondu; sonunda `git status` temizdi.
```
HAYATTA N1 re-invite keeps acceptedAt (left member can't rejoin)   | Tests 107 passed (107)
HAYATTA N2 plain OAuth start keeps a parked invitation              | Tests 107 passed (107)
HAYATTA N3 claim ignores tokenHash (rotated link still spends)      | Tests 107 passed (107)
HAYATTA N4 claim won + already member -> create again               | Tests 107 passed (107)
ÖLDÜ    N5 seat count ignores acceptedAt filter                     | 1 failed | seat limit: an accepted invitation is no longer a pending seat
HAYATTA N6 next.config: no Referrer-Policy on accept pages          | Tests 107 passed (107)
ÖLDÜ    N7 invitation branch: pilot check dropped (signIn)          | 1 failed | decideOAuthSignIn with a parked invitation > expired pilot
```

### 2.6 Kapılar (temiz worktree `a8322a79`)
- `pnpm typecheck` 0 · `pnpm lint` 0 · `pnpm i18n:check` 0.
- `pnpm build` 0. Rota tablosunda `ƒ /[locale]/accept-invite` ve `ƒ /[locale]/accept-invite/continue` var. cs-fb'nin gördüğü TS7022 artık yok.
- Tam süit, izole DB `fefb_in34`, `SMTP_HOST=` boş: `Test Files 228 passed | 2 skipped (230)`, `Tests 2677 passed | 8 skipped (2685)`, exit 0.
- Hedefli: `accept.test.ts` + `invitation-accept.live` + `oauth-registration.live` → `55 passed (55)`.

## 3. Bulgular (numaralı)

**B-1 — Rapordaki "loginWithSocialAction davet çerezini siler" iddiasını hiçbir test tutmuyor (orta, test; N2 hayatta).**
- Satır: `src/lib/actions/auth.ts:167`.
- Satır silinirse ne olur: kişi kabul ekranını açıp bıraktıktan sonra 30 dk içinde `/kayit`'ta Google ile kayıt olursa, adresi aynıysa kendi kiracısı yerine davet eden kiracıya katılır. Adresi farklıysa `email_mismatch` ile kabul ekranına geri atılır ve düz kayıt 30 dk kilitlenir.
- **Düzeltme:** `tests/social-action-disclosure.test.ts` içinde `loginWithSocialAction`'ın `fabrika_invitation_accept` çerezini sildiğini doğrulayan bir test ekle.

**B-2 — Harcama sorgusundaki `tokenHash` koşulunu hiçbir test tutmuyor (düşük, güvenlik; N3 hayatta).**
- Yer: `accept.ts:183`.
- Senaryo: `lookupInvitation` satırı bekleyen olarak okur. O arada yeniden davet token'ı döndürür. Koşul olmasaydı eski bağlantı yine harcanırdı.
- "race window" testi yalnız `acceptedAt`'ı kapsıyor.
- **Düzeltme:** bir canlı test yaz: `acceptInvitationIn` eski token'ın hash'i ile çağrılsın, satırda ise yeni hash olsun. Beklenen sonuç `lost` ve üyelik yok.

**B-3 — Yeniden davetin `acceptedAt: null` sıfırlamasını hiçbir test tutmuyor (düşük; N1 hayatta).**
- Yer: `api/invitations/route.ts:147`.
- Uygulamada bugün üye çıkarma yolu yok (`membership.delete*` grep'te yok). Ama hesap silme ya da elle silme sonrasında yeniden davet edilen kişi "Bu davet zaten kullanıldı" ekranında kalır.
- Aynı satırın `keepToken` kolu (`recently_sent`, 10 dk içinde) `acceptedAt`'ı sıfırlamıyor. Mevcut üyeye davet zaten reddediliyor (`route.ts:90`); ama üyelik mailden sonraki 10 dk içinde kaldırılıp kişi yeniden davet edilirse, API kullanılmış bağlantıyı "e-postadaki bağlantı hâlâ geçerli" diye bildirir. Uç bir durum; bir cümleyle belgelensin ya da `keepToken` kolu `acceptedAt: null` iken yalnız bekleyen satırda uygulansın.
- **Düzeltme:** kabul edilmiş satırı yeniden davet eden bir canlı test yaz (`acceptedAt` NULL'a dönmeli).
- Bağımsız teyit: crw-fb İNCELEME-37 Ö-3 (`8a718614`) aynı `keepToken` + kabul edilmiş bağlantı durumunu buldu.

**B-4 — `next.config.ts`'teki accept-invite başlık bloğunu hiçbir test tutmuyor (düşük; N6 hayatta).**
- Blok silinirse `/continue` yine `<meta name="referrer">` ile korunur ve dinamik sayfa olduğu için Next'in varsayılan `no-store`'u gelir. Yani pratikte etkisi yok, derinlemesine savunma.
- Canlı testteki M11 yalnız GET yanıtının başlığını tutuyor.
- **Düzeltme (isteğe bağlı):** bir test `next.config` `headers()` çıktısında bu `source`'u ve iki başlığı arasın.

**N4 notu (bulgu değil):** "Harcama kazanıldı ama kişi zaten üye" dalı (`accept.ts:191`) silinirse `membership.create` unique hatası verir ve transaction geri alınır. Bu dala düşmek için kişinin davetten sonra başka bir yoldan üye olması gerekir; davet rotası mevcut üyeye davet açmayı reddediyor (`route.ts:90`). Bugün pratikte eşdeğer mutant.

## 4. Riskler
1. **Dev istek günlüğü token'ı basıyor** (cs-fb Risk 1, doğrulandı: 5 satır). `next start` basmıyor (0 satır). Barındırma ya da ters vekil erişim günlükleri ilk GET'i görür. cs-fb'nin Açık soru 1'i (`#token=`) hâlâ geçerli.
2. **Koltuk sınırı yalnız davet anında kontrol ediliyor.** Davetten sonra plan küçültülür ya da `seatsExtra` azaltılırsa kabul yine üye ekler ve sınır aşılır. Bu değişiklikten gelmiyor, B11 tasarımı.
3. **Paylaşılan `fabrika` DB'sinin kopyasında demo-tenant 11 üye / 8 koltuk.** Seed verisi sınırın zaten üstünde. Bu makinede ana ağaçta demo-tenant'tan yapılan her davet 403 `SEAT_LIMIT_REACHED` alır. Başka ajanların e2e'lerini şaşırtabilir.
4. **`GUEST_PARTNER` davetle `workspaceIds: []` = tüm çalışma alanları alıyor.** Davet modelinde alan seçimi yok. Rol salt-okur, ama "misafir ortak" için tüm alanları görmek niyet olmayabilir. Ürün kararı; bu kartın getirdiği bir şey değil, fakat üyeliği bu kod yazıyor.
5. cs-fb'nin Risk 3 ve 4'ü doğrulandı: kabul sonrası `/default/dashboard` açılıyor ve kiracı değiştirme yok. Kare 5.

## 5. Açık sorular
1. B-3'teki `keepToken` + kabul edilmiş satır durumu kodla mı kapatılsın, yoksa belgelensin mi? cs-fb ve be-fb karar versin.
2. Risk 4: misafir ortak davetine çalışma alanı seçimi gerekli mi? (patron / ürün)

## 6. Sonraki adım
- cs-fb B-1…B-3 testlerini eklesin (B-4 isteğe bağlı). Her testin, ilgili satır silinince kırmızıya döndüğü gösterilsin (N1–N3). Bundan sonra kart ONAY'a hazır; kod değişikliği beklenmiyor.
- Risk 3 için seed sahibine not: demo-tenant `seatsExtra` ya da üye sayısı.

**Platform beyanı:** mac üzerinde doğrulandı (Darwin 27, zsh, Docker Desktop, Postgres @5433 `fabrika-postgres` konteyneri, Node 26 + pnpm 11, sistem Chrome + Playwright). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. İncelenen yollar platformdan bağımsız: Next.js route handler ve server action, çerez, Prisma/Postgres, `node:crypto` SHA-256/timingSafeEqual ve Auth.js callback. Süreç öldürme, dosya yolu, kabuk ya da ikili adı kullanılmıyor. Test betiklerindeki `docker exec` çağrıları yalnız doğrulama içindir, üründe yoktur.
