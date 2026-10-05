# TASK-MUMLF57HOYFSB — Resend → SMTP (nodemailer) · be-fb

**Commit:** `fe9fd31c` feat(email): send mail over our own SMTP (nodemailer) instead of Resend
**Platform beyanı:** Doğrulama macOS'ta yapıldı (Darwin 27, Docker'da mailpit). Değişiklik yalnız sunucu tarafı TypeScript: nodemailer TCP/TLS soketi açıyor, dosya yolu, kabuk, süreç ya da işletim sistemi API'si kullanmıyor. Linux ve Windows sunucuda aynı çalışır. Windows ve Linux'ta ayrıca koşulmadı çünkü bu makinede yalnız mac var; kod yolu platforma bağlı değil.

## 1. Ne yapıldı

### Mevcut durum (Yapılacaklar 1)
- `src/lib/email/resend-mailer.ts` arayüzü şuydu: `Mailer = (MailMessage{to,subject,html}) => Promise<void>`, `MailSendError`, anahtar yoksa `null`.
- **Admin SMTP formu hiçbir şey kaydetmiyordu.** `handleSaveSmtp` 800 ms bekleyip "başarıyla kaydedildi" diyordu. `handleTestSmtp` 1,2 sn bekleyip "Handshake OK" diyordu. DB'de SMTP ayarı yok, şifreli saklanan bir alan da yok.
- Resend'le giden e-postalar şunlardı: kayıtlı arama uyarısı (`alerts-daily` cron), haftalık beta geri bildirim özeti (`feedback-weekly-digest`), KVKK silme talebi onayı (`request-deletion`), 3 beta betiği (`beta-onboarding`, `beta-pricing-survey`, `esr-calibration`).
- **Kiracı davet API'si (`POST /api/invitations`) hiç e-posta göndermiyordu.** Bağlantıyı yalnız yanıtta dönüyordu.

### Değişiklikler
1. **`src/lib/email/mailer.ts` (yeni):** nodemailer taşıyıcısı. Ayarlar env'den geliyor: `SMTP_HOST`, `SMTP_PORT` (varsayılan 587), `SMTP_SECURE` (boşsa yalnız 465'te örtük TLS, diğer portlarda STARTTLS), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (boşsa `FonBridge <NEXT_PUBLIC_SMTP_FROM_ADDRESS>`).
   - Arayüz korundu: `Mailer`, `MailMessage` ve `MailSendError` aynı. `MailMessage`'a isteğe bağlı `text`, `from` ve `attachments` eklendi (geriye uyumlu).
   - `MailSendError` mesajında yalnız kodlar var (`smtp:<code>:<responseCode>`). Sunucunun cevap metni alıcı adresini içerebildiği için mesaja alınmıyor.
   - Kimlik bilgisi tanımlıysa `requireTLS` açık: parola hiçbir zaman şifresiz bağlantıdan gitmez. Kimlik bilgisi olmayan yerel mailpit etkilenmez.
   - Zaman aşımları 10 sn (bağlantı ve karşılama) ve 30 sn (soket). nodemailer'ın varsayılanı 2 ve 10 dakikaydı.
   - Sunucu alıcıyı `rejected` listesine koyarsa gönderim teslim edilmemiş sayılır ve hata fırlatılır.
2. **SMTP yoksa sessiz yutma yok (Yapılacaklar 4):** `reportMailNotConfigured(caller)` her ortamda `console.error` basar. Üretimde ayrıca `error` seviyesinde bir `SystemAlert` yazar: source `mail`, çağıran başına tek açık satır (`dedupeKey`). Bu şu yerlere bağlandı:
   - davet
   - KVKK silme bildirimi
   - haftalık özet
   - admin test düğmesi

   Haftalık özet üretimde artık `skipped` değil `failed` döner, sebep `no_smtp_config`. `alerts-daily` zaten error alarmı yazıyordu; mesajı `SMTP_HOST unset` olarak güncellendi.
3. **Çağrı noktaları (Yapılacaklar 3):** `alerts-daily`, `digest-run`, `request-deletion` ve 3 betik artık `mailer.ts` üzerinden gönderiyor. Betikler kendi gönderen adreslerini (`Fabrika Beta <…>`) koruyor. `esr-calibration` makbuzuna artık SMTP `messageId`'si yazılıyor.
4. **Davet e-postası:**
   - `POST /api/invitations` daveti yazdıktan sonra e-postayı gönderir. Gönderim en iyi çaba esasındadır: yanıta `emailSent: true|false` eklendi ve bağlantı her durumda dönüyor.
   - SMTP'nin reddettiği gönderim `warn` seviyesinde bir SystemAlert açar. Alarm daveti id'siyle anar, adresi yazmaz.
   - Şablon `src/lib/email/invitation-email.ts`. Kurum adı HTML'de escape ediliyor; konu satırından CR/LF temizleniyor, böylece başlık enjeksiyonu yapılamıyor.
   - Üyeler sayfasındaki mesaj artık "e-posta gönderildi" ile "gönderilemedi, bağlantıyı elle iletin" durumlarını ayırıyor.
