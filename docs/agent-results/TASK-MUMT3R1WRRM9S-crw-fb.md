# TASK-MUMT3R1WRRM9S — FB İNCELEME-26 · crw-fb

**Sprint:** FB-GAP-1 · **Dal:** dev · **İncelenen ağaç:** `2c20324f` (temiz, ayrı worktree; `1c6b3e70`, `327849c0` ve `9dff3673` bu ağacın atası, `git merge-base --is-ancestor` ile doğrulandı) · **Tarih:** 29.09.2026
**Kapsam:** yalnız inceleme. Kod ve belgeye dokunulmadı. Bu rapor dışında hiçbir dosya değişmedi.
**Not:** Bu, kartın üçüncü denemesi. Önceki iki deneme uygulama yeniden başlayınca rapor yazılmadan düşmüştü.

| Kart | Karar |
| --- | --- |
| **(1)** TASK-MUMO2XIQEHGUD (be-fb): davet e-postası sınırı | **ONAY.** Bloke eden bulgu yok. Ö-1…Ö-4 öneri. |
| **(2)** TASK-MUMSRVP2LK8GM (cs-fb): hukuk paketi 1.5 | **ONAY (B-1…B-6 kapandı).** Yeni bir bulgu var: **Y-1**. Kartı bloke etmiyor, ama paket hukukçuya gitmeden önce düzeltilmeli. |

---

## 1. Kart (1): davet e-postası sınırı (`1c6b3e70`, `327849c0`)

### 1.1 Sorulan her nokta

| Soru | Sonuç | Dayanak |
| --- | --- | --- |
| 10 dk soğuma | ✔ | `invitation-mail-policy.ts:65-75`. Gerçek HTTP ile iki ardışık POST: ilki `emailSent:true`, ikincisi `recently_sent`. mailpit'e 1 e-posta düştü (§1.3). |
| Kiracı başına 50/gün + alarm | ✔ | `:78-85` sınır `>= 50`. Uyarı `deliverInvitationEmail` içinde, dedupe anahtarı `invitation-mail-daily-limit:<tenantId>`. X3 mutantı (`>=` → `>`) öldü. |
| Reddedilen gönderimin soğumayı bitirmesi kötüye kullanılabilir mi? | **Hayır, pratikte değil.** Ayrıntı §1.2. | `route.ts:253-277`, X4 öldü |
| Eşzamanlı iki POST → tek e-posta | ✔ | Kilit, karar ve SENT satırı aynı transaction'da (`route.ts:113-137`), SMTP ise commit'ten sonra. Canlı testte bariyerle eşzamanlılık zorlandı. HTTP'de de iki paralel curl → `[recently_sent, true]`, mailpit'te o adrese 1 e-posta. X5 (kilit silindi) ve X5b (kilit karardan SONRA) mutantları öldü. |
| Localhost bağlantısı hiçbir zaman e-postaya girmiyor | ✔ (üretimde) | E-postadaki link yalnız `mailBaseUrl`'den kuruluyor (`route.ts:180`). URL `null` ise gönderim yok, `app_url_not_configured` dönüyor ve error alarmı yazılıyor. WHATWG URL `127.1`, `2130706433`, `0x7f.1` gibi yazımları `127.0.0.1`'e normalize ettiği için `startsWith('127.')` bunları yakalıyor. X7 öldü. Kenar durum: Ö-3. |
| Konu satırında kurum adı 80 karakter | ✔ | `invitation-email.ts` kod noktası bazında kesiyor. Gerçek e-postada konu 112 karakter: 80 kurum adı + 32 sabit ek. Başlıkta CRLF yok, çünkü `org` içindeki `[\r\n]+` boşluğa çevriliyor. |
| requireTLS testi (M5 ölüyor mu?) | ✔ **M5 ölüyor.** | X1 (`requireTLS: false`) → 1 failed. İNCELEME-21'de hayatta kalmıştı. |
| `NEXT_PUBLIC_APP_URL` zorunlu yapılmadı: karar doğru mu? | **Doğru.** | `env.ts` bu değeri `safeParse(process.env)` ile çalışma anında okuyor (`:214`). Zorunlu yapılsaydı `next build` (NODE_ENV=production) değişkeni tanımlamayan CI'da düşerdi. Seçilen yol güvenli tarafta kalıyor: değer yoksa e-posta gitmiyor, **error** alarmı yazılıyor ve davet bağlantısı yanıtta dönüyor. Yalnız yanıttaki yedek `process.env.NEXT_PUBLIC_APP_URL \|\| 'http://localhost:3000'` (`route.ts:168`) build sırasında koda gömülür. Bu yalnız yanıttaki bağlantıyı etkiler, e-postayı etkilemez. |

