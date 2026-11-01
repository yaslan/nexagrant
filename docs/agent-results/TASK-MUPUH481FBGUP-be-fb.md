# TASK-MUPUH481FBGUP — FB PİLOT QA Y-2: eşzamanlı davetle koltuk sınırı aşılıyor (be-fb)

**Hüküm: TAMAMLANDI — Y-2 kapandı.** Dal `be-fb/qa-y2-seat-race` (dev'den), push yok, dev'e merge yok (qae-fb incelemesi bekliyor).

## 1. Ne yapıldı
- **Kök neden (kodda doğrulandı):** `POST /api/invitations` önce `assertSeatAvailable` ile sayıyor, sonra yazıyordu; kilit (`lockInvitationMail`) yalnız `mailer && mailBaseUrl` doğruysa ve **sayımdan sonra** alınıyordu. N eşzamanlı istek hepsi "1 boş koltuk" görüp yazıyordu (SMTP kapalıyken hiç kilit yok; açıkken de kilit sayımı korumuyor).
- **Düzeltme (additive, şema/migration yok):**
  1. `src/lib/billing/seat-limit.ts`: yeni `lockTenantSeats(tx, tenantId)` — kiracı başına `pg_advisory_xact_lock` (kendi anahtarı `tenant-seats:<id>`; işlem bitince kendiliğinden düşer). `assertSeatAvailable` sayımdan ÖNCE **her durumda** kilidi alıyor; mail koşulundan bağımsız. Sıra her yerde: koltuk kilidi → mail kilidi (döngü/deadlock yok). `readSeatUsage` kilitsiz okuma olarak kaldı (belgelendi).
  2. `src/lib/invitations/accept.ts` `acceptInvitationIn` (hem `acceptInvitation` hem Google-ile-kayıt `registerInvitedOAuthUser` yolu): koltuk kilidi altında **üye sayısı limite ulaştıysa** `seat_limit_reached` ile reddediyor; hiçbir şey yazılmıyor (bağlantı geçerli kalır, koltuk açılınca kullanılabilir). Bilinçli tasarım: bekleyen davetler eklenmiyor — kabul, kendi bekleyen davetini üyeye çeviriyor, toplam değişmiyor; diğer bekleyenleri saymak aşırı-abone iki daveti kalıcı olarak birbirine kilitlerdi. Garanti: üye sayısı limiti aşmaz. `registerInvitedOAuthUser` bu durumda işlemi (kullanıcı dahil) geri alıyor (`InvitationNotAcceptableError('seat_limit_reached')`).
  3. Metin: `AcceptInvite.errors.seat_limit_reached` tr + en (`messages/*.json`) — kabul ekranı mevcut `errors.<reason>` eşlemesiyle gösteriyor. API'nin 403 `SEAT_LIMIT_REACHED` yanıtı zaten tr metinle vardı, değişmedi.

## 2. Kanıt
**Gerçek Postgres (:5433, `fabrika_app` RLS rolü) eşzamanlı test — `tests/invitation-seat-race.live.test.ts` (yeni):** 6 koltuklu kiracı, 5 dolu, 8 eşzamanlı POST (bariyerle tüm istekler sayımı bitirmeden yazmaya geçmeye zorlanıyor):
```
Düzeltmesiz (kilit çağrısı yorum satırı):
 × SMTP on : expected { ok: 8, refused: +0 } to deeply equal { ok: 1, refused: 7 }
 × SMTP off: (aynı — 8/8 başarılı)
 × three free seats: expected [ …(8) ] to have a length of 3 but got 8
Düzeltmeyle:
 Test Files  1 passed (1) | Tests  3 passed (3)   (SMTP açık/kapalı: tek 200, 7× 403 SEAT_LIMIT_REACHED, DB'de invitation = 6; 3 boş koltukta tam 3 başarı)
```
**Kabul yeniden kontrolü — `tests/invitation-accept.live.test.ts` (+2 test, hepsi 20/20 yeşil):** (a) limitte dolu kiracı → `{ok:false, reason:'seat_limit_reached'}`, üyelik yok, `acceptedAt` NULL; (b) 1 boş üye koltuğu + 4 aşırı-abone bekleyen davet, 4 eşzamanlı kabul → 1 ok, 3 `seat_limit_reached`, üye sayısı = limit. Kontrol kodu devre dışıyken ikisi de kırmızı: `Tests 2 failed | 18 passed (20)`.

**tsc:** `npx tsc --noEmit` → 0.

**Tam test (`npm test`, DB :5433):**
```
 Test Files  306 passed | 6 skipped (312)
      Tests  4110 passed | 119 skipped (4229)
```
(Atlanan 6 dosya/119 test yerelde bilerek atlanan kapılar; dokunduğum üç canlı dosya ayrıca koşuldu ve çalıştı.)

## 3. Değişen dosyalar
`src/lib/billing/seat-limit.ts`, `src/lib/invitations/accept.ts`, `messages/tr.json`, `messages/en.json`, `tests/invitation-seat-race.live.test.ts` (yeni), `tests/invitation-accept.live.test.ts`.

## 4. Riskler
- Koltuk kilidi her davet isteğinde kiracı bazında seri çalışır: bir kiracının davetleri sıraya girer (saniyenin altında; farklı kiracılar etkilenmez). Kilit işlem sonunda düşer.
- Mevcut aşırı-abone kiracılar (QA'nın 8/10 koltuklu kiracıları gibi) otomatik düzelmez: bekleyen davetler yerinde kalır, yeni davet reddedilir, kabuller yalnız üye < limit iken geçer. Veri silme/iptal yok (yıkıcı işlem yapılmadı).
- Sayım `NOT: {email}` ile aynı adrese yeniden davet için eski davranışı korur (koltuk almaz).
- Koşulamayan: gerçek SMTP'li uçtan uca (mail test taşıyıcısı mock; kilit mantığı SMTP açık/kapalı iki modda test edildi).

## 5. Açık sorular
Yok (QA önerisi — "her durumda advisory lock + kabulde yeniden kontrol" — uygulandı; SERIALIZABLE yerine advisory lock seçildi çünkü projedeki mail kilidi aynı kalıbı kullanıyor ve yeniden deneme gerektirmiyor).

## 6. Sonraki adım
qae-fb incelemesi → dev'e merge. Y-1 dalı: `be-fb/qa-y1-invite-landing` (`e48a1a0e`).

**Platform beyanı:** mac (Darwin) üzerinde doğrulandı (yerel Docker Postgres :5433). Kod platformdan bağımsız (SQL advisory lock + TS; dosya yolu/kabuk/süreç yok); Windows/Linux koşulmadı — kod yolunda platforma bağlı parça yok.
