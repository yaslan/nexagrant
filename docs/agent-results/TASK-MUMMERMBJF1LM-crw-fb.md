# TASK-MUMMERMBJF1LM — FB İNCELEME-21 (crw-fb)

**İncelenen aralık:** dev @ `a9e6c4ac` (89eab729 Sentry, fe9fd31c SMTP, acc35b07 Entra, e46d9798 M1 OOM). İnceleme sırasında dev'e gelen `15313bc6`/`4dc067ef`/`c3b58fc1` (Outlook kaldırma, TASK-MUMMIHYY2F4KB) kapsam DIŞI.
**Kod değiştirilmedi.** Tüm koşular izole worktree'de (`scratchpad/wt`, detached @ a9e6c4ac) yapıldı. Worktree, kendi DB'm (`crwfb_k2`), kendi mailpit'im (`crw-fb-mailpit`, 12025/18125) ve kendi `next start`'ım (:3111) iş sonunda kaldırıldı. `:3000` ve onun `.next`'i ile ana ağaçtaki commit'lenmemiş dosyalara dokunulmadı.
**Platform beyanı:** mac (Darwin 27, Docker Desktop, Postgres 16 @5433). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız mac var. İncelenen kod yollarında süreç öldürme, dosya yolu ya da kabuk bağımlılığı yok: nodemailer TCP/TLS kullanıyor, geri kalanı Prisma/SQL ve React. `/usr/bin/time -l` ölçümü mac'e özgü; Linux karşılığı `/usr/bin/time -v`.

## Karar özeti

| Kart | Commit | Karar |
|---|---|---|
| TASK-MUMLEUIQWSI59 Sentry kaldırma | 89eab729 | **ONAY** (K-1, K-2) |
| TASK-MUMLF57HOYFSB Resend → SMTP | fe9fd31c | **DÜZELTME GEREKLİ**: B-1 üretimde `SMTP_HOST` girilmeden önce kapanmalı (Ö-1..Ö-3, K-3, K-4) |
| TASK-MUMLFLB2OPLY3 Entra kaldırma | acc35b07 | **ONAY** (K-5, K-6) |
| TASK-MUMJ7W0GUI6N1 M1 profil OOM | e46d9798 | **ONAY** (Ö-4, Ö-5, K-7..K-9) |

Bloke eden tek bulgu **B-1**. O da kodun bugünkü hâlini değil, üretime SMTP anahtarı girildiği anı bloke ediyor.

---

## 1) Temiz worktree kapıları @ a9e6c4ac

```
pnpm install --frozen-lockfile --offline → Done in 6.2s
node_modules/resend → yok · node_modules/@sentry → yok · node_modules/nodemailer → var
pnpm typecheck → tc=0
pnpm lint      → lint=0
pnpm vitest run (.env ile) → Test Files 216 passed | 2 skipped (218) · Tests 2472 passed | 8 skipped (2480) · vt=0
pnpm i18n:check → ✅ i18n check passed … (0)
pnpm build      → build=0
```
- Skipped sayısı **8**, öncekiyle aynı.
- `.env` olmadan ilk koşu `39 failed` verdi. Hepsi `Authentication failed … credentials for 'fabrika'`: worktree'de `.env` yoktu, yani ortam hatası. Ana ağacın `.env`'i değeri basılmadan kopyalandı ve koşu yeşile döndü.
- **"Cannot find package 'resend'" kök nedeni:** paylaşımlı ağaçta `node_modules/.modules.yaml` 14:32'de yazılmış, yani `pnpm install` resend'i o saatte kaldırmış. İmportları silen `fe9fd31c` ise 14:38'de geldi. Arada HEAD'deki kod resend import ederken paket yoktu. Geçici bir paralel-teslim penceresiydi. Temiz HEAD'de `grep resend` yalnız yorum satırlarında geçiyor (`mailer.ts:6`, `saved-searches/route.ts:20`, `digest.ts:4`, `saved-search-filters.ts:8`). **Kalıcı sorun yok.**