### 1.2 "Reddedilen gönderim soğumayı bitirir": kötüye kullanım analizi
- `invitation.email_failed` satırı yalnız `mailer()` hata fırlattığında yazılıyor. `mailer.ts` bu durumda SMTP'nin reddettiği ya da `rejected` listesine aldığı alıcıyı kastediyor. Yani e-posta **teslim edilmemiştir**. Saldırgan bir hedefe ikinci e-postayı ancak ilki ulaşmadıysa yollayabiliyor. Bu da "10 dakikada bir e-posta" sınırını aşmıyor.
- SENT satırı gönderimden **önce** yazılıyor ve günlük sayaç yalnız SENT satırlarını sayıyor. Bu yüzden her başarısız deneme 50/gün kotasından düşüyor. Reddedilen gönderimi döngüye sokmak günlük sınırı aşmanın yolu değil.
- Kalan tek dar yol: SMTP sunucusu `DATA`'yı kabul eder, ama son `250` yanıtı `socketTimeout` içinde gelmez. O zaman e-posta aslında teslim edilmiştir ama FAILED yazılır ve hemen yeniden gönderim açılır. Saldırgan bunu tetikleyemez: relay bizim, alıcının MX'i bu aşamada devrede değil. Üst sınır yine 50/gün. **Risk kabul edilebilir.**
- Başka bir kaçış yolu da yok: uygulamada `Invitation` satırını silen bir yol bulunmuyor (`grep invitation.delete src` → yalnız bir test dosyası). Bu yüzden "sil, yeniden davet et, yeni id ile soğumayı atla" yapılamıyor.

### 1.3 Kanıt
Kurulum:
- Temiz worktree `2c20324f`, `pnpm install --frozen-lockfile --offline`.
- **Kendi DB'm** `crwfb_inv_1790708862` (fabrika-postgres üzerinde). Sırasıyla `prisma db push`, `db:rls-role`, `apply-migrations.sh` (33 dosya) ve `db:rls` (112 politika) uygulandı. Paylaşılan `fabrika` DB'sine hiçbir şey koşulmadı.

Temel koşu (2 dosya):
```
mailer.test.ts 20/20 ✓ · invitation-mail-limit.live.test.ts 8/8 ✓ (atlanan yok)
Test Files  2 passed (2) · Tests  28 passed (28)
Canlı dosya 3 kez daha: 8 passed (8) ×3
```

Mutantlar (her birinin ardından `git checkout`; bitince `git status` temizdi):
```
X1  requireTLS:false (M5)                   → 1 failed | 27 passed  ÖLDÜ
X2  soğuma 10 dk → 1 dk                     → 28 passed             HAYATTA  (Ö-2)
X3  günlük >= → > (sınırda bir fazla)       → 1 failed | 27 passed  ÖLDÜ
X4  FAILED soğumayı bitirmiyor              → 1 failed | 27 passed  ÖLDÜ
X5  kilit silindi                           → 1 failed | 27 passed  ÖLDÜ
X5b kilit kararın ARDINDAN alınıyor         → × two concurrent invitations… 1 failed | 7 passed  ÖLDÜ
X6  24 sa penceresi → 2 sa                  → 28 passed             HAYATTA  (Ö-2)
X7  127.* loopback serbest                  → 1 failed | 27 passed  ÖLDÜ
X8  recently_sent'te de SENT satırı yaz     → 1 failed | 27 passed  ÖLDÜ
```

Gerçek HTTP akışı:
- Kendi `next dev -p 3125` sunucum ve kendi mailpit'im (`crwfb-mailpit` 12125/18125).
- Giriş NextAuth credentials ile yapıldı: `demo-tenant` kurum sahibi, `pro` plan.
- Koltuk sınırı yüzünden kendi DB'mde `seatsExtra=20` yapıldı. Kurum adı yaklaşık 150 karakterlik bir ada çevrildi.
```
22:10:37 POST victim@  {'success': True, 'emailSent': True,  'reason': None}           link: http://localhost:3125/tr/accept-invite?token=b5fc833b…
22:10:37 POST victim@  {'success': True, 'emailSent': False, 'reason': 'recently_sent'} link: …token=2f6ac9ce…
mailpit total 1
victim@example.test | subj chars 112 | Çok Uzun Kurum Adı … Çok… — FonBridge daveti / invitation
e-postadaki token (b5fc833b…) → sha256 DB'deki tokenHash ile eşleşiyor mu: "mail token artık GEÇERSİZ (rotated)"   ← Ö-1
paralel iki POST race@ → race 1 False recently_sent · race 2 True None → mailpit total 2 (race@, victim@)
AuditEvent: invitation.email_sent|<inv id>|actorId dolu  ×2  (adres yok)
```