5. **Admin SMTP kartı:** Kart salt okunur oldu ve sunucunun gerçekten kullandığı env ayarlarını gösteriyor: host, port, TLS kipi, kullanıcı, gönderen. Parola istemciye hiç gitmiyor. "SMTP Test Et" düğmesi `sendSmtpTestEmail` server action'ını çağırıyor; action `requirePlatformAdmin` ile korunuyor ve gerçek bir e-posta gönderiyor. Sahte "kaydet" düğmesi kaldırıldı.
6. **Kaldırılanlar:** `resend` paketi, `RESEND_API_KEY`, `EMAIL_FROM`, `resend-mailer.ts` ve testi. `.env.example`'a SMTP bloğu eklendi. `docker-compose.yml` mailpit yorumu güncellendi. `nodemailer@^10.0.12` ve `@types/nodemailer` eklendi.

### Hangi ayar geçerli? (Yapılacaklar 2)
**Geçerli olan yalnız env (`SMTP_*`).** Admin formu hiçbir zaman bir şey saklamadığı için öne alınacak bir DB ayarı yok. Formu bu yüzden salt okunur yaptım. `SMTP_PASS` yalnız env'de duruyor, DB'de yok. Şifreli saklama söz konusu değil, çünkü DB'ye yazılmıyor. Parola hiçbir yerde loglanmıyor ve istemciye gönderilmiyor. Admin panelinden düzenlenebilir SMTP isteniyorsa ayrı bir kart gerekir: DB'de şifreli alan, `CALENDAR_ENCRYPTION_KEY` deseni ve öncelik kuralı (bkz. Açık sorular).

## 2. Kanıt

### Gerçek SMTP yakalayıcıda davet e-postası (izole worktree @ fe9fd31c, `next dev -p 3107`, kendi mailpit'im 11025/18025)
Oturum demo girişiyle açıldı; kullanıcı `kamu-b11-owner@example.test` (TENANT_OWNER). Aşağıdaki çıktılarda token maskelendi.
```
POST /api/invitations {"email":"b11-uye-5@example.test","role":"MEMBER"}
{"success":true,"invitation":{"id":"cmulxgw5r001pl5xkyjt6fomf",...,"expires":"2026-10-06T11:41:11.110Z"},
 "inviteLink":"http://localhost:3107/tr/accept-invite?token=<gizli>","emailSent":true} HTTP=200

GET http://localhost:18025/api/v1/messages → total 1
From: FonBridge <noreply@fonbridge.test>  To: b11-uye-5@example.test
Subject: Kamu B11 Test Belediyesi — FonBridge daveti / invitation   (2026-09-29T11:41:11.446Z)
Text: "Kamu B11 Test Belediyesi sizi FonBridge çalışma alanına davet etti.
       Daveti kabul etmek için: http://localhost:3107/tr/accept-invite?token=<gizli> ..."
token in mail == token in API response: True
```
Fikstürler hakkında not: seed'deki kurum sahiplerinin koltukları dolu (1/1), pilot kurumlar da salt okunur. Bu yüzden Kamu B11 test kurumunda **zaten bekleyen** bir daveti yeniden gönderdim; aynı adres koltuk saymıyor. Daveti göndermeden önce `tokenHash` ve `expires` değerlerini sakladım, testten sonra geri yükledim (`restored = t`).

### Admin "SMTP Test Et" (gerçek server action, prod manifest'teki id ile curl)
```
/tr/admin/settings (platform admini) → 200; sayfada "Yapılandırılmış", localhost, 11025, STARTTLS,
  "kimlik doğrulamasız", noreply@fonbridge.test VAR; "SMTP Ayarlarını Kaydet" / "SMTP Şifresi" YOK
action(sendSmtpTestEmail) platform admini  → 1:{"ok":true}  → mailpit: "FonBridge SMTP test" geldi
action(sendSmtpTestEmail) kurum sahibi     → hata; dev.log: PlatformAdminRequiredError ×2; mailpit total 2 kaldı (yeni posta yok)
```

### SMTP yokken üretimde açık hata + SystemAlert (gerçek çağıran, gerçek DB)
`NODE_ENV=production`, `SMTP_HOST` silindi, `runFeedbackDigest({send:true,to})`:
```
[mail] feedback-digest: SMTP is not configured (SMTP_HOST unset) — mail not sent
RESULT {"emailStatus":"failed","emailReason":"no_smtp_config"}
ALERTS [{"id":"cmumlwb7o0000dnxk2obdefhj","level":"error","message":"SMTP is not configured (SMTP_HOST unset):
  feedback-digest mail is not being sent","meta":{"caller":"feedback-digest","alertDedupeKey":"smtp-not-configured:feedback-digest"}}]
```
Bu test alarmını sonra `resolvedAt=now()` ile çözüldü olarak işaretledim; satır silinmedi.

### Kapılar (temiz worktree @ fe9fd31c)
```
pnpm typecheck  → tsc --noEmit, çıktı yok (0)
pnpm lint       → LINT_EXIT=0
pnpm test       → Test Files 216 passed | 2 skipped (218); Tests 2472 passed | 8 skipped (2480); TEST_EXIT=0
                  (8 skipped = adapters/k1-daily-calls/sedia canlı adapter testleri, bu işle ilgisiz, önceden de skip)
                  cron-tenant-scope canlı testi (fabrika_app rolü) KOŞTU: 7/7, "a send the provider refuses" → smtp:EENVELOPE:550
pnpm build      → i18n denetimi + next build, BUILD_EXIT=0
```