## 2) Sentry kaldırma — 89eab729 → ONAY

**Kanıt**
```
grep -rniI sentry src package.json .env.example next.config.ts → (boş)
pnpm vitest run tests/system-alert.live.test.ts → Tests 1 passed (1)
```
Mutantları kendim tekrarladım. Her mutant yalnız worktree'de yapıldı ve ardından geri alındı:
```
M-a recordAlert'e error satırından sonra fetch() eklendi
   → AssertionError: expected "fetch" to not be called at all, but actually been called 1 times  ✔ yakalandı
M-b create'te level 'warn' yazıldı
   → - "level": "error" / + "level": "warn"  ✔ yakalandı
```
Diff incelemesi: `recordAlert` yalnız gönderici bloğunu kaybetmiş, dedupe ve katlama mantığı değişmemiş. `env.ts`'den `SENTRY_DSN` ve `SENTRY_ENVIRONMENT` çıkmış. `scrubErrorText` başka yerde kullanılmıyor, `grep` ile boş.

**Bulgular**
- **K-1 (belge kalıntısı):** `docs/legal/processing-register.md` §19a (satır 336–350) hâlâ "isteğe bağlı Sentry iletimi … `src/lib/observability/sentry.ts`" diyor. `docs/SECURITY_COMPLIANCE.md:102` de "Sentry iletimi koda eklendi" diyor. İki dosya da artık kodla çelişiyor. se-fb bunu Açık sorular'da kendisi işaretlemiş. Düzeltme: cs-fb kartında §19a'nın "kaldırıldı 29.09 (89eab729)" diye kapatılması ve SECURITY_COMPLIANCE.md:102'deki güncellemenin geri alınması.
- **K-2:** Ana ağaçtaki yerel `.env` (izlenmiyor) hâlâ `SENTRY_DSN`, `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_MICROSOFT_ENTRA_ID_*`, `INNGEST_*` satırlarını taşıyor. Kod bunları artık okumuyor, zararsız. Kafa karışmasın diye temizlenmeli (yalnız ad kontrol edildi, değer basılmadı).

## 3) Resend → SMTP — fe9fd31c → DÜZELTME GEREKLİ (B-1)

**Doğru bulunanlar**
- `SMTP_PASS` yalnız env'de. Admin sayfası `smtpSummary()` ile istemciye yalnız host, port, secure, user ve from gönderiyor, parolayı göndermiyor. `sendSmtpTestEmail` fonksiyonunun ilk satırı `requirePlatformAdmin()`.
- **Admin SMTP formunun salt okunur olması doğru.** Ayarın tek kaynağı env. Eski form hiçbir şey kaydetmeden "başarılı" diyordu. Düzenlenebilir form ancak DB'de şifreli bir alanla ve bir öncelik kuralıyla anlamlı olur, bu da ayrı bir kart işi.
- SMTP yokken: `reportMailNotConfigured` her ortamda `console.error` basıyor, üretimde de dedupe'lu `error` SystemAlert yazıyor. Bunu M4 mutantı kanıtlıyor (aşağıda).
- `MailSendError` sunucunun cevap metnini taşımıyor, yalnız kodları taşıyor. Log'a adres yazılmıyor.

**Kendi mailpit'imle gerçek gönderim** (lib düzeyi: `smtpMailer()` + `renderInvitationEmail`. HTTP rotası değil, çünkü oturum gerekiyordu. Rota uçtan uca be-fb raporunda var.)
```
tenantName = 'Evil <script>alert(1)</script>\r\nBcc: victim@example.test'
inviteLink = '…?token=abc"><img src=x>'
SENT plain (no auth) ok
mailpit total 1 · Bcc [] · raw: "From: FonBridge <noreply@fonbridge.test>" "To: crw-probe@example.test" (Bcc başlığı YOK)
HTML: <strong>Evil &lt;script&gt;alert(1)&lt;/script&gt; Bcc: victim@example.test</strong> …
      <a href="…token=abc&quot;&gt;&lt;img src=x&gt;">
AUTH-NO-TLS (auth dolu, STARTTLS sunmayan mailpit) → refused: smtp:ETLS:502 MailSendError; mailpit'e ikinci mesaj düşmedi
```
Başlık enjeksiyonu yok, HTML escape doğru. `requireTLS` parolayı şifresiz bağlantıdan göndermiyor.

