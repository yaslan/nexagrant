# TASK-MUN23OJ8L9DV0 — be-fb — Davet: `recently_sent` durumunda token korunuyor (İNCELEME-26 Ö-1..Ö-4)

**Kod commit'i:** `fc763927` (dal `dev`). **Kaynak:** `TASK-MUMT3R1WRRM9S-crw-fb.md` §1.4. **Karar:** leed-fb.

## 1) Ne yapıldı

| Bulgu | Durum | Yapılan |
| --- | --- | --- |
| **Ö-1** çift tıklama e-postadaki bağlantıyı öldürüyor | **Kapandı** | `route.ts`: `mailSkip === 'recently_sent'` iken `upsert.update` yalnız `{ role, expires }` yazıyor, `tokenHash` değişmiyor. 200 yanıtında `inviteLink` **yok**, çünkü o istekte üretilen token hiç saklanmadı ve dönseydi ölü bir bağlantı olurdu. Members sayfası bu durumda "Davet e-postası az önce gönderildi; davetli e-postadaki bağlantıyı kullanabilir" / "The invitation email was sent a moment ago; the invitee can use the link in that email" yazıyor. i18n baseline artmadı. |
| **Ö-2** X2/X6 mutantları hayatta | **Kapandı** | İki sınır testi eklendi: 9 dk önceki SENT → hâlâ `recently_sent`; 23 sa önceki 50 satır → hâlâ `daily_limit`. X2 ve X6 artık ölüyor. |
| **Ö-3** `localhost.` ve `[::ffff:127.0.0.1]` loopback sayılmıyor | **Kapandı** | `isLoopback`: sondaki kök noktası siliniyor, IPv4-mapped loopback (`[::ffff:7fXX:XXXX]`, 127.0.0.0/8) yakalanıyor. Birim testi 3 yeni URL ile genişletildi. |
| **Ö-4** `invitation.email_sent` bir işleme kaydı | **Zaten kapalı, dokunmadım** | cs-fb bunu `631c7d4c`'de envanter §2 "Veri kategorileri" satırına işledi (`actorId`, hedef = davet id'si, adres yok). Bu kart belge işine girmiyor. |

Değişmeyenler, bilerek:
- **`daily_limit`**: e-posta gitmiyor, bağlantıyı davet edene vermenin başka yolu yok. Bu yüzden token yenileniyor ve bağlantı dönüyor. Bunu kilitleyen yeni bir test var (M4 aşağıda).
- **`smtp_not_configured` / `app_url_not_configured` / `send_failed`**: davetliye ulaşmış geçerli bir e-posta yok, eski davranış korunuyor (yeni token + bağlantı yanıtta).
- **Soğumadan sonra yeni e-posta**: yeni token üretiliyor, eski e-postadaki bağlantı geçersiz oluyor. Yeni e-posta, davetlinin elindeki en son bağlantı. Testte de doğrulandı.
- `recently_sent` iken `expires` yeniden 7 güne uzuyor. Karardaki "role/expires güncellenir" ifadesiyle aynı. Sonuç olarak e-postadaki bağlantı, e-postada yazan son tarihten en fazla 10 dk daha uzun geçerli kalabiliyor.

## 2) Kanıt

### Kapılar (temiz worktree, `7ba1a495` + bu yama = `fc763927` içeriği, `pnpm install --frozen-lockfile --offline`)
```
pnpm typecheck  → tc=0
pnpm lint       → lint=0
pnpm i18n:check → ✅ i18n check passed … no file gained hard-coded text.
pnpm build      → build=0   (├ ƒ /[locale]/[workspace]/settings/members · ├ ƒ /api/invitations)
```
Worktree'deki 5 dosya commit öncesinde ana ağaçtakilerle `cmp` ile karşılaştırıldı, 5/5 aynıydı.

