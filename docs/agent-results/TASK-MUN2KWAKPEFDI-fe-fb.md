# TASK-MUN2KWAKPEFDI — fe-fb — FB İNCELEME-31: belge ↔ kod tutarlılığı (TASK-MUN2FJ4R24QPT, `7bb11e85`, hukuk paketi 1.7)

## Karar: **ONAY** (hukuk paketi 1.7; B-1..B-6 kapandı) · engellemeyen 2 not (N-1, N-2)

Belge değiştirilmedi (kapsam: yalnız inceleme). Kod `a40b6bf4`'ten beri değişmedi: `git diff --stat a40b6bf4 HEAD -- src .env.example` boş (HEAD `6479b4a3`), yani 1.7'nin kanıt commit'i bugünkü kodla aynı.

## 1. Ne yapıldı

- `7bb11e85`'in üç belgedeki diff'ini (`processing-register.md`, `HUKUK-SORULARI-2026-09.md`, `VERI-YERLESIMI.md`) kelime-diff ile okudum. İNCELEME-28 bulgularını (`TASK-MUN2AKGX5HOXN-se-fb.md` §3 B-1..B-6) bu diff'le satır satır karşılaştırdım.
- Belgelerdeki her dosya:satır atfını `sed -n` ile kodda açtım (liste §2'de).
- `fc763927`'nin (recently_sent'te token korunuyor, link dönmüyor) belgelere yansıyıp yansımadığını `grep` ile taradım.
- B-3 "tek ifade" kuralı için `docs/legal`, `docs/kamu` ve `docs/*.md` içinde "kendi SMTP" / "iç veritabanı" aradım.

## 2. Kanıt: bulgu ↔ belge ↔ kod

| # | İNCELEME-28 istedi | 1.7'de belge | Kod (HEAD = `a40b6bf4` kodu) | Sonuç |
|---|---|---|---|---|
| B-1 | `email_failed` satırında `actorId` yok | `processing-register.md:30`: "`email_sent` satırında davet eden `actorId` + hedef…; `email_failed` satırında yalnız hedef…, `actorId` yok (`route.ts:136`, `:276`)". HUKUK:10 1.6 (b) "(1.7'de düzeltildi)" ve 1.7 (a) aynı şeyi söylüyor | `route.ts:136` `data: { tenantId, actorId: userId, type: INVITATION_MAIL_SENT, target: invitation.id }` · `route.ts:276` `tx.auditEvent.create({ data: { tenantId, type: INVITATION_MAIL_FAILED, target: invitationId } })` | ✅ doğru |
| B-2 | barındırma/Postgres §21'de açık alıcı; :34 düzelsin; §22 madde; VERİ-YERLEŞİMİ md.5 | §21'de yeni satır "Barındırma sağlayıcısı (uygulama, iş kuyruğu worker'ı `fabrika-worker`, Postgres) · **Açık — patron belirleyecek** · Tüm tablolar"; `:34` "veritabanı üçüncü taraf bir barındırma sağlayıcısında koşar (… §21)"; `:118` (§8) ve `:177` (§12) "yalnız kendi veritabanımız (barındırma sağlayıcısı açık, §21)"; §22 md.15; VERİ-YERLEŞİMİ md.5'e worker cümlesi | `docs/ARCHITECTURE.md:7` "Next.js 15 (Vercel)", `:88` "Vercel PR + Neon branch"; `docs/SECURITY_COMPLIANCE.md:103` "Vercel, Neon/Supabase, Fly.io"; `Dockerfile:52` `FROM base AS worker`; `docker-compose.yml:42` `fabrika-worker:`; `src/lib/env.ts:43-45` JOBS_DATABASE_URL notu | ✅ doğru |
| B-3 | SMTP tek ifade + iki model "karar bekliyor" | register `:34`, §17 `:247`, §18 `:261`: "kurumsal e-posta hesabının SMTP sunucusu (sağlayıcı ve ülke **açık — patron karar verecek**; iki seçenek ve etkileri §21'de)"; §21 SMTP satırı (a)/(b) seçenekleri; HUKUK:334 + :337-339 ek görüş iki seçenekle yeniden yazıldı; VERİ-YERLEŞİMİ e-posta satırı iki model; §22 md.17 | `src/lib/email/mailer.ts:5-7` "Outgoing mail over our own SMTP server (… mail goes out through the organisation's mail account)"; kod iki modeli ayırmıyor, yalnız `SMTP_*` okuyor | ✅ hukuk paketinde doğru · kamu paketinde bir kalıntı → **N-2** |
| B-4 | token taşıma koşulu (requireTLS, kimlik bilgisiz relay yasağı) | register `:34` "token'lı bağlantı üçüncü taraftan geçer"; `:36` "TLS yalnız kimlik bilgisi tanımlıyken zorunlu (`requireTLS`, `mailer.ts:89`); kimlik bilgisiz relay'de STARTTLS fırsatçıdır… üretimde kimlik doğrulamasız relay kullanılmaz (`.env.example:107-111`). Bu bir **işletim kuralıdır, kod kilidi değil**" | `mailer.ts:89` `requireTLS: !config.secure && config.auth !== null,` · `.env.example:107` "PRODUCTION: do not use a relay without SMTP_USER/SMTP_PASS" … `:111` "SMTP_SECURE=true (port 465) or make STARTTLS mandatory on the relay itself." | ✅ doğru; "kod kilidi değil" nitelemesi de doğru (auth yoksa `requireTLS` false) |
| B-5 | davet satırı süresiz; temizlik yok; kart | `:35` "`Invitation`: **süresiz** — `expires` yalnız bağlantının geçerlilik tarihidir… temizlik işi yok; yeniden davet satırı günceller, silmez (`route.ts:124-129`)… TASK-MUN2J9LLXNREG, §22 md.16. `AuditEvent` `invitation.email_*` satırları §13 saklamasına tabidir"; HUKUK:345 altıncı saklama kalemi | `route.ts:124-129` `tx.invitation.upsert({ … update: keepToken ? { role, expires } : { tokenHash, role, expires }, create: … })`; `src` içinde `invitation.deleteMany` / davet temizlik işi yok (`grep -n deleteMany route.ts` boş; `schedule.ts` listesinde davet işi yok) | ✅ doğru |
| B-6 | `feedback-weekly-digest` SMTP ile iç alıcıya; §14 + §21 atfı | §14 `:205` "Haftalık özet e-postası (`feedback-weekly-digest`, pazartesi 06:00 UTC): geri bildirim başlığı + kurum adı (+ öncelik, durum, tarih), SMTP ile (§21) iç alıcıya (`FEEDBACK_DIGEST_TO`)… (`digest.ts:11-19,100-101`, `digest-run.ts:120,146`)… (_varsayım_; … `digest.ts:80`)"; §14 kaynak satırına 3 dosya; §21 SMTP satırı "§14 haftalık geri bildirim özeti" sayıyor | `schedule.ts:53` `{ id: 'feedback-weekly-digest', cron: '0 6 * * 1', …}` (pazartesi 06:00 UTC ✓); `digest.ts:11-19` `DigestRow`; `:80` "report titles are attacker-controlled free text"; `:100` `escapeHtml(r.title)`, `:101` `escapeHtml(r.tenantName)`, `:103` `formatDate(r.createdAt)` (tarih ✓; `category` e-postaya yazılmıyor, belge de saymıyor ✓); `digest-run.ts:120` `const recipient = options.to \|\| env.FEEDBACK_DIGEST_TO;`, `:146` `await sender({ to: recipient, subject, html });` | ✅ doğru |

