# TASK-MUMO2XIQEHGUD — FB SMTP DÜZELTME (İNCELEME-21 bulguları) · be-fb

**Kaynak:** docs/agent-results/TASK-MUMMERMBJF1LM-crw-fb.md §3 (B-1, Ö-1, Ö-2, K-3)
**Commit'ler (dev):** `1c6b3e70` (düzeltme + testler), `327849c0` (eşzamanlılık testini deterministik yapan bariyer)
**Platform beyanı:** mac (Darwin 27, Docker Desktop, Postgres 16 @5433, system Chrome). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız mac var. Dokunulan kod yollarında platforma bağlı bir şey yok: Prisma/SQL (`pg_advisory_xact_lock`), nodemailer TCP/TLS ve React. Süreç öldürme, dosya yolu ya da kabuk kullanımı yok, bu yüzden diğer platformlarda da aynı davranış beklenir.

## 1) Ne yapıldı

### B-1: davet e-postası kötüye kullanımı
- **Şema değişikliği ve migration yok.** Her gönderim denemesi için mevcut `AuditEvent` tablosuna bir satır yazılıyor:
  - `type='invitation.email_sent'`
  - `target` = davet id'si. **Adres yazılmıyor**, yani kişisel veri yok.
  - `actorId` = daveti gönderen kişi.
  - Tabloda `(tenantId, createdAt)` indeksi ve kiracıya bağlı `tenant_or_shared` RLS politikası zaten var. Yeni tablo ya da politika eklemek gerekmedi.
- Karar ve yazma işlemleri kiracı başına `pg_advisory_xact_lock` altında yapılıyor (`src/lib/email/invitation-mail-policy.ts`). Böylece eşzamanlı iki POST aynı anda "sınırın altında" okuyamıyor.
- **Soğuma süresi:** aynı davete son 10 dakikada gönderim yapıldıysa e-posta atlanıyor. Yanıt `emailSent:false, reason:'recently_sent'` oluyor. Token yine yenileniyor ve bağlantı yine dönüyor.
- **Reddedilen gönderim:** SMTP gönderimi reddederse `invitation.email_failed` satırı yazılıyor. Bu satır soğuma süresini bitiriyor, yani davet eden hemen yeniden deneyebiliyor. Deneme yine de günlük sayaca dahil.
- **Günlük sınır: kiracı başına kayan 24 saatte 50 deneme** (`INVITATION_MAIL_DAILY_LIMIT`).
  - **Gerekçe:** en büyük self-servis plan 15 koltuklu (`catalog.ts`). Hepsini davet edip her birine iki kez yeniden göndermek 45 e-posta eder. Meşru bir kurum bir günde 50'ye yaklaşmaz. Kötüye kullanan biri ise açtığı her kurum için 50 ile sınırlı kalır, sınırsız değil.
  - Sınır aşılınca dedupe'lu `warn` SystemAlert yazılıyor: `invitation-mail-daily-limit:<tenantId>`.
- **Konu satırı:** kurum adı 80 karakterde (üç nokta dahil) kesiliyor (`SUBJECT_ORG_MAX`). Kesim kod noktası bazında yapıldığı için bir surrogate çifti bölünmüyor. Gövde değişmedi, zaten escape'leniyor.
- **Arayüz** (`settings/members/page.tsx`): `recently_sent` ve `daily_limit` için ayrı tr/en mesajlar eklendi. `recently_sent` mesajı, önceki e-postadaki bağlantının artık geçersiz olduğunu da söylüyor.

### Ö-1: requireTLS testi
`createSmtpTransport` için dört yeni birim testi eklendi. `vi.spyOn(nodemailer, 'createTransport')` ile transport'a gerçekten verilen seçenekler okunuyor:
- auth dolu + 587 → `requireTLS:true`
- 465 → `secure:true, requireTLS:false`
- auth yok → `auth` alanı hiç gönderilmiyor
- zaman aşımı değerleri sabitlendi

