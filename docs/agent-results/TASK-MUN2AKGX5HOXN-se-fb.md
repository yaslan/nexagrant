# TASK-MUN2AKGX5HOXN — se-fb — FB İNCELEME-28: belge ↔ kod tutarlılığı (TASK-MUN23L19681HC, `631c7d4c`)

Sprint FB-KAMU-2 · dal `dev` · incelenen commit `631c7d4c` (cs-fb), rapor `docs/agent-results/TASK-MUN23L19681HC-cs-fb.md`. Kod `HEAD` = `7ba1a495` üzerinden `git show HEAD:<dosya>` ile okundu. **Belgelere dokunmadım** (görev kuralı).

## Karar: **DÜZELTME GEREKLİ** (küçük)

Çekirdek iddiaların hepsi koddan doğrulandı: alıcı SMTP, e-postadaki alanlar, 10 dk ve 50/24 saat sınırı, `AuditEvent`'te adres yok, kabul sayfası yok, Inngest çıktı, iş yolları, `env.ts:43-45`. Bir olgu hatası var (B-1). Bir işleyen eksik (B-2). SMTP'nin ne olduğu iki farklı modelle anlatılıyor (B-3). Üç küçük eksik daha var (B-4..B-6). Hiçbiri paketi hukukçuya göndermeyi durdurmaz. B-1, B-2 ve B-3 gönderimden önce düzeltilmeli.

## 1. Ne yapıldı
- `631c7d4c`'nin üç belgedeki bütün `+` satırları tek tek koda ya da git'e karşı kontrol edildi (tablo §2).
- Davet akışında hangi verinin kime gittiğine bakıldı. Kontrol edilen yerler: e-posta gövdesi, konu, `AuditEvent`, `SystemAlert`, console günlüğü, API yanıtı.
- graphile-worker işleri tarandı: kişisel veri işliyor mu, nerede koşuyor?
- Güvenlik gözüyle bakılan konular: token'ın taşınması, TLS koşulu, alıcı listesinde eksik işleyen.

## 2. Kanıt — iddia ↔ kod