**Mutantlar** (4 mutantın 2'si tekrarlandı, bir tane de kendi mutantım eklendi):
```
BASE                                              → Tests 17 passed (17)
M3 rejected kontrolü silindi                      → Tests 1 failed | 16 passed   ✔
M4 üretimde SystemAlert yazılmıyor (return;)      → 2 failed (mailer.test + feedback-digest-run)  ✔
M5 (kendi) requireTLS: false                      → Tests 17 passed (17)  ✘ HAYATTA KALDI
```

**Bulgular**
- **B-1 (güvenlik / kötüye kullanım, üretimde SMTP açılmadan önce kapanmalı): Aynı adrese sınırsız davet e-postası gönderilebiliyor.** `POST /api/invitations` `upsert` yapıyor (`route.ts:93`) ve koltuk sayımı aynı adresi dışarıda bırakıyor (`seat-limit.ts:56`, `NOT: { email }`). Bu yüzden aynı adrese yapılan her POST koltuk sınırına takılmadan yeni bir e-posta gönderiyor. Hız sınırı yok.
  - Kayıt açık, `auth.ts:416` kaydolan herkese kurum açıyor. Dolayısıyla herhangi bir kişi kurum sahibi olabilir, kurum adını istediği metinle doldurabilir ve kurbanın adresine döngüyle POST atabilir.
  - Kurum adı escape'lenmiş olsa da hem Konu satırında hem gövdede görünüyor. Sonuç: şirketin kendi SMTP hesabından ve alan adından sınırsız, içeriği saldırgana ait e-posta çıkar. Gönderici itibarı, SPF/DKIM hizalı bir alan adıyla oltalama ve kara listeye girme riski doğar.
  - be-fb'nin kanıtı bu yolu doğruluyor: "zaten bekleyen bir daveti yeniden gönderdim; aynı adres koltuk saymıyor".
  - Düzeltme önerisi (küçük):
    - `upsert`'in `update` dalında, mevcut davet son N dakikada (ör. 10) güncellendiyse e-postayı atla ve `emailSent: false, reason: 'recently_sent'` dön; bağlantı yine dönsün.
    - Ve/veya kiracı başına günlük davet e-postası üst sınırı koy.
    - Konu satırında kurum adını 80 karakterle kes.
  - Test: aynı adrese art arda iki POST atıldığında ikinci `emailSent` false olmalı.
- **Ö-1 (test boşluğu):** `requireTLS` hiçbir testle sabitlenmemiş, M5 mutantı hayatta kaldı. Davranış canlıda doğru (ETLS kanıtı yukarıda), ama bir refactor bunu sessizce kaldırabilir. `createSmtpTransport` seçeneklerini doğrulayan bir birim testi gerekli: `nodemailer.createTransport`'u spy'la ve auth dolu + `secure:false` → `requireTLS:true` olduğunu kontrol et.
- **Ö-2:** Kimlik bilgisi olmayan ve 465 dışındaki bir relay'de STARTTLS fırsatçı: sunucu sunmazsa davet bağlantısı (token) düz metin gider. Yerel mailpit için bilinçli bir seçim, ama üretimde IP'ye izinli bir relay kullanılırsa token düz metin taşınır. `.env.example`'a "üretimde auth'suz relay kullanılacaksa `SMTP_SECURE=true` ya da relay'de STARTTLS zorunlu" notu eklenmeli, ya da `NODE_ENV=production` iken `requireTLS` her zaman açık olmalı.
- **Ö-3:** Gönderim istek içinde senkron. Ölü bir host'ta davet isteği 10 sn (bağlantı) + 30 sn (soket) bekleyebilir. be-fb bunu risk olarak yazmış, kuyruk kararı TASK-MUMLFDTNQ53VJ'de. Bilgi için.
- **K-3 (önceden vardı, artık e-postaya giriyor):** `inviteLink` `NEXT_PUBLIC_APP_URL` yoksa `http://localhost:3000`'e düşüyor (`route.ts:125`) ve `env.ts:62`'de bu değişken optional. Üretimde bu değişken unutulursa alıcıya localhost bağlantısı gider. Üretimde zorunlu olmalı ya da boşsa gönderim yapılmamalı.
- **K-4:** `README.md:54`, `docs/INNGEST.md` ve `docs/ROADMAP.md` hâlâ `RESEND_API_KEY` diyor. be-fb bunu cs-fb'ye yönlendirmiş. SECURITY_COMPLIANCE.md:102 alt işleyici listesinde de "Resend" duruyor.

## 4) Entra kaldırma — acc35b07 → ONAY

**Kanıt**
```
grep -rniIE "entra|microsoft-entra|azure-ad|AZURE_AD" src tests scripts prisma package.json .env.example messages
  → giriş/sağlayıcı kalıntısı YOK. Kalanlar:
    AuthCard.tsx:156 (yorum: "Microsoft Entra removed"),
    admin/billing/client.tsx:376 <option value="AZURE_AD"> + sso.ts:11 providerType (kiracı SAML/SSO yapılandırması, ADR'de bilinçli kapsam dışı),
    "centrality" (yanlış pozitif)
DB (yerel, DATABASE_URL): SELECT provider, count(*) FROM "Account" → []  ·  yalnız-Entra kullanıcı → 0
```
Canlı giriş ekranı, kendi build'imden alındı. `next start -p 3111`, **sahte `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET` dolu** koşuldu, yani eski anahtarların sağlayıcıyı geri getirmediği de denendi:
```
GET /api/auth/providers → {"google":{…}}   (microsoft-entra-id YOK)
/tr/login butonlar: ['🔑Giriş Yap','🚀Ücretsiz Kayıt Ol','Google ile Devam Et'] · görünür microsoft/entra: 0
/en/login butonlar: ['🔑Sign In','🚀Create Workspace','Continue with Google'] · görünür microsoft/entra: 0
GET /api/auth/signin/microsoft-entra-id → 302 /api/auth/hata?error=Configuration
```
Sayfa kaynağındaki "Entra ID" geçişleri yalnız serileştirilmiş i18n kataloğundaki kiracı SSO metinleri (`tabSso`, `ssoBody`). Buton değiller.
Yan kanıt: sunucu ilk denemede `DEMO_LOGIN_ENABLED=true` ile **başlamayı reddetti**, derleme zamanı kilidi çalışıyor.
ADR-0006 "Güncelleme 2" bölümü eklenmiş: karar, kod, anahtarlar, hesap bağlama, var olan Entra hesapları ve kapsam dışı maddeleri tam.

**Bulgular**
- **K-5 (ürün netliği, patron sorusu):** Admin faturalama ekranında kiracı SSO açılır listesi hâlâ "Microsoft Entra ID (Azure AD)" seçeneğini sunuyor, tr/en SSO metinleri de "Entra ID" diyor. Kod açısından doğru: `sso.ts` yalnız bir SAML yapılandırma kaydı ve giriş sağlayıcısına bağlı değil. Ama "Entra kaldırıldı" kararı sonrasında bu seçenek yanlış bir vaat gibi okunabilir. Patrona tek soru: kiracı SSO listesinde Entra kalsın mı?
- **K-6:** Yerel DB'de `Account` tablosu tamamen boş olduğu için Entra satırı kanıtı sınırlı. Üretimde deploy öncesi `SELECT count(*) FROM "Account" WHERE provider='microsoft-entra-id'` koşulmalı. ADR'ye göre yalnız Entra hesabı olan kullanıcının giriş yolu yok.

## 5) M1 profil OOM — e46d9798 → ONAY

**Gerçek HORIZON, 256 MB heap, boş tablolardan.** devop-fb 256 MB'ı yalnız ikinci (idempotent) koşuda kanıtlamıştı. Ben ilk koşuyu kanıtladım.
- Aynı zip: sha256 `1496a16e…` (4 kopyanın hepsi aynı).
- Kendi DB'm: `crwfb_k2`, `prisma db push`.
- İçe aktarım:
```
scripts/cordis-import.ts --dataset=HORIZON --local-zip=…
✅ Import 194614ms · Projects 23613 · Organizations 35200 · Participations 145909
✅ Profile Job 35200 profiles, 1061382 co-participations in 25696ms
221.22 real · 4840062976 maximum resident set size      ← süreç tepesi (importer dahil)

TRUNCATE "CordisPartnerProfile","CordisCoParticipation" → NODE_OPTIONS=--max-old-space-size=256:
{"success":true,"updatedProfiles":35200,"updatedCoParticipations":1061382,"durationMs":21219,
 "peakHeapMB":150,"peakRssMB":442,"heapLimitMB":352,"db":{"p":35200,"c":1061382}}   exit=0
28.23 real · 441925632 maximum resident set size
```
**Eşitlik testi ve mutantlar** (`tests/cordis-partner-profile.live.test.ts`):
```
BASE                                          → Tests 1 passed (1)
M5 (kendi) topPartners tek yön (<> → >)       → FAIL TESTPP-ORG-001 topPartners: counts [3,3,2,…] vs [4,3,3,2,…]  ✔
M6 (kendi) tie-break DESC'e çevrildi          → Tests 1 passed  ✘ hayatta
M7 (kendi) lastSharedYear COALESCE silindi    → Tests 1 passed  ✘ hayatta
```
SQL incelemesi: `CordisParticipation` PK'si `(projectId, organisationId)` olduğu için `COUNT(*)` çift sayamaz. Her çift yalnız `orgA` sayfasında yazılıyor (`COLLATE "C"`), bu yüzden sayfa sınırında kayıp ya da tekrar yok. Ham INSERT şemadaki bütün NOT NULL kolonları dolduruyor (`topCountries '[]'`, `updatedAt`). `jsonb_to_recordset` parametreli, enjeksiyon yüzeyi yok.

**Soruların cevabı**
- **queryPlanCacheMaxSize kapsamı:** HEAD'de bu ayar **yok**; `grep -rn queryPlanCache src scripts prisma tests` boş dönüyor. `queryPlanCacheMaxSize: 0` yalnız devop-fb'nin tanı amaçlı istemcisinde kullanılmış, commit'lenmemiş. Paylaşılan `prisma` istemcisi (`src/lib/db.ts:78`) ve `createDbClient` varsayılan önbellekle duruyor. Çözüm istemci ayarı değil, sorgu kalıbı: ham SQL'in metni sabit. Yani "tüm istemci" etkilenmedi. Bu doğru bir seçim.
- **Top-20 eşitlik sıralamasının ürün etkisi: bugün görünür etkisi yok.**
  - devop verisine göre 35.200 profilin 19.432'sinde topPartners'ta sınırdaki üyeler değişiyor. Ama:
  - `v1/partners/[pic]` → `partnerLabel` bir `name` alanı istiyor (`route.ts:125-131`), iş ise yalnız `{organisationId,count}` yazıyor. Bu yüzden `topCoAuthors` hep boş kalıyor ve kenar tablosuna düşüyor (bkz. K-8).
  - `/api/cordis/organizations/[id]` ham JSON dönüyor ve src'de onu çağıran bir UI yok.
  - Sonuç: yeni kural (sayı azalan, sonra id artan) deterministik, ki bu eskisinden iyi. Ama "düşük PIC'i kayıran" keyfi bir kural. Ürün isterse `lastSharedYear DESC` daha anlamlı olur. Bu devop'un Açık sorusu, patron kararı.

**Bulgular**
- **Ö-4 (kapsam dışı ama kartın iddiasını sınırlıyor):** `scripts/cordis-import.ts` içe aktarımı ve profil işini **aynı süreçte** koşuyor, bu sürecin tepesi **4.84 GB RSS**. Profil işi tek başına 442 MB'a indi, ama uçtan uca CLI ve `api/admin/cordis/import` yolu küçük bir konteynerde hâlâ OOM riski taşıyor. Kaynak importer (`importer.ts:451/497/539/576/602`): `$transaction` partileri ve her partide farklı `rawJson`, yani aynı plan önbelleği kalıbı. devop §4/§6 bunu "ölçülmedi" diye yazmıştı; artık ölçüldü. Ayrı kart önerisi: importer partilerini `jsonb_to_recordset` kalıbına taşımak.
- **Ö-5 (test boşluğu):** Raporda "bilinçli fark" olarak sunulan tie-break kuralı testle sabitlenmemiş, M6 hayatta kaldı. Eşitlik testi yalnız sayı dizisini ve sınır üstündeki üyeleri karşılaştırıyor. Yeni işin kendi sırasını kontrol eden küçük bir assertion eklenmeli: eşit sayılı üyeler `organisationId COLLATE "C"` artan sırada olmalı.
- **K-7 (test boşluğu):** Tarihsiz projelerde `lastSharedYear`'ın korunması (`COALESCE`) test edilmiyor, M7 hayatta kaldı. Fikstüre tarihsiz ortak projesi olan bir çift eklenmeli.
- **K-8 (önceden vardı, bu commit'in hatası değil):** Şemadaki yorum `topPartners` için `{organisationId, name, country, count}` diyor, iş (eskisi de, yenisi de) `name` ve `country` yazmıyor. Sonuç: `v1/partners/[pic]` `topCoAuthors` profili hiç kullanmıyor. Ya iş bu alanları yazmalı ya da API id'den ad çözmeli. Ayrı kart.
- **K-9 (önceden vardı):** Boş bir DB'de `prisma migrate deploy` `relation "FollowupDoc" does not exist` hatasıyla düşüyor. Migration zinciri sıfırdan kurulamıyor, bu yüzden izole DB'yi `db push` ile kurdum. Temiz ortam ve CI kurulumu için ayrı kart gerekli.

## Değişen dosyalar
- Yalnız bu rapor: `docs/agent-results/TASK-MUMMERMBJF1LM-crw-fb.md`. Kod değişikliği yok.

## Riskler
- B-1 kapanmadan üretim env'ine `SMTP_*` girilirse şirketin SMTP hesabı kötüye kullanıma açık olur.
- Mailpit testi lib düzeyinde yapıldı. Rotanın uçtan uca gönderimi be-fb kanıtına dayanıyor.

## Açık sorular (patron)
1. Kiracı SSO listesinde "Microsoft Entra ID" kalsın mı (K-5)?
2. Top-20 eşitlikte id sırası mı, son ortak yıl mı (§5)?

## Sonraki adım
- **be-fb:** B-1 (yeniden gönderim soğuma süresi ve/veya kiracı başına üst sınır, test ile) ve Ö-1 (requireTLS birim testi). Ö-2 ile K-3 aynı karta eklenebilir.
- **devop-fb:** Ö-5 ve K-7 test eklemeleri. Ö-4 için importer kartı.
- **cs-fb:** K-1 ve K-4 belgeleri (processing-register §19a, SECURITY_COMPLIANCE.md:102, README/INNGEST/ROADMAP'teki RESEND).
- B-1 kapandıktan sonra SMTP kartı için crw-fb yeniden inceleme yapacak.