### Ö-2: `.env.example` uyarısı
Şu uyarı eklendi: "PRODUCTION: kimlik doğrulamasız relay kullanma; STARTTLS fırsatçı, davet token'ı düz metin gidebilir; kaçınılmazsa SMTP_SECURE=true ya da relay'de STARTTLS zorunlu." Aynı yere davetler için `NEXT_PUBLIC_APP_URL` notu da eklendi.

### K-3: localhost bağlantısı e-postaya girmiyor
- `invitationMailBaseUrl()` şu durumlarda `null` dönüyor:
  - `NEXT_PUBLIC_APP_URL` tanımsız ya da boş (her ortamda)
  - URL geçersiz
  - üretimde loopback adres (`localhost`, `*.localhost`, `127.*`, `[::1]`, `0.0.0.0`)
- `null` olunca e-posta **gönderilmiyor** (`reason:'app_url_not_configured'`) ve dedupe'lu `error` SystemAlert yazılıyor (`invitation-mail-app-url-missing`).
- Geliştirmede bilerek ayarlanmış bir localhost adresine izin var (mailpit için).
- `env.ts` zorunlu **yapılmadı**. Sebebi: `next build` NODE_ENV=production ile koşuyor, zorunlu olsaydı değişkeni tanımlamamış CI ve build'ler kırılırdı. Bunun yerine rota düzeyinde "gönderme ve alarm yaz" seçildi.
- Yanıttaki `inviteLink` eski yedek davranışını koruyor. Değişmeyen tek şey bu, e-postaya hiçbir zaman girmiyor.

## 2) Kanıt

### Temiz worktree kapıları (@ 1c6b3e70, `scratchpad/wt`, `pnpm install --frozen-lockfile --offline`)
```
pnpm typecheck  → tc=0
pnpm lint       → lint=0
pnpm i18n:check → ✅ i18n check passed … no file gained hard-coded text.
pnpm build      → build=0   (├ ƒ /api/invitations)
pnpm vitest run → Test Files 1 failed | 214 passed | 2 skipped (217)
                  Tests 2461 passed | 13 skipped (2474)
```
- **Tek kırmızı test benimle ilgisiz, bir ortam sorunu:** `tests/double-charge-prevention.test.ts` `beforeAll` içinde `CreditLedger_tenantId_fkey` hatası veriyor, çünkü paylaşımlı DB'de `demo-tenant` yok (`select count(*) from "Tenant" where id='demo-tenant'` → `0`). Paylaşımlı DB'de şu an 1 kiracı var; devop-fb İNCELEME-24 de "dev DB'de 0 kiracı (B-4)" diye not etmiş. Bu test davet ya da e-posta koduna dokunmuyor. Paylaşımlı DB'yi yeniden seed'lemedim, çünkü başkalarının durumu.
- **Skipped 13 = önceki 8 + bu dosyanın beforeAll hatası yüzünden atlanan 5 testi.** Yeni `invitation-mail-limit.live.test.ts` **atlanmadı**, 8/8 gerçekten koştu.