### Mutasyon (taşıyıcıyı kırınca test kırmızı; yalnız worktree'de, sonra geri alındı)
| Mutasyon | Sonuç |
|---|---|
| M1 `transport.sendMail` hiç çağrılmıyor | 4 test × (sendMail bloğu) |
| M2 SMTP hatası yutuluyor (`MailSendError` fırlatılmıyor) | 1 failed / 16 |
| M3 `rejected` kontrolü silindi | 1 failed / 16 |
| M4 üretimde SystemAlert yazılmıyor | 2 failed (mailer + digest) |

### DoD grep (fe9fd31c sonrası ana ağaç)
```
grep "RESEND_API_KEY|EMAIL_FROM|from 'resend'|import('resend')|resend-mailer" src tests scripts package.json .env.example docker-compose.yml → 0
package.json "resend" → 0 · pnpm-lock.yaml resend → 0 · node_modules/resend → yok
```

## 3. Değişen dosyalar (fe9fd31c)
- Yeni: `src/lib/email/mailer.ts`, `src/lib/email/invitation-email.ts`, `src/lib/email/__tests__/mailer.test.ts`, `src/app/[locale]/admin/settings/actions.ts`
- Silinen: `src/lib/email/resend-mailer.ts`, `src/lib/email/__tests__/resend-mailer.test.ts`
- Değişen:
  - `src/lib/env.ts`
  - `.env.example`
  - `docker-compose.yml` (yalnız yorum)
  - `package.json`
  - `pnpm-lock.yaml`
  - `src/app/api/invitations/route.ts`
  - `src/app/[locale]/(app)/[workspace]/settings/members/page.tsx`
  - `src/app/[locale]/admin/settings/{page,smtp-form}.tsx`
  - `src/actions/user/request-deletion.ts`
  - `src/lib/feedback/digest-run.ts`
  - `src/lib/inngest/jobs/{alerts-daily,feedback-weekly-digest}.ts`
  - `src/lib/inngest/jobs/__tests__/{alerts-daily,cron-tenant-scope}.test.ts`
  - `tests/feedback-digest-run.test.ts`
  - `scripts/{beta-onboarding,beta-pricing-survey,esr-calibration,run-feedback-digest}.ts`
  - `scripts/README.md` (tek satır)
- Auth dosyalarına (AuthCard.tsx, actions/auth.ts, oauth-registration.ts), Sentry dosyalarına ve `docs/` belgelerine dokunulmadı.

## 4. Riskler
- **Yerel `.env`'de `SMTP_*` yok.** `:3000`'deki dev sunucusu artık hiç e-posta göndermiyor; eskiden de `RESEND_API_KEY` boş olduğu için göndermiyordu. Mailpit'e düşmesi için `.env`'e `SMTP_HOST=localhost` ve `SMTP_PORT=1025` eklenmeli. Paylaşılan `.env`'e ben dokunmadım.
- **Kurumsal SMTP'ye özgü noktalar:**
  - Gmail/Workspace "uygulama şifresi" ister.
  - `SMTP_FROM`, hesabın gönderme izni olan bir adres olmalı; değilse sunucu reddeder ya da From'u değiştirir.
  - Beta betiklerindeki `Fabrika Beta <BETA_SUPPORT_EMAIL>` göndereni de aynı izne tabi.
  - Resend'in sağladığı SPF/DKIM hizalaması artık alan adının kendi DNS'inde olmalı.
- **Gönderim senkron.** Davet isteği SMTP'yi en fazla ~10 sn (bağlantı zaman aşımı) bekleyebilir. Kuyruk kararı TASK-MUMLFDTNQ53VJ'de (Inngest → kendi kuyruğumuz).
- **nodemailer 10.x yeni bir ana sürüm.** Kurulumda pnpm supply-chain politikası geçti. Açık bir tavsiye (advisory) bulunmadı, ama ayrıca `pnpm audit` koşmadım.

## 5. Açık sorular
- Admin panelinden düzenlenebilir SMTP (DB'de şifreli, env'in önüne geçen) isteniyor mu? İsteniyorsa ayrı kart açılmalı. Şu an tek kaynak env.
- E-postayla giriş bağlantısı (magic link) yok. Auth dosyalarına dokunmadım; gerekirse fe-fb'nin işi.

## 6. Sonraki adım
- **cs-fb:** `README.md:54`, `docs/INNGEST.md` ve `docs/ROADMAP.md` hâlâ `RESEND_API_KEY`'den söz ediyor; SMTP_* ile güncellenmeli.
- **devop-fb / patron:** Üretim env'ine `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` ve `SMTP_FROM` girilmeli. Ardından admin → Ayarlar → "SMTP Test Et" ile kurumsal hesaptan gerçek bir e-posta gönderilerek doğrulanmalı.
- crw-fb incelemesi.