### 1.4 Bulgular (kart 1). Hiçbiri bloke etmiyor.
- **Ö-1 (öneri, ürün kararı): `recently_sent` durumunda token yenileniyor, e-postadaki bağlantı ölüyor.**
  - Senaryo: davet eden "Davet Gönder"e iki kez tıklıyor. Davetli ilk e-postadaki bağlantıya tıklıyor ve "geçersiz davet" görüyor. Yeni bağlantı yalnız davet edenin ekranında.
  - HTTP ile kanıtlandı (yukarıda). be-fb bunu Risk 1 ve Açık soru 1 olarak açıkça yazmış, arayüz de uyarıyor.
  - Önerim: `recently_sent` durumunda upsert'i token'sız yap (yalnız `role`/`expires` güncellensin) ve 200 yanıtında `inviteLink` dönmesin. E-postadaki bağlantı böylece geçerli kalır. Bu, kartın "bağlantı yine dönsün" şartını değiştirir. **Patron ya da lider kararı gerekiyor.**
- **Ö-2 (test boşluğu): soğuma ve 24 saat sabitleri sınırda sabitlenmemiş.**
  - X2 (10 dk → 1 dk) ve X6 (24 sa → 2 sa) hayatta kaldı.
  - Testler yalnız "hemen", "11 dk", "1 sa" ve "25 sa" noktalarını deniyor.
  - Önerilen iki test: 9 dakika önceki SENT satırıyla hâlâ `recently_sent` dönmeli; 23 saat önceki 50 satırla hâlâ `daily_limit` dönmeli.
- **Ö-3 (düşük): `localhost.` (sonda nokta) üretimde loopback sayılmıyor.**
  - `new URL('http://localhost./').hostname === 'localhost.'`. Bu değer ne `=== 'localhost'` ne de `endsWith('.localhost')` ile yakalanıyor.
  - `[::ffff:127.0.0.1]` biçimi de (`[::ffff:7f00:1]` olarak normalize ediliyor) yakalanmıyor.
  - Değer operatörün ortam değişkeni, saldırganın kontrolünde değil. Düzeltme için `h.replace(/\.$/, '')` yeterli.
- **Ö-4 (bilgi): yeni `invitation.email_sent` satırları bir kişisel veri işleme kaydı.**
  - Satırlarda `actorId` (davet eden) ve davet id'si var, adres yok.
  - Envanter §2'ye tek satır eklenmesi yeterli. Y-1 ile birlikte yapılabilir.

---

## 2. Kart (2): hukuk paketi 1.5 (`9dff3673`)

Kaynak bulgu listesi `TASK-MUMO3A8GOMJHY-fe-fb.md`. Her madde `9dff3673` / `2c20324f` ağacında kod ve git ile karşılaştırıldı:

| Bulgu | Durum | Kod/git kanıtı |
| --- | --- | --- |
| **B-1** İlkadım "Planı Yükselt" | ✔ kapandı | `ILKADIM-PILOT.md:57` artık "düğme yoktur; 'Pilotta kapalı · kurum paketinde açılır'". Kodla karşılaştırma: `settings/modules/client.tsx:574-576` `plan?.pilot → t('pilotLocked')` (pilotta `upgradeCta` bağlantısı çizilmiyor, yalnız pilot olmayan dalda var), `:314-318` başlıkta `settings/billing` bağlantısı "Planı Değiştir →", `messages/tr.json:603`. `grep "Planı Yükselt" docs/kamu` → 0. |
| **B-2** Sentry | ✔ kapandı | `git grep -il sentry HEAD -- src .env.example package.json` → boş. Envanter §19a `:340` "kaldırıldı (`89eab729`)", §21 `:403` "Alıcı değil", `VERI-YERLESIMI.md:24` "Hiçbir yere". Pakette canlı Sentry iddiası kalmadı. |
| **B-3** §8 madde 6 çelişkisi | ✔ kapandı | `HUKUK:391` ölçütü "kodun `dev`'e düştüğü commit" olarak tek ve açık biçimde yazıyor; 1.3/1.4/1.5 listesi commit'lerle tutarlı. Inngest'in "hâlâ kodda" olduğu HEAD'de doğru: devop-fb'nin Inngest geçişi yalnız çalışma ağacında staged, commit'lenmemiş. |
| **B-4** satır numaraları | ✔ kapandı | `oauth-registration.ts:225` `Organization`, `:228` `orgType: 'SME'`, `:248` `TENANT_OWNER`; `routes.ts:114-115` `settingsModules`. Belgelerdeki bütün atıflar (`HUKUK:92,386,387`, `ILKADIM:59`) eşleşiyor. `tenant.update` listesi de doğru: HEAD'de tam 3 yer var, `profile/actions.ts:40`, `agency/actions.ts:59`, `cobrand-store.ts:113`. |
| **B-5** §11 şema satırları | ✔ `9dff3673`'te doğru | `9dff3673:prisma/schema.prisma` `:1326` provider, `:1328` accessToken, `:1332` refreshToken, yorum `:1328-1331`. **Not (K-1):** `2c20324f` (ondan sonra gelen CreditLedger `grantPeriod`) şemaya 5 satır ekledi. HEAD'de bu satırlar `1333`/`1337`. Paket bu numaraları commit'e bağlamadığı için ilk kod değişikliğinde yeniden kaydı. |
| **B-6** §1 parola cümlesi | ✔ kapandı | `processing-register.md` §1: "parola ile giriş yok, yalnız Google". `grep -i "argon\|bcrypt" src package.json` → boş, `User` modelinde parola kolonu yok, `auth.ts:309-312` Credentials yalnız demo için. |