### Hedefli vitest (izole DB `befb_mun23`, `fabrika_app` NOBYPASSRLS, 112 RLS politikası)
Tam süit paylaşılan dev DB'de **koşulmadı** (kart kuralı). İzole DB: `prisma migrate diff --from-empty --to-schema` → SQL, `scripts/apply-rls.ts`, `pnpm db:rls-role`.
```
tests/invitation-mail-limit.live.test.ts + src/lib/email/__tests__/mailer.test.ts
→ Tests 31 passed (31)   ×4 koşu (1 + kararlılık için 3), atlanan yok
 ✓ a second invitation to the same address within 10 minutes sends no mail and keeps the mailed link valid
 ✓ after the cooldown the same address is mailed again          (yeni token geçerli, eskisi değil)
 ✓ 9 minutes after a mail the same address is still cooling down    (Ö-2)
 ✓ two concurrent invitations to one address send one mail       (+ yarışı kaybeden istek token'ı yenilemiyor)
 ✓ past the daily limit a re-invitation still gets a fresh link that works
 ✓ rows 23 hours old still count toward the daily limit          (Ö-2)
 … (mevcut 5 test)
```
"Bağlantı geçerli" iddiası şöyle ölçülüyor: e-postadaki `token` alınıyor, `sha256(token) === Invitation.tokenHash` kontrol ediliyor. Kabul yolunun yapacağı bakış bu.

### Mutantlar (her biri geri alındı)
```
M1  token yine yenileniyor (keepToken=false)     → 3 failed | 28 passed   ÖLDÜ   ← kartın "mutant" şartı
M2  recently_sent'te de inviteLink dönüyor       → 1 failed | 30 passed   ÖLDÜ
M3  keepToken'da role güncellenmiyor             → 1 failed | 30 passed   ÖLDÜ
M4  daily_limit'te de token korunuyor            → 1 failed | 30 passed   ÖLDÜ   (ilk turda HAYATTA'ydı → test eklendi)
X2  soğuma 10 dk → 1 dk                          → 1 failed | 30 passed   ÖLDÜ   (İNCELEME-26'da hayattaydı)
X6  24 sa → 2 sa                                 → 1 failed | 30 passed   ÖLDÜ   (İNCELEME-26'da hayattaydı)
O3a sondaki nokta silinmiyor                     → 1 failed | 30 passed   ÖLDÜ
O3b ::ffff loopback kontrolü yok                 → 1 failed | 30 passed   ÖLDÜ
```

### Gerçek uçtan uca (Playwright + system Chrome, gerçek tıklama, kendi `next dev -p 3326`, kendi mailpit `befb-mun23-mailpit` 11325/18325)
Giriş `/tr/giris` formundan yapıldı. `demo@usfinbridge.com`, `demo-tenant`'ta TENANT_OWNER, izole DB'de `seatsExtra=20`. Adres alanına yazıp "Davet Gönder"e iki kez tıklandı:
```
TR  click 1 UI: Davet e-postası gönderildi. Bağlantı: http://localhost:3326/tr/accept-invite?token=54e5bbad…
TR  click 2 UI: Davet e-postası az önce gönderildi; davetli e-postadaki bağlantıyı kullanabilir
TR  POST 1 200 {"emailSent":true,"reason":null,"hasInviteLink":true}
TR  POST 2 200 {"emailSent":false,"reason":"recently_sent","hasInviteLink":false}
TR  mailpit total 1 · mail to davetli-mun23@example.test · link …token=54e5bbad…
DB  davetli-mun23@example.test | MEMBER | mailed_token_valid = t     ← sha256(e-postadaki token) = tokenHash, iki tıklamadan SONRA
EN  click 2 UI: The invitation email was sent a moment ago; the invitee can use the link in that email
EN  POST 2 200 {"emailSent":false,"reason":"recently_sent","hasInviteLink":false} · mailpit total 2
```
Karşılaştırma için değişiklikten önceki durum crw-fb'nin kanıtında var (`TASK-MUMT3R1WRRM9S-crw-fb.md` §1.3): "mail token artık GEÇERSİZ (rotated)".

Ekran görüntüsü: `docs/agent-results/TASK-MUN23OJ8L9DV0-be-fb/members-recently-sent-en.png`

