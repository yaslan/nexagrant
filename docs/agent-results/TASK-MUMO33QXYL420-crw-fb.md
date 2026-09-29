# TASK-MUMO33QXYL420 — FB İNCELEME-22 · crw-fb

Üç teslimin kanıtlı incelemesi. Kod değiştirilmedi. İnceleme ağacı: ayrık worktree `dev@9fff8c7f` (incelenen commit'lerin hepsini içeriyor) ve spike için `spike/job-queue@d8a3a353`. :3000'e ve onun `.next`'ine dokunulmadı.

| Kart | Karar | Bloke eden |
|---|---|---|
| TASK-MULQLL2T8ZJX4 (devop-fb): token'lar yalnız SHA-256 | **ONAY** | yok (Ö-1 sürüm notu) |
| TASK-MUMAC8JELIZ5H (be-fb): invite_invalid yarışı + M2 | **ONAY** | yok |
| TASK-MUMLFDTNQ53VJ (devop-fb): ADR-0008 graphile-worker | **ONAY** (ÖNERİ statüsüyle) | yok. Ö-1/Ö-2 **B2 kartından önce** kapanmalı |

**Tam vitest (dev@9fff8c7f, `env -u NODE_ENV pnpm exec vitest run`):** `Test Files 1 failed | 213 passed | 2 skipped (216)`, `Tests 2443 passed | 13 skipped (2456)`. 13 atlananın 8'i dış ağ adaptör testleri. Kalan 5'i `tests/double-charge-prevention.test.ts`: bu dosyanın `beforeAll`'u `CreditLedger_tenantId_fkey` hatası veriyor, bu yüzden 5 testi de atlanıyor. Sebep ortamda: paylaşılan `fabrika` DB'sinde `demo-tenant` yok, inceleme sırasında `Tenant` sayısı 0'dı (bkz. G-1). İncelenen üç kartın hiçbiri bu dosyaya ya da seed'e dokunmuyor.

---

## 1) TASK-MULQLL2T8ZJX4: portal ve davet token'ları → SHA-256 (587a50e0, ce2e7432)

### Kanıt
**Migration'ı kendim koştum.** Geçici DB `fb_crw22_tok` açtım, üzerine **eski** şemayı (`587a50e0~1:prisma/schema.prisma`) `db push` ile kurdum. Düz token'lı satırlar ekledim: 64-hex, base64url benzeri, `~` içeren ve NULL token'lı PART_B. Sonra:
```
up#1 exit=0 0 notices      up#2 exit=0 4 notices (IF NOT EXISTS atlamaları)
cols after up: ApplicationPart.magicTokenHash · Invitation.tokenHash      (düz sütun yok)
pa|233aa600…6c4a5c   ← Node sha256('aaaa1111…2222') = 233aa600…6c4a5c
pb|NULL              ← token'sız part NULL kaldı
pc|7c5d175d…ceaed6a  ← Node sha256('Zx-_legacy~token') = 7c5d175d…ceaed6a
i1|99244d1b…b77ac7   ← Node sha256('inv-raw-hex-token-1') = 99244d1b…b77ac7
i2|ee0001f5…4921d21  ← Node sha256('QmFzZTY0dXJsLXRva2Vu_-') = ee0001f5…4921d21
indexes: ApplicationPart_magicTokenHash_key, Invitation_tokenHash_key
satır metninde (row::text LIKE) düz token geçen satır: ApplicationPart 0 · Invitation 0
down#1 exit=0  down#2 exit=0 → magicToken null=YES, token null=NO, değer = hash (başlıktaki "LOSSY" doğru)
down sonrası yeniden up: exit=0, i1 → ca96638b… (= sha256(sha256(raw)), bkz. K-1)
```
**Paylaşılan DB (`fabrika`) SELECT:** `Invitation.token` ve `ApplicationPart.magicToken` sütunları yok (`information_schema` sayımı 0). O anki bütün satırlar `^[0-9a-f]{64}$` biçimindeydi (inv 5/5, part 1/1). Birkaç dakika sonra sayılar 0 ve 9 oldu, çünkü komşu bir vitest aynı DB'de satır açıp siliyordu. Kalıcı kanıt bu yüzden sütunların yokluğu ve geçici DB'deki sonuç.

**Sabit zaman:** `secretTokenMatches` 32+32 baytlık özetleri `timingSafeEqual` ile karşılaştırıyor, uzunluk farkında `false` dönüyor. Arama URL token'ıyla değil `hashSecretToken(token)` ile yapılıyor. DB'nin indeks karşılaştırması token'ın önekiyle ilişkisiz bir değer üzerinde çalışıyor, bu yüzden bayt bayt zamanlama sızıntısı yok.

**Eski bağlantılar:** Postgres `encode(sha256(convert_to(t,'UTF8')),'hex')` her örnekte Node ile birebir aynı. Migration öncesi verilmiş link, sonrasında da aynı satırı buluyor (yazarın :3107'de gördüğü 200 ile tutarlı).

**Testler + mutantlar** (`secret-token`, `m11`, `bearer-token-hash.live`, `pilot-gates`; mutantsız `Tests 28 passed (28)`):
```
M2 uzunluk kontrolü silindi (timingSafeEqual farklı uzunlukta throw)  → 1 failed  ÖLDÜ
M3 davet upsert'ünden select silindi (satır tokenHash'i geri döner)   → 1 failed  ÖLDÜ
M4 issuePartnerPortalLink where'den part:'PART_A' atıldı               → 2 failed  ÖLDÜ
M5 addBudgetLineByToken ham token'la arıyor (hash yerine)            → 2 failed  ÖLDÜ
M1 actions.ts'te secretTokenMatches yeniden kontrolü silindi          → 28 passed HAYATTA (eşdeğer mutant, K-2)
```
Hash'in sızma yolunu da taradım. Başvuru ekranı yalnız `hasPortalLink` alıyor. `getPartBData` ve dışa aktarma rotası `magicTokenHash` döndürmüyor. `/api/invitations` `select` ile satırı süzüyor.

### Bulgular
- **Ö-1 (sürüm notu, bloke etmez):** Belgelenmiş sıra "önce `prisma db push`, sonra `apply-migrations.sh`" (`scripts/apply-migrations.sh:9`, `ci.yml:101-105`). Bu migration dolu bir DB'de **ters sırayı** gerektiriyor. Denedim: eski şemalı, 1 davet satırı olan DB'de yeni şemayla `db push` şu hatayla exit 1 verdi: `Added the required column tokenHash … There are 1 rows in this table, it is not possible to execute this step`. Güvenli tarafta düşüyor. Ama biri `--accept-data-loss` ya da `--force-reset` ile geçerse bütün linkler ölür. Raporda "RELEASE_CHECKLIST'e not önerilir" yazıyor, fakat not eklenmemiş (`grep hash-bearer docs/` yalnız raporu buluyor). Öneri: RELEASE_CHECKLIST §1'e "hash-bearer-tokens.sql mevcut DB'de db push'tan ÖNCE" satırı.
- **K-1:** down → up gidiş-dönüşü linkleri geri getirmiyor, çünkü down sütuna hash koyuyor, up onu yeniden hash'liyor (sha256(sha256)). down zaten "linkler ölür" diyor, yani yeni bir kayıp yok. down başlığına "yeniden up linkleri kurtarmaz" satırı eklenebilir.
- **K-2:** M1'in hayatta kalması beklenen bir sonuç: `findUnique({magicTokenHash: hash(raw)})` eşitliği zaten garanti ediyor. `timingSafeEqual` savunma amaçlı bir fazlalık. Sabit zaman özelliğini sağlayan şey hash'le arama. Kusur değil.
- **Account OAuth 1-3-1 değerlendirmesi: gerekçe sağlam, A'ya katılıyorum.** Doğruladıklarım:
  - `src/**` içinde `access_token/refresh_token/id_token` okuyan tek yer `export-data.ts:88`, o da bu alanları dışarıda bırakıyor.
  - `session: { strategy: "jwt" }` `auth.ts:278`'de.
  - Yerel `Account` 0 satır, `Session` 0 satır.
  - `linkAccount` sarmalayıcısı `auth.ts:223`'te zaten var, yani A'nın kod kısmı küçük.
  - Notta düzeltilmesi gereken iki şey var. (a) Microsoft'u anıyor, ama Microsoft `acc35b07` ile kaldırıldı; bugün yalnız Google var. (b) A kartı `CalendarConnection.accessToken/refreshToken` ile karıştırılmamalı: onlar ayrı ve `assertEnvelopedOrNull` ile zaten korunuyor (`db.ts:11-15`).

---

## 2) TASK-MUMAC8JELIZ5H: yarışı kaybeden kayıt → invite_invalid, M2 testi (555935bc, 84b47b14)

### Kanıt
**Yarışın yeniden üretimi (canlı, `fabrika_app`, gerçek Auth.js handler + sahte sağlayıcı + kod başına trigger):** `tests/oauth-registration.live.test.ts` → `Tests 20 passed (20)`.
```
K-1 race (tr): http://localhost:3000/api/auth/hata?error=Configuration
K-1 race (en): http://localhost:3000/api/auth/hata?error=Configuration
✓ code dies between probe and adapter: choice cookies are spent
✓ K-1: the registration that loses the race gets invite_invalid …
✓ K-1: any other Auth.js error lands on the login card …
```
Raporda 21 test yazıyor, bende 20 çıktı. Aradaki fark: `acc35b07` (Microsoft kaldırıldı) aynı dosyadan bir test sildi.

**İngilizce Auth.js sayfasına düşmediğinin HTTP kanıtı.** :3000 inceleme sırasında bütün `/api/auth/*` isteklerine (`/api/auth/providers` dahil) gövdesiz **500** veriyordu (G-2). Bu yüzden kanıtı aynı HEAD'den kendi izole `next dev -p 3217` sunucumda aldım. Sunucuyu sonra kapattım, cwd'sini kontrol ederek.
```
GET /api/auth/error?error=Configuration  → 302 location: /api/auth/hata?error=Configuration
GET /api/auth/error?error=AdapterError   → 302 location: /api/auth/hata?error=AdapterError
GET /api/auth/hata?error=Configuration   → 302 /tr/giris?error=Configuration
GET /api/auth/hata?error=<script>        → 302 /tr/giris?error=Configuration
GET /api/auth/hata?error=//evil.example  → 302 /tr/giris?error=Configuration   (açık yönlendirme yok)
Cookie: fabrika_registration_refused=en  → 302 /en/kayit?error=invite_invalid + set-cookie …=; Expires=1970 (tek kullanım)
Cookie: …=tr                              → 302 /tr/kayit?error=invite_invalid
Cookie: …=../x                            → 302 /tr/giris?error=Configuration (beyaz liste)
/en/kayit?error=invite_invalid gövdesi: "This invite code is invalid or can no longer be used."
/tr/kayit?error=invite_invalid gövdesi: "Davet kodu geçersiz ya da artık kullanılamıyor."
/tr/giris?error=Configuration gövdesi: "Giriş tamamlanamadı. Lütfen tekrar deneyin" · "server configuration" metni: 0
```
**Adaptörün yazdığı çerez gerçek yanıta ulaşıyor mu?** Next 16.3.4 `app-route/module.js:521-530` route handler'da `cookies()` ile yazılanları (`requestStore.mutableCookies`) handler'ın döndürdüğü Response'a ekliyor. Auth.js'in yönlendirme yanıtı da bu Response. Bunu kaynaktan doğruladım, gerçek Google callback'iyle koşmadım (K-2).

**be-fb'nin Auth.js iddiası doğru.** `@auth/core 0.41.3 lib/init.js:153-164` adaptörün attığı her hatayı `AdapterError` ile sarıyor. Bu yüzden "adaptör invite_invalid'e çevirsin" seçeneği tek başına işe yaramıyor.

**Mutantlar (benim, yazarın 6'sına ek):**
```
MA hata rotası notu yok sayıyor                        → × K-1 race           ÖLDÜ
MH pages.error doğrudan /tr/giris                      → × K-1 race + other   ÖLDÜ
MD not HER adaptör hatasında yazılıyor (yalnız davet değil) → 20 passed        HAYATTA (Ö-1)
```

### Bulgular
- **Ö-1 (test boşluğu, bloke etmez):** Bugünkü kod doğru: not yalnız `InviteCodeRejectedError` dalında yazılıyor. Ama bunu koruyan bir test yok. MD mutantında davetli kayıt sırasında bir DB hatası olursa kullanıcı yanlış mesajı ("davet kodu geçersiz") görür ve testler yine yeşil kalır. Önerilen test: `registerOAuthUserWithInvite` davet dışı bir hata atsın (ör. trigger `RAISE`), ardından `jar.has(REGISTRATION_REFUSAL_COOKIE) === false` ve hata rotası `/tr/giris?error=Configuration` dönsün.
- **K-1:** Not 60 sn yaşıyor. Aynı tarayıcıda bu süre içinde gerçek bir `Configuration` hatası olursa (not hâlâ duruyorsa) yanlış mesaj gösterilebilir. Pratikte ihmal edilebilir, raporun riskler bölümüyle tutarlı.
- **K-2:** Uçtan uca gerçek OAuth callback'i (Google) koşulamadı. Zincirin halkaları ayrı ayrı kanıtlandı: canlı handler testi, Next çerez birleştirme kaynağı, izole sunucuda HTTP zinciri.

---

## 3) TASK-MUMLFDTNQ53VJ: ADR-0008 graphile-worker (9a9aa6ef, spike d8a3a353)

### Envanter ↔ kod (`src/lib/inngest/jobs/*.ts`, `src/app/api/inngest/route.ts`)
10/10 iş route'ta kayıtlı. Her iş için `id`, cron ifadesi, `step.run` sayısı ve adları tabloyla aynı. `retries` hiçbir işte yok. `concurrency: { limit: 1 }` yalnız `agency-monthly-report.ts:25`'te var. `NonRetriableError` yalnız agency'de (`:37`). `inngest.send` kodda hiç geçmiyor. k2 "throw etmez" (`k2-monthly-cordis.ts:33` yorumu ve catch dalları). **Uyumsuzluk bulmadım.**

### Spike'ı kendim tekrarladım (spike dalı, izole DB `fb_crw22_jobq`, mock :18177, raporunkinden sert)
**Kurulum:** 3 instance (A, B, C) aynı DB'de, cron her dakika, mock'un ilk cevabı 503. Ardından hepsini kapattım (12:53:23 → 12:55:03), sonra 2 yeni instance (D, E) açtım.
```
tick 12:51 → C job=1 attempt1 503 FAIL → A job=1 attempt2 DONE   (tekrar deneme BAŞKA instance'ta)
tick 12:52 → C job=2 DONE
tick 12:53 → A job=3 DONE
tick 12:54 (herkes kapalı) → D job=4 DONE  (backfill, fill=2m)
tick 12:55 (açılıştan 3 sn önce) → E job=5 DONE (backfill)
tick 12:56 → D job=6 DONE
mock: 7 çağrı = 6 tik + 1 tekrar deneme · B hiç iş almadı
SystemAlert(jobq-spike): 7 satır, her tik için attempt=1 tek satır (+ 12:51 attempt=2)
_private_known_crontabs last_execution 12:56:00 · _private_jobs kalan 0
```
**Sonuç:** Her tik 5 instance boyunca tam bir kez koştu, kaçan tikler bir kez telafi edildi. Raporun D1/D2 bulgusu yeniden üretildi. graphile-worker 0.18.0 kaynağından kilit süresi `job_expiry interval '4 hours'` (`sql/000001.sql:91`) doğrulandı.

### 1-3-1 gerekçesinin sağlamlığı
Sağlam ve dürüst. pg-boss yalnız okunmuş, bu açıkça yazılmış. İlk taslaktaki yanlış iddia (missed tick) yayından önce düzeltilmiş. Seçim geri alınabilir: kütüphane değişse de §4, §6 ve §7 aynen geçerli. Barındırma kısıtı (Vercel'de worker koşamaz) doğru biçimde patrona taşınmış.

### Bulgular
- **Ö-1 (B2'den önce kapanmalı):** ADR `credits-monthly-grant` için "idempotent olup olmadığı doğrulanmalı" diyor. Koddan doğruladım: **idempotent değil.** `grantCreditsToTenants` her koşuda her kiracı için `tx.creditLedger.create({delta, reason:'monthly_grant'})` yazıyor. `CreditLedger` üzerinde benzersiz kısıt yok (`schema.prisma:480-489`, yalnız `@@index([tenantId, createdAt])`). İş ikinci kez koşarsa (4 saatlik kilit düşünce yeniden koşma, elle tetikleme, ya da Ö-2'deki çift sistem) krediler iki kez verilir. Öneri: ADR §6.2'de bu bir ön koşul olmalı. `refId = 'monthly_grant:<YYYY-MM>'` ve `@@unique([tenantId, reason, refId])` (ya da eşdeğeri) ile `createMany … skipDuplicates`. B2 kartının DoD'sine eklenmeli.
- **Ö-2:** §7'de "her iş Inngest route'undan aynı commit'te çıkarılır, böylece iki sistem aynı işi hiçbir an birlikte koşturmaz" deniyor. Bu yeterli değil. Worker ve Next.js ayrı süreçler, ayrı zamanlarda dağıtılıyor. Ayrıca Inngest bulutu işin tanımını app yeniden senkronlanana kadar tutuyor. Worker yeni crontab'la önce kalkarsa ve Next hâlâ eski sürümdeyse, aynı tik iki kez koşar. Ö-1 ile birleşince sonuç çift kredi. Öneri: dağıtım sırası kuralı (önce Next + Inngest app sync, sonra worker) ya da iş başına ortam bayrağı, ve A/B kartlarına bir kontrol satırı.
- **Ö-3:** `fill` penceresini aşan kaçırılmış tik **sessizce kaybolur**. Aylık işlerde `fill=1d` var: worker ayın 1'inde 1 günden uzun kapalı kalırsa o ay koşmaz. §6.4'teki `job-queue-health` yalnız başarısız ya da kilitli işlere bakıyor. Öneri: health işi `_private_known_crontabs.last_execution`'ı beklenen son tikle karşılaştırsın ve kaçırılmışsa `SystemAlert` yazsın.
- **K-1:** Geri dönüşte `git revert` tek başına yetmez. İşin Inngest'e geri dönmesi için Inngest app senkronu (`PUT /api/inngest` ya da pano) gerekir. §7'ye bir satır eklenebilir.

---

## Genel gözlemler (kartlara ait değil)
- **G-1:** Paylaşılan `fabrika` DB'sinde inceleme sırasında `Tenant` = 0, `Opportunity` = 0 idi (`User` 42, `Topic` 1301). ADR 49 kiracıdan bahsediyor. `pg_stat_user_tables`: Tenant `n_tup_ins 22196 / n_tup_del 22089`, yani testler kiracı açıp siliyor. Seed'lenmiş `demo-tenant` yok, `double-charge-prevention` testi bu yüzden kırmızı. Kimin sildiğini tespit edemedim. Seed sahibine (`pnpm db:seed` ya da eşdeğeri) bildirilmeli.
- **G-2:** :3000 (pid 34537, cwd FONBRIDGE, bana ait değil) inceleme sırasında `/api/auth/*` isteklerinin hepsine gövdesiz 500 döndü. Aynı HEAD izole sunucuda 200/302 veriyor, yani kod kusuru değil, ortam durumu. Sahibi yeniden başlatmalı. Ben dokunmadım.

## Değişen dosyalar
Yalnız bu rapor. Kod değişikliği yok.

## Temizlik
- Geçici DB'ler `fb_crw22_tok`, `fb_crw22_ord`, `fb_crw22_jobq` silindi (`pg_database like 'fb_crw22%'` → 0).
- Kendi `next dev :3217`, mock :18177 ve 5 worker sürecim kapatıldı (port dinleyen 0).
- İki worktree kaldırıldı.
- Mutantlar yalnız ayrık worktree'de uygulandı ve her birinden sonra `git checkout` ile geri alındı.

## Platform beyanı
Yalnız **macOS**'ta doğrulandı: Darwin 27, Node 26.5.0, Postgres 16 `fabrika-postgres` docker, Next 16.3.4 dev.
- **Kart 1 ve 2:** Değişen kod platformdan bağımsız: Node `crypto`, Postgres `sha256()`, Auth.js yapılandırması, Next route handler ve çerez. Dosya yolu, süreç ya da kabuk kullanılmıyor. Linux ve Windows'ta aynı davranış beklenir.
- **Kart 3:** Worker saf Node + `pg`. Linux'ta (üretim hedefi) aynı davranmalı. Windows'ta SIGTERM gönderilemez, yalnız SIGINT (Ctrl+C) ile düzgün kapanır; bu ADR §8 ile tutarlı.
- **Linux ve Windows koşulamadı:** bu makinede yalnız macOS var. Playwright/e2e bu makinede kill-guard nedeniyle koşulamıyor, bu yüzden HTTP kanıtı curl ile alındı.

## Sonraki adım
- devop-fb: Kart 1 Ö-1 (RELEASE_CHECKLIST satırı) ve Kart 3 Ö-1..Ö-3 (ADR metnine eklenecek, B2 DoD'sine idempotency).
- be-fb: Kart 2 Ö-1 testi.
- Patron: ADR-0008 (graphile-worker + barındırma) ve Account 1-3-1 kararları (A önerisine katılıyorum).
- :3000 sahibi ve seed sahibi: G-1 ve G-2.