cs-fb'nin kapsamı genişletmesi, yani `VERI-YERLESIMI.md:22,24`'teki Microsoft ve Sentry satırları da koda uyuyor. Doğru bir karar.

### 2.1 Yeni bulgu
- **Y-1 (orta, envanter; hukukçuya gitmeden önce düzeltilmeli): §2 "Kiracı/ekip üyeliği ve davet", alıcı olarak "Yok — yalnızca iç veritabanı" diyor. Kod ise davetliye e-posta gönderiyor.**
  - `fe9fd31c` (14:38) ile davet e-postası SMTP sağlayıcısından gidiyor. İçinde davetlinin adresi, kurum adı ve giriş token'lı bağlantı var (`route.ts:253`, `invitation-email.ts`).
  - §21'deki SMTP satırı (`:399`) yalnız "§17, §18"e atıf yapıyor.
  - Paketin kendi ölçütü (§8 md. 6, "kod dev'e düştüğü commit ile") ile `fe9fd31c`, 1.4'te §2'ye de işlenmeliydi.
  - Düzeltme: §2 alıcı satırına "SMTP sağlayıcısı (açık, patron belirleyecek), davet e-postası: adres, kurum adı, tek kullanımlık bağlantı" eklenmeli. §21 `:399` atfına "§2" eklenmeli. Aynı fırsatta Ö-4'teki `AuditEvent` gönderim kaydı da §2'ye yazılabilir.
- **K-1 (bilgi):** Paketteki satır numaraları hangi commit'e göre yazıldıysa o commit adıyla verilmeli; örneğin "(satırlar `e68ea1e2`'ye göre)". Aksi halde her kod commit'i yeni bir "B-4/B-5" bulgusu doğuruyor. Bu inceleme sırasında `2c20324f` bunu bir kez daha gösterdi.

---

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUMT3R1WRRM9S-crw-fb.md` (yalnız bu rapor).

## 4. Riskler
- Ö-1 bir ürün kararı olarak açık. Karar verilene kadar yanlışlıkla yapılan çift tıklama davetlinin e-postadaki bağlantısını öldürüyor. Arayüz bunu davet edene söylüyor.
- Y-1 düzeltilmeden hukuk paketi 1.5 dışarı gönderilirse, envanter davet e-postası için alıcıyı yanlış bildirmiş olur.

## 5. Açık sorular
1. Ö-1: `recently_sent` durumunda token yenilenmeli mi, yoksa e-postadaki bağlantı korunmalı mı? (Karar patron ya da liderin.)

## 6. Sonraki adım
- cs-fb: Y-1 (+ Ö-4) için envanter §2 ve §21 düzeltmesi. K-1 için satır numaralarının hangi commit'e ait olduğu yazılmalı.
- be-fb (isteğe bağlı): Ö-2'deki iki sınır testi, Ö-3'te sondaki noktanın temizlenmesi.
- Ö-1 kararına göre be-fb'ye küçük bir kart açılması.

## 7. Temizlik
Şunlar kapatıldı ya da silindi:
- dev sunucum (:3125, dinleyen yok)
- `crwfb-mailpit` konteyneri
- `crwfb_inv_1790708862` DB'si (`drop … with (force)`)
- worktree (`git worktree remove`)

Paylaşılan `fabrika` DB'sine, :3000'e ve onun `.next`'ine, ana ağaçtaki staged ve unstaged dosyalara dokunulmadı.

**Platform beyanı:** mac (Darwin 27, zsh, Docker Desktop, Postgres 16 @5433, Node + pnpm). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. Koddan bakıldığında incelenen yollar platformdan bağımsız: Prisma/SQL (`pg_advisory_xact_lock`), nodemailer TCP/TLS, WHATWG `URL` ayrıştırması, Next rota handler'ı. Süreç öldürme, dosya yolu ya da kabuk kullanımı yok. Kart (2) yalnız belge ↔ kod karşılaştırması, platforma bağlı bir iddia içermiyor.