Ek satır atıfları (hepsi tuttu): register `:34` `route.ts:72` (`expires` 7 gün), `:168` (`acceptPath` = `/tr/accept-invite?token=`), `:261` (`mailer(renderInvitationEmail(...))`); `:36` `invitation-mail-policy.ts:32` (`COOLDOWN_MS = 10*60*1000`), `:41` (`DAILY_LIMIT = 50`), `route.ts:133-137` (gönderim satırı yazımı).

`fc763927` soyu: `git merge-base --is-ancestor fc763927 a40b6bf4` → doğru; `a40b6bf4` `7bb11e85`'in atası. Yani 1.7'nin "kanıt satırları `a40b6bf4`'e göre" dediği kod `fc763927`'yi içeriyor ve satır numaraları (`:136`, `:276`, `:124-129`, `:168`) `fc763927` sonrası kaymayı doğru yansıtıyor.

## 3. Bulgular (numaralı)

B-1..B-6: **hepsi kapandı**, belgede yanlış ya da eskimiş satır bulunmadı (tablo §2).

**N-1: `fc763927` belgelerde hiç anlatılmıyor (düşük, engellemez).** Yazılanlarda yanlış yok, ama bir boşluk var.
- `grep -rn 'fc763927\|recently_sent\|inviteLink\|davet edene' docs/legal docs/kamu` sonuç vermiyor.
- register `:36` "aynı davete 10 dakika içinde ikinci e-posta gitmez" diyor. Kodla doğru (`invitation-mail-policy.ts:80`). Eksik kalan iki ayrıntı var: `email_failed` bekleme süresini bitirir, yeniden deneme hemen yapılabilir (`invitation-mail-policy.ts:21-24`). Bekleme süresinde token korunur ve link dönmez (`route.ts:123-126,196`).
- Veri akışı açısından asıl eksik şu: e-posta gitmediğinde (`daily_limit`, SMTP yok, URL yok, `send_failed`) token'lı bağlantı **davet edenin yanıtına** döner (`route.ts:188-196`). Envanter §2 bu akışı yazmıyor. Alıcı iç kullanıcıdır, üçüncü taraf değildir. Yine de giriş kimlik bilgisi sayılan bir değerin nereye aktığı sorusudur. İNCELEME-28 "belge dışı (c)" de "ham token davet edene de dönüyor" diyordu.
- Paketin kendi ölçütü (HUKUK §8 md.6: "değişikliği, kodun `dev` dalına düştüğü commit ile işler") gereği `fc763927` 1.7'de en az bir cümleyle anılmalıydı.
- **Öneri (sonraki sürüm):** register §2 "Veri kategorileri" ya da "Tedbir" hücresine şu cümle: "E-posta gitmezse token'lı bağlantı davet edene API yanıtında döner, davet eden elle iletir. 10 dakikalık bekleme içinde token değişmez ve bağlantı dönmez (`fc763927`, `route.ts:123-126,188-196`). Başarısız gönderim beklemeyi bitirir (`invitation-mail-policy.ts:21-24`)."