| # | Belge iddiası (yer) | Kod / git | Sonuç |
|---|---|---|---|
| 1 | Alıcı: SMTP, `fe9fd31c`'den beri (`processing-register.md:34`) | `route.ts:7,77,254` `smtpMailer()` → `mailer(renderInvitationEmail(...))`; `git merge-base --is-ancestor fe9fd31c HEAD` ✓ | ✓ |
| 2 | E-posta içeriği: adres, kurum adı, token'lı bağlantı, son tarih (`:30,34`) | `invitation-email.ts:16-58`: `to`, `org` (konu + gövde), `inviteLink` (`?token=<ham>`), `until` (ISO tarih). Rol, davet eden kişinin adı ve e-postası yok | ✓ |
| 3 | 7 gün geçerli (`:34`) | `route.ts:72` `7 * 24 * 60 * 60 * 1000` | ✓ (bu süreyi uygulayan bir okuyucu yok, bkz. #10) |
| 4 | Veritabanında yalnız `tokenHash` (`:30`) | `route.ts:71,121-122` `issueSecretToken()` → yalnız `hash` yazılır | ✓ |
| 5 | Aynı davete 10 dk, kiracı başına kayan 24 saatte 50 (`:36`) | `invitation-mail-policy.ts:30` `10*60*1000`, `:39` `50`, `:67-79` davet id'sine göre soğuma, `:81-88` 24 saat sayımı | ✓ |
| 6 | Sayım `AuditEvent`'ten, satırda adres yok (`:30,36`) | `route.ts:129-133` `{tenantId, actorId: userId, type: INVITATION_MAIL_SENT, target: invitation.id}`; `:269` `{tenantId, type: INVITATION_MAIL_FAILED, target}` | ✓ adres yok. ✗ `email_failed`'de `actorId` **yok** → **B-1** |
| 7 | `NEXT_PUBLIC_APP_URL` yoksa ya da üretimde loopback ise e-posta gitmez (`:36`) | `policy.ts:101-117`; `route.ts:232-241` | ✓ |
| 8 | Konu satırında 80 karakter, HTML'de kaçış (`:36`) | `invitation-email.ts:6,23,28-33` (CRLF temizliği de var) | ✓ |
| 9 | Satır numaraları "`3bc74a7b`'ye göre" (`:36-37`) | `git diff --stat 3bc74a7b HEAD -- src/app/api/invitations src/lib/email` → boş. `:128-132` gerçekte yorum 126-128 ve create 129-133, bir satır kayıyor, kabul edilebilir | ✓ |
| 10 | `/tr/accept-invite` sayfası ve token'ı kullanan bir yol yok (`:34`, §22 md.14) | `git ls-files src \| grep -iE 'accept\|invite'` → yalnız ajans davet kodu ve beta dosyaları. `git grep tokenHash HEAD -- src` → davet için okuyucu yok (yalnız `route.ts` yazıyor ve bir test). `invitation.find*` yalnız `route.ts:112`, `seat-limit.ts:55` count | ✓ |
| 11 | §21 SMTP satırı §2'yi sayıyor (`:397`) | diff ✓ | ✓ (§14 eksik → **B-6**) |
| 12 | Inngest koddan çıktı (`5ed2261a`; HUKUK §5 md.3, §8 md.6) | `git grep -i inngest HEAD -- src package.json .env.example docker-compose.yml Dockerfile` → boş. Belgelerde yalnız üstü çizili satırlar kaldı | ✓ |
| 13 | İş yolları `src/lib/jobs/tasks/…` (`:119,121,220,250,264`) | `git ls-tree HEAD src/lib/jobs/tasks/` → `users-scheduled-deletion.ts`, `alerts-daily.ts` mevcut. `:121-123` `aiUsageLog.updateMany … userId: null` (kapanış `:124`) | ✓ |
| 14 | VERİ-YERLEŞİMİ md.5: kuyruk ayrı bağlantı verilmezse ana DB'de (`env.ts:43-45`) | `env.ts:43-45`: "JOBS_DATABASE_URL … unset = DATABASE_URL. Job bodies always use DATABASE_URL" | ✓ (bkz. B-2 notu) |
| 15 | Adres günlüğe ve uyarıya yazılmıyor (dolaylı) | `route.ts:166` log'da adres yok. `:246-248,263-264` `SystemAlert.meta` = `{tenantId}` / `{invitationId, reason}`. `mailer.ts:38-46` `MailSendError` SMTP yanıt metnini taşımaz (550 yanıtları adresi geri yansıtır) | ✓ |

**graphile-worker ve kişisel veri** (`HEAD`):
- Worker ayrı bir süreçtir: `Dockerfile:50-57` (hedef `worker`), `docker-compose.yml:42-56` (`fabrika-worker`, web ile aynı `DATABASE_URL`), `package.json:22` `jobs:worker`.
- Kişisel veri işleyen işler:
  - `users-scheduled-deletion`: `User` okur, siler ya da anonimleştirir (§17).
  - `alerts-daily`: kullanıcılara e-posta atar (§18).
  - `feedback-weekly-digest`: geri bildirim başlığını ve kurum adını SMTP ile iç alıcıya gönderir (`digest.ts:11-19,100-101`) → **B-6**.
  - `m4-weekly-summary` e-posta atmıyor (`:94` TODO).
- İş yükleri (payload) kişisel veri taşımıyor. `users-scheduled-deletion` kişiyi DB'den bulur (`:88-92`). `enqueue.ts` payload'ında yalnız dönem ve ay var.
- _Varsayım (doğrulanmadı):_ graphile, hata veren işin mesajını `graphile_worker` şemasına `last_error` olarak yazar. Prisma hata metni değer içerirse kuyruk tablosuna kişisel veri düşebilir.

## 3. Bulgular (numaralı)

**B-1 — Olgu hatası (düşük).** `docs/legal/processing-register.md:30` iki olayı birlikte anlatıyor: "`invitation.email_sent` / `invitation.email_failed`: davet eden `actorId`, hedef = davet id'si". `HUKUK-SORULARI-2026-09.md:10` 1.6 (b) de aynı şeyi söylüyor: "yalnız davet edenin kimliği ve davetin kimliği vardır".
- Kod: `route.ts:269` `email_failed` satırını `actorId` olmadan yazıyor. cs-fb'nin kendi raporu da bunu yazıyor ("`:269` … bunda `actorId` de yok"), ama belgeye geçmemiş.
- **Düzeltme:** "`email_sent`: davet eden `actorId` + hedef davet id'si; `email_failed`: yalnız hedef davet id'si". HUKUK 1.6 (b) için de: "gönderim satırında davet edenin kimliği ve davetin kimliği; başarısız gönderim satırında yalnız davetin kimliği".

**B-2 — Eksik işleyen: barındırma / Postgres (orta; `631c7d4c` öncesinden kalma, ama bu commit o cümleye dokundu).** `processing-register.md:34` "Üyelik ve rol verisi yalnız iç veritabanındadır" diyor. §21 alıcı tablosunda (`:389-403`) ise barındırma satırı hiç yok.
- Uygulama, worker (`fabrika-worker`) ve Postgres üçüncü taraf bir barındırma sağlayıcısında koşacak. Adaylar:
  - `docs/ARCHITECTURE.md:7,88`: Vercel ve Neon.
  - `docs/SECURITY_COMPLIANCE.md:103`: alt işleyen listesinde Vercel, Neon/Supabase, Fly.io.
- Başka belgeler bunu zaten açık soru olarak yazıyor: `VERI-YERLESIMI.md` md.1 ("veritabanı ve uygulama sunucusu: hangi firma, hangi bölge") ve `HUKUK:337` (barındırma sağlayıcısı alıcı mı?). Envanter ise bu işleyeni hiç anmıyor.
- Davet satırları, `AuditEvent` ve artık iş kuyruğu da bu sağlayıcının diskinde duruyor.
- **Düzeltme:**
  - §21'e bir satır: "Barındırma sağlayıcısı (uygulama, iş kuyruğu worker'ı, Postgres): **Açık — patron belirleyecek**; tüm tablolar".
  - §22'ye bir madde.
  - §2:34'te "iç veritabanı" yerine: "kendi veritabanımız (barındırma sağlayıcısı açık, §21)".
  - VERİ-YERLEŞİMİ md.5'e bir yarım cümle: "worker ayrı bir süreçtir, uygulamayla aynı barındırmada koşar (md.1)".