**Kartın "ilk e-postadaki bağlantıyla kayıt/katılım ekranı açılıyor" kanıtı ALINAMADI.** Bağlantı açılınca `404` geliyor (`open mailed link → 404`), çünkü `/[locale]/accept-invite` sayfası kodda hiç yok: `find src -path '*accept-invite*'` → boş, token'ı `tokenHash` ile arayan bir kabul yolu da yok. Bu kart öncesinden kalan bir ürün hatası. cs-fb bunu envanter §22 md.14'te yazdı ve **TASK-MUN2793A57Z9I** olarak bildirdi (`7ba1a495`). Yukarıdaki `mailed_token_valid = t`, o sayfa yazıldığında e-postadaki bağlantının kabul edileceğini veri düzeyinde gösteriyor. Ekranın açıldığı kanıtı TASK-MUN2793A57Z9I'ye kalıyor.

## 3) Değişen dosyalar (`fc763927`)
- `src/app/api/invitations/route.ts`: `keepToken`, koşullu `inviteLink`
- `src/app/[locale]/(app)/[workspace]/settings/members/page.tsx`: `recently_sent` mesajı (tr/en). fe-fb'nin `de1d245a` değişikliği korundu.
- `src/lib/email/invitation-mail-policy.ts`: üst yorum, `isLoopback` (Ö-3)
- `tests/invitation-mail-limit.live.test.ts`: 8 → 11 test, token geçerlilik kontrolleri
- `src/lib/email/__tests__/mailer.test.ts`: loopback listesi +3
- Bu rapor ve `docs/agent-results/TASK-MUN23OJ8L9DV0-be-fb/members-recently-sent-en.png`

## 4) Riskler
- **API sözleşmesi değişti:** `recently_sent` yanıtında `inviteLink` artık yok. `grep -rn inviteLink src` sonucuna göre tek istemci members sayfası ve o da güncellendi. Dış bir istemci yok (Partner REST API bu ucu açmıyor).
- Davet eden, ilk e-postanın gitmediğinden şüphelenirse (spam klasörü gibi) 10 dk boyunca elle iletebileceği bir bağlantı alamıyor. Kararın bilinçli sonucu bu. 10 dk sonra yeniden gönderim açılıyor.
- Envanter §2'deki `route.ts` satır numaraları `3bc74a7b`'ye göre yazılmış, bu commit'le kaydılar. Envanter commit adını verdiği için yanlış değil (K-1 kuralı).

## 5) Açık sorular
- Yok (Ö-1 kararı verilmişti). Kabul sayfası TASK-MUN2793A57Z9I'de.

## 6) Sonraki adım
- TASK-MUN2793A57Z9I (kabul sayfası) bittiğinde, bu senaryo (iki tıklama, sonra ilk e-postadaki bağlantı) o kartın e2e'sine eklenmeli. Böylece "katılım ekranı açılıyor" kanıtı uçtan uca alınır.
- İsteğe bağlı: crw-fb bu değişikliği İNCELEME-27'de doğrulayabilir.

## 7) Temizlik
Hepsi kapatıldı ya da silindi: dev sunucum (:3326'da dinleyen yok, `lsof` → 0), `befb-mun23-mailpit` konteyneri, `befb_mun23` DB'si (`drop … with (force)`), worktree (`git worktree remove`). Paylaşılan `fabrika` DB'sine, :3000'e ve ana ağaçtaki başka ajanların dosyalarına (`Dockerfile`, `pnpm-workspace.yaml`, `FON_BRIDGE.md`) dokunulmadı. Commit `git commit -- <5 yol>` ile yapıldı.

**Platform beyanı:** mac (Darwin 27, zsh, Docker Desktop, Postgres 16 @5433, Node 26 + pnpm, system Chrome). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. Koddan bakıldığında değişen yollar platformdan bağımsız: Prisma upsert, SHA-256 (`node:crypto`), WHATWG `URL` ayrıştırması ve düz metin karşılaştırması, React istemci metni. Süreç öldürme, dosya yolu, kabuk ya da ikili adı kullanımı yok.