**N-2: B-3 tek ifade kuralı kamu paketinde tam uygulanmamış (düşük, `7bb11e85` kapsamı dışında).**
- `docs/kamu/ILKADIM-PILOT.md:157` (R3 risk satırı) hâlâ "e-posta artık **kendi SMTP'mizden**, sağlayıcı ve ülkesi patron belirleyecek" diyor. B-3'ün düzelttiği ifade tam olarak bu: "kendi" kelimesi verinin dışarı çıkmadığı izlenimini veriyor. Bu satır pilot görüşmesi belgesinde duruyor.
- Aynı ifade teknik belgelerde de var: `docs/ARCHITECTURE.md:61`, `docs/SECURITY_COMPLIANCE.md:103,124`, `docs/ROADMAP.md:116`. Bunlar hukukçuya giden belgeler değil. Bilgi olarak yazıyorum.
- HUKUK:10'daki 1.4 değişiklik notu "kendi SMTP sunucumuzdan" diyor. Bu tarihsel bir not, 1.7 (c) onu açıkça düzeltiyor. Bulgu değil.
- **Öneri:** ILKADIM-PILOT R3 cümlesi: "e-posta artık kurumsal e-posta hesabının SMTP sunucusundan (model, firma ve ülke patron kararı bekliyor; bkz. `processing-register.md` §21)".

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MUN2KWAKPEFDI-fe-fb.md` (bu rapor). Başka dosyaya dokunulmadı.

## 5. Riskler

- N-1 açık kalırsa hukukçu, token'lı bağlantının davet edenin tarayıcısına da düştüğünü envanterden öğrenemez. Kabul sayfası (TASK-MUN2793A57Z9I) yazılırken "giriş yapan e-posta = `Invitation.email`" kuralı bu yüzden kritik kalıyor.
- Görev metnindeki "KANIT ZORUNLU" satırı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUN2FJ4R24QPT-cs-fb.md`'ye yazmamı söylüyordu. Bu yol hem repo dışında hem de **incelenen görevin (cs-fb) rapor adı**. Oraya yazmak başkasının raporunu taklit etmek ya da ezmek olurdu. Görevde açıkça verilen SONUÇ DOSYASI yoluna yazdım (bu dosya).

## 6. Açık sorular

- N-1 ve N-2 ayrı küçük bir karta mı gidecek, yoksa TASK-MUN2J9LLXNREG ya da TASK-MUN2793A57Z9I düştüğünde yapılacak 1.8 güncellemesine mi eklenecek? Önerim 1.8'e eklenmesi: ikisi de kod değişikliği gerektirmiyor.

## 7. Sonraki adım

- cs-fb: 1.8'de N-1 cümlesi (register §2) ve N-2 (ILKADIM-PILOT:157).
- TASK-MUN2J9LLXNREG düşünce register `:35` "süresiz" ve §22 md.16 güncellenmeli (belge bunu kendisi söylüyor).

## Platform beyanı

İnceleme **macOS**'ta (Darwin 27.0.0, zsh, git) yapıldı. Kod yolu çalıştırılmadı, yalnız okundu ve `git` ile karşılaştırıldı. İncelenen iddialar (SMTP TLS, davet satırları, cron `0 6 * * 1` UTC) platformdan bağımsız sunucu tarafı mantığıdır. Windows ve Linux'ta ayrıca koşulmadı, çünkü yürütülecek bir şey yoktu: belge↔kod incelemesi.