**B-3 — SMTP iki farklı modelle anlatılıyor (orta).**
- Aynı hücrede (`processing-register.md:34`) iki ifade var: "**Kendi SMTP sunucumuz**" ve "SMTP sağlayıcısı kurumsal e-posta hesabıdır". Aynı ifade §17 `:247` ve §18 `:261`'de de geçiyor.
- `HUKUK:337` (798ccd6e2, 1.4'ten) ise "kendi SMTP sunucumuz … bir barındırma sağlayıcısının sunucusunda çalışacak" diyor. Bu, kendi kurduğumuz bir sunucu demek.
- Kod (`mailer.ts:5-7`: "organisation's mail account") ve 29.09 kararı üçüncü taraf bir e-posta hesabını anlatıyor. Bu durumda e-posta sağlayıcısı **ayrı bir veri işleyen** olur. Kendi kurduğumuz sunucuda ise alıcı barındırma sağlayıcısıdır.
- Hukukçu ikisini ayırt edemez. Envanterde "kendi" kelimesi, verinin dışarı çıkmadığı izlenimini veriyor.
- **Düzeltme:** tek bir dil kullanılsın: "kurumsal e-posta hesabının SMTP sunucusu (üçüncü taraf e-posta sağlayıcısı; firma ve ülke açık)". `HUKUK:337` buna göre yeniden yazılsın, ya da iki olasılık açıkça sorulsun.

**B-4 — Token'ın taşınma koşulu tedbir satırında yok (düşük, güvenlik).** E-postadaki token bir giriş kimlik bilgisidir (`.env.example:109-110` kendisi böyle diyor).
- `mailer.ts:89` TLS'i yalnız kimlik bilgisi (`SMTP_USER/PASS`) varken zorunlu kılıyor.
- Kimlik bilgisiz bir relay'de STARTTLS fırsatçıdır. Token düz metin gidebilir.
- Bu uyarı yalnız `.env.example:107-111`'de var. Envanter §2 tedbir satırı (`:36`) bundan söz etmiyor.
- Bağlantıyı SMTP sağlayıcısı ve davetlinin posta kutusu sağlayıcısı düz metin görür. Bu, davet bağlantılarının doğasında var. Ama envanterde "token'lı bağlantı üçüncü taraftan geçer" diye açıkça yazılmalı.
- **Düzeltme:** §2 tedbir satırına: "SMTP'ye TLS, kimlik bilgisi tanımlıyken zorunlu (`mailer.ts:89`); kimlik bilgisiz relay üretimde kullanılmaz (`.env.example:107-111`) — bu bir işletim kuralı, kod kilidi değil".

**B-5 — Saklama süresi kendi içinde çelişiyor (düşük, önceden kalma).** `processing-register.md:35` iki şey söylüyor: "`Invitation`: `expires` alanına kadar" ve "otomatik temizlik yok". Temizlik olmadığına göre davetlinin adresi **süresiz** kalıyor.
- Yeniden davet satırı günceller (`route.ts:119-124`), silmez. Davetin kabul yolu da yok (#10).
- Yeni `AuditEvent` `invitation.email_*` satırları da §13 saklamasına tabi. Bu da yazılmamış.
- **Düzeltme:** "`Invitation`: süresiz — temizlik işi yok (**açık**); `AuditEvent` gönderim satırları §13'e tabi".

**B-6 — Haftalık geri bildirim özeti SMTP ile gidiyor, envanterde yok (düşük, iş kuyruğu taraması).** `feedback-weekly-digest` işi `Feedback.title` ve kurum adını e-postayla gönderiyor (`digest.ts:11-19,100-101`).
- Başlık serbest metin (`digest.ts:80` "attacker-controlled free text") ve kişisel veri içerebilir. Bu kısım _varsayım_.
- §14 alıcısı yalnız R2 diyor (`:205`). §21 SMTP satırı §14'ü saymıyor (`:397`).
- **Düzeltme:** §14 alıcısına "haftalık özet e-postası: başlık + kurum adı, SMTP (§21), iç alıcı `FEEDBACK_DIGEST_TO`" eklensin. §21'in atfına §14 eklensin.

**Belge dışı — TASK-MUN2793A57Z9I'ye güvenlik gereksinimi (bulgu değil, öneri).** Kabul yolu yazılırken şunlar gerekli:
- (a) Token özetiyle aransın ve `expires` kontrol edilsin.
- (b) Tek kullanımlık olsun: kabulde `tokenHash` silinsin ya da satır silinsin.
- (c) **Giriş yapan kullanıcının e-postası `Invitation.email` ile eşleşsin.** Ham token davet edene de dönüyor (`route.ts:164,189`). Bu kural olmazsa davet eden kişi bağlantıyı başka bir hesapla kabul edebilir.
- (d) Token URL sorgusunda taşınıyor. Kabul sayfası `Referrer-Policy: no-referrer` kullansın ve token'ı hemen adresten silsin (POST ya da yönlendirme). Barındırma erişim günlükleri için `HUKUK:209`'daki `karne=` riskiyle aynı sınıftır.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUN2AKGX5HOXN-se-fb.md` (bu rapor). Belgeye ve koda dokunulmadı.

## 5. Riskler
- **Çalışma ağacında başkasının commit'lenmemiş işi var.** Dosyalar: `route.ts`, `invitation-mail-policy.ts`, `members/page.tsx`, `Dockerfile`, bir canlı test. İçerik İNCELEME-26 Ö-1 (`recently_sent`'te token korunuyor, link dönmüyor) ve Ö-3 (loopback).
  - Bu iş commit'lenince §2'deki `route.ts:128-132,163,254,269` ve `policy.ts:101-117` satırları 5-9 satır kayar.
  - `recently_sent` davranışı da değişir: token korunur, yanıtta link olmaz.
  - Belge satırları "`3bc74a7b`'ye göre" diye sabitlendiği için bugün yanlış değil. Ama paket 1.7'de bu satırlar yenilenmeli.
- B-3 düzeltilmeden hukukçu SMTP'yi "iç sistem" diye okuyabilir.

## 6. Açık sorular
- SMTP, üçüncü taraf bir kurumsal e-posta hesabı mı (Google Workspace, Yandex vb.), yoksa barındırmada kendi kurduğumuz bir sunucu mu? B-3 bu kararın metne geçmesi. Karar patronun.
- **Sonuç yolu çelişkisi:** görev metni iki yol verdi. `SONUÇ DOSYASI: …/FONBRIDGE/docs/agent-results/TASK-MUN2AKGX5HOXN-se-fb.md` ve alttaki `/Users/macbook/alan/docs/agent-results/TASK-MUN23L19681HC-cs-fb.md`. İkincisi hem repo dışında, hem de **incelenen ajanın** rapor adı. Oraya yazmak cs-fb'nin raporunun kopyasını ya da üzerine yazmayı gerektirirdi. Hafızadaki kural ([[sonuc-dosyasi-yolu-repo-ici-esas]], [[agentspace-delegasyon-sonuc-yolu-kurali]]) gereği repo içindeki kendi yolumu kullandım.

## 7. Sonraki adım
- cs-fb B-1..B-6'yı paket 1.7'de işlesin. B-1, B-2 ve B-3 hukukçuya gitmeden önce yapılmalı.
- Açık Ö-1 ve Ö-3 işi commit'lenince §2 satır numaraları yenilensin.
- Belge dışı (a)–(d) maddeleri TASK-MUN2793A57Z9I kartına eklensin.

**Platform beyanı:** yalnız belge incelemesi. mac (Darwin 27) üzerinde `git show/grep/ls-tree/diff` ile doğrulandı. İncelenen kod yolu (SMTP, Postgres, graphile-worker) platforma bağlı değil. Worker Linux konteynerinde koşar (`Dockerfile` `worker` hedefi, Node 22). Windows'ta koşulacak bir şey yok. Linux konteyneri bu incelemede çalıştırılmadı, çünkü iddiaların hepsi statik ve git ile doğrulanabilir.