### Yeni testler
- `src/lib/email/__tests__/mailer.test.ts`: 20 test (17 → 20+; createSmtpTransport ×4, konu satırı kesimi ×2, invitationMailBaseUrl ×4)
- `tests/invitation-mail-limit.live.test.ts`: 8 test. Gerçek rota handler'ı gerçek DB'ye karşı koşuyor, `fabrika_app` (NOBYPASSRLS, assert'li) rolüyle. Kapsam:
  - ardışık iki POST → ikincisi `recently_sent`
  - 11 dakika sonra yeniden gönderim
  - başarısız gönderim soğuma süresini başlatmıyor
  - eşzamanlı iki POST → tek e-posta
  - günlük sınır + alarm
  - 24 saatten eski satırlar sayılmıyor
  - `NEXT_PUBLIC_APP_URL` yok ya da localhost → gönderim yok + alarm
  - konu satırı 80 karakter, gövdede localhost yok
- Kararlılık: bu dosya 5 kez koşuldu, 5'inde de `Tests 8 passed (8)`.

### Mutantlar
Hepsi izole worktree'de yapıldı, her birinin ardından geri alındı.
```
BASE                                                  → Tests 28 passed (28)
M5  (crw-fb) requireTLS: false                        → 1 failed | 19 passed   ✔ (önceden HAYATTA'ydı)
M-A cooldown kontrolü silindi                         → 2 failed | 6 passed    ✔
M-B günlük sınır kontrolü silindi                     → 1 failed | 7 passed    ✔
M-C deneme satırı yazılmıyor                          → 2 failed | 6 passed    ✔
M-D advisory lock silindi                             → × two concurrent invitations to one address send one mail  ✔
M-E failed satırı cooldown'u bitirmiyor               → 1 failed | 7 passed    ✔
M-F 24 saat penceresi silindi                         → 1 failed | 7 passed    ✔
M-G konu kesilmiyor                                   → 2 failed | 26 passed   ✔
M-H K-3: boş URL'de eski localhost fallback           → 2 failed | 26 passed   ✔
M-I üretimde loopback serbest                         → 2 failed | 26 passed   ✔
```
- M-D ilk denemede hayatta kaldı: iki istek zamanda çakışmıyordu. Bunun üzerine `327849c0` ile test transaction'ı `invitation.upsert` öncesinde bir bariyerde bekletildi, iki transaction da oraya gelene kadar ya da 500 ms dolana kadar. Kilit yoksa ikisi de sınırı birlikte geçiyor ve test kırmızıya dönüyor.

### Gerçek HTTP uçtan uca test (mailpit)
Kurulum: izole worktree, kendi DB'm (`befb_inv`, `prisma db push`), kendi mailpit'im (`be-fb-mailpit` 11025/18025) ve `next dev -p 3107`. Giriş demo kimlik bilgisiyle yapıldı. Kurum adı ~155 karakter; `pro` aboneliği ve bekleyen bir `victim@` daveti vardı.
```
session tenant: befb-t1 role: TENANT_OWNER
--- POST 1 (15:57:01) {'success': True, 'emailSent': True,  'reason': None}            link: http://localhost:3107/tr/accept-invite?token=db9…
--- POST 2 (15:57:02) {'success': True, 'emailSent': False, 'reason': 'recently_sent'} link: http://localhost:3107/tr/accept-invite?token=a2c…
--- mailpit total 1
victim@example.test | subject chars: 112 | Çok Uzun Kurum Adı … Çok… — FonBridge daveti / invitation   (80 + 32 sabit ek)
AuditEvent: invitation.email_sent | target befb-inv1 | actorId befb-owner   (adres yok)

49 eski deneme satırı (+1 = 50) → yeni adres: {'success': True, 'emailSent': False, 'reason': 'daily_limit'} · mailpit total 1
SystemAlert: warn|invitations|Tenant reached the daily invitation email limit (50)…|{"tenantId":"befb-t1","alertDedupeKey":"invitation-mail-daily-limit:befb-t1"}
```

### Gerçek tıklama (Playwright + system Chrome, `/tr/default/settings/members`)
Adres alanına yazıldı, "Davet Gönder"e tıklandı:
```
victim@example.test HTTP 200 → UI: "Bu adrese son 10 dakika içinde zaten davet e-postası gönderildi; yeni e-posta gönderilmedi. Önceki e-postadaki bağlantı artık geçersiz, bu bağlantıyı elle iletin: http://localhost:3107/tr/accept-invit…"
third@example.test  HTTP 200 → UI: "Kurumunuzun günlük davet e-postası sınırına ulaşıldı; e-posta gönderilmedi. Bağlantıyı elle iletin: …"
```
Ekran görüntüsü: `scratchpad/members-ui.png` (geçici).

**Temizlik:** dev sunucum (pid 68371 ve çocukları), `be-fb-mailpit` konteyneri, `befb_inv` DB'si ve worktree kaldırıldı; :3107'de dinleyen süreç yok. Paylaşımlı `:3000`, paylaşımlı DB ve ana ağaçtaki commit'lenmemiş dosyalara dokunulmadı.

## 3) Değişen dosyalar
- `src/lib/email/invitation-mail-policy.ts` (yeni): sınırlar, kilit, karar, `invitationMailBaseUrl`
- `src/app/api/invitations/route.ts`: karar transaction içinde, `deliverInvitationEmail` + `reason`
- `src/lib/email/invitation-email.ts`: `SUBJECT_ORG_MAX = 80`
- `src/app/[locale]/(app)/[workspace]/settings/members/page.tsx`: nedene göre mesaj
- `.env.example`: Ö-2 ve K-3 notları
- `src/lib/email/__tests__/mailer.test.ts`, `tests/invitation-mail-limit.live.test.ts` (yeni)
- Belgelere (docs/*) dokunulmadı; cs-fb'nin alanı.

## 4) Riskler
- **`recently_sent` durumunda da token yenileniyor**, çünkü kart "bağlantı yine dönsün" diyor ve ham token saklanmıyor. Sonuç: yanlışlıkla iki kez tıklanırsa 10 dakika önce gönderilen e-postadaki bağlantı ölür. Arayüz bunu açıkça söylüyor ve dönen bağlantı geçerli. Alternatif için Açık soru 1'e bakın.
- **Günlük sınır denemeleri sayıyor, teslimleri değil.** SMTP çökükken yapılan denemeler de sayaca giriyor. Bu bilinçli bir seçim: çökük bir sunucuyu döngüyle zorlamak da sınırlanmalı.
- **Sınır kiracı başına.** Kayıt açık kaldıkça saldırgan birden çok kurum açabilir. Bugün kayıtla açılan kurum `free` planda (1 koltuk). Sahip zaten koltuğu doldurduğu için **ücretsiz kurum hiç davet gönderemiyor** (canlıda gördüm: 403 SEAT_LIMIT_REACHED). Bu yüzden saldırı pratikte ücretli ya da pilot bir kurum gerektiriyor. Buna rağmen kayıt tarafında hız sınırı ayrı bir kart olarak değerlendirilmeli.
- Ö-3 (gönderim istek içinde senkron) kapsam dışı; kuyruk kararı ADR-0008 / TASK-MUMLFDTNQ53VJ'de.
- Paylaşımlı dev DB'de `demo-tenant` yok, bu yüzden `double-charge-prevention.test.ts` kırmızı. Başka bir ajanın temizliği ya da seed durumu; sahibine bildirilmeli.

## 5) Açık sorular
1. `recently_sent` durumunda token hiç yenilenmesin, 429 benzeri bir cevapla bağlantı dönmesin mi? Bu seçenek çift tıklamada e-postadaki bağlantıyı korur, ama kartın "bağlantı yine dönsün" şartıyla çelişir.
2. Günlük sınır olarak 50 uygun mu? Kurumsal `seatsExtra` ile 15'ten büyük kurumlar olursa sınır koltuk sayısına bağlanabilir (ör. `max(50, 3 × koltuk)`).
3. Arayüzde "gönderilmedi" mesajları da yeşil kutuda görünüyor (mevcut stil). İstenirse fe tarafı bunu uyarı rengine çevirebilir.

## 6) Sonraki adım
- crw-fb: B-1 / Ö-1 / Ö-2 / K-3 için SMTP kartını yeniden incelemesi. Bundan sonra üretimde `SMTP_*` girilebilir.
- Kayıt tarafında hız sınırı (kurum açma döngüsü) için ayrı kart önerisi.
- Paylaşımlı DB'deki `demo-tenant` seed'inin sahibine bildirim.
