# TASK-MUMIIMRN92JDQ — FB İNCELEME-18 (crw-fb)

**İncelenen:** `dev` @ `a8272e2b` (yerel; origin'den 38 commit önde). Ayrık worktree: `/Users/macbook/alan/FONBRIDGE-crw18` (detached, kod değişikliği commit'lenmedi, push yok).
**Kartlar:** TASK-MUM6CYJFKW69I (`375d32f2`), TASK-MUMH6NZ128QZ1 (`f108eaaa`), TASK-MULQMKP4YOM04 (`488313b1` `4630a1a8`), TASK-MUMH6W5I1W9WC (`6e550b68` `a8272e2b`), TASK-MUMH7OISNJ5OV (`6bfae321`).
Yedi commit'in hepsi HEAD'in atası (`git merge-base --is-ancestor` → eksik yok).

## Karar tablosu

| Kart | Ajan | Karar | Bloke eden |
| --- | --- | --- | --- |
| TASK-MUM6CYJFKW69I — Inngest üretim kilidi + .dockerignore | devop-fb | **ONAY** | yok. İNCELEME-16 B-1 kapandı, aynı senaryoyla yeniden koşuldu |
| TASK-MUMH6NZ128QZ1 — uyarı işi sahte başarı | be-fb | **ONAY** | yok. 3 not (N-2a..c) |
| TASK-MULQMKP4YOM04 — PostHog / Sentry | se-fb | **ONAY (koşullu)** | yok, çünkü Sentry varsayılan kapalı. **K-3a `SENTRY_DSN` doldurulmadan önce düzeltilmeli** |
| TASK-MUMH6W5I1W9WC — Modüller sayfası gerçek yetki | fe-fb | **DÜZELTME GEREKLİ** | **B-4a: `pnpm build` dev HEAD'de düşüyor (i18n ratchet)** |
| TASK-MUMH7OISNJ5OV — hukuk soru paketi | cs-fb | **ONAY (küçük ek)** | yok. K-5a: paket PostHog'dan söz etmiyor |

---

## 1. TASK-MUM6CYJFKW69I (devop-fb, `375d32f2`) — ONAY

**Amaç:** İNCELEME-16 B-1'i kapatmak. Sorun, `.env`'de `INNGEST_DEV=1` olan bir üretim derlemesinin imzasız `POST /api/inngest` ile iş koşturmasıydı.

**Kod:** `client.ts` içinde `isDev: INNGEST_BUILT_FOR_PRODUCTION ? false : undefined` var. `env.ts` içindeki `assertInngestDevModeAllowed`, `instrumentation.ts`'ten çağrılıyor ve hata olursa `process.exit(1)` yapıyor. SDK 4.18.1'de `mode` getter'ı `options.isDev` boolean ise env'e hiç bakmıyor (`node_modules/inngest/components/Inngest.js:310`). İmza doğrulaması da `client.mode` üzerinden yapılıyor (`InngestCommHandler.js:807,1030,1443`).

**Derlenmiş çıktıda sabit olduğu doğrulandı.** Derleme sonrası chunk:
```
new a.Inngest({id:"fabrika-app",…,isDev:!n.INNGEST_BUILT_FOR_PRODUCTION&&void 0})
src_lib_env_ts_*.js: assertInngestDevModeAllowed … function(e=c$,t=!0){… if(!ch.has(i)&&(t||"production"===e.NODE_ENV))throw new c_}
```
`t=!0` derleme anında `true` sabiti olarak gömülmüş. Çalışma zamanında verilen `NODE_ENV=test` bu değeri geri açamıyor.

**B-1 senaryosu aynen yeniden koşuldu.** `.env` = `.env.example` (`INNGEST_DEV=1`) → `env -u NODE_ENV pnpm build` → `.next/standalone/.env` içinde `INNGEST_DEV=1` var → kabukta `INNGEST_DEV` yokken `node .next/standalone/server.js`. Betik: scratchpad `b1.sh`, `AUTH_SECRET` sahte bir değer.

| # | Ortam | Sonuç |
| --- | --- | --- |
| s1 | `NODE_ENV=production` (INNGEST_DEV=1 .env'den) | **süreç çıktı, code=1** · `❌ INNGEST_DEV is on in a production server…` |
| s2 | `NODE_ENV=test` (İNCELEME-16'daki atlatma) | **code=1**, aynı mesaj |
| s2b | NODE_ENV verilmedi | **code=1** |
| s5 | `NODE_ENV=test INNGEST_DEV=no` (SDK'nın "URL" yorumuna düşen değer) | **code=1** |
| s3 | `NODE_ENV=production INNGEST_DEV=0`, imza anahtarı yok | GET `{"code":"internal_server_error"}`, imzasız POST **HTTP=500** (cloud kipi, anahtar yok) |
| s6 | `NODE_ENV=test INNGEST_DEV=false`, anahtar yok | POST **HTTP=500** |
| s4 | `NODE_ENV=production INNGEST_DEV=0 INNGEST_SIGNING_KEY=signkey-test-…` | GET `{"message":"Unauthorized"}`, imzasız POST **HTTP=401** |

İNCELEME-16'da imzasız POST 206 `StepRun` dönüyordu. Artık hiçbir kombinasyonda iş koşmuyor. Ret sunucu açılırken oluyor: sunucu hiç istek karşılamadan çıkıyor. Sunucu ayağa kalkarsa da SDK cloud kipinde kalıyor.

**`.dockerignore`, `docker build` bağlamı listelenerek doğrulandı.** Aynı ağaca `.env`, `.env.local` ve `.env.production` konup `busybox` ile `COPY . /ctx` yapıldı:
```
---ENV---
-rw-r--r-- 1 root root 9308 … /ctx/.env.example        ← yalnız bu
ls: /ctx/.next: No such file or directory
ls: /ctx/node_modules: No such file or directory
ls: /ctx/.git: No such file or directory
transferring context: 129.30MB   (docs/ 119M: ekran kareleri)
```
Ek kontrol: `.env` yokken, Dockerfile'daki gibi `NODE_ENV=production pnpm build` → **exit=0**, `.next/standalone/.env` yok. Yani `.env`'in bağlamdan çıkarılması imaj derlemesini bozmuyor.

**Notlar (bloke etmez):**
- N-1a: `docker-compose.yml` `fabrika-web` servisine yalnız `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET` ve `NEXTAUTH_URL` veriyor. Daha önce Google OAuth, Resend ve Inngest anahtarları imaja sızan `.env`'den geliyordu, artık gelmiyor. Compose uygulamasında Google girişi ve `/api/inngest` (500) çalışmaz. Bu doğru davranış, ama README'de "compose app için gerekli env" satırı yok.
- N-1b: `tests/inngest-dev-mode.test.ts` SDK'yı kendi `new Inngest({isDev:false})` nesnesiyle deniyor. `client.ts`'in bu seçeneği gerçekten verdiğini test etmiyor. Bunu yukarıdaki chunk ve s1–s6 kapatıyor. Kalıcı bir test istenirse `inngest.mode` doğrudan assert edilebilir.

---

## 2. TASK-MUMH6NZ128QZ1 (be-fb, `f108eaaa`) — ONAY

- **Resend yokken:** `resendMailer()` null dönüyor. `sendSavedSearchAlerts` bu durumda `emailsFailed++` yapıyor, sebep olarak `no_mail_provider` yazıyor ve `continue` ile `touchLastRun`'a hiç ulaşmıyor (`alerts-daily.ts:205-209`). `alertsRunReport` → `success: emailsFailed === 0` → **false**, `reason:'no_mail_provider'`, SystemAlert `error`.
- **Gönderim reddedilince:** resend 6.25.0 hatayı fırlatmıyor, `{ error }` olarak dönüyor (`ErrorResponse.statusCode: number|null`, `index.d.mts:133`). `resendMailer` bunu `MailSendError('resend:<name>:<status>')` olarak fırlatıyor. Hata `catch`'e düşüyor ve `lastRunAt` değişmiyor. Hata mesajında adres yok.
- **Canlı RLS testi** (yerel Postgres, `.env` ana repodan): `cron-tenant-scope.test.ts` "with no mail provider, nothing is counted sent and lastRunAt stays put" ✓ ve "a send the provider refuses fails that search and keeps its matches" ✓ (`lastRunOf(a) == LONG_AGO`, B ilerledi). `alerts-daily.test.ts` + `cron-tenant-scope.test.ts`: **20/20 passed** (verbose, atlama yok).
- **Diğer e-posta yolları:** `src` altında `emails.send` / `new Resend` kullanan yalnız üç yer var:
  - feedback digest: ortak `resendMailer` kullanıyor. `failed` → `success:false`.
  - `request-deletion.ts`: `{ error }` artık okunuyor.
  - `alerts-daily`.

  `m4-weekly-summary` e-posta göndermiyor (TODO). `agency-monthly-report` bilerek e-posta göndermiyor. Aynı desen başka yerde açık değil.

**Notlar (bloke etmez):**
- N-2a: `success:false` yalnız işin çıktısında görünüyor. Inngest koşusu yine "Completed" olarak kapanıyor, dashboard'da yeşil görünür ve yeniden deneme olmaz. Alarm SystemAlert `error` ile zaten veriliyor, bu yeterli. Dashboard da kırmızı olsun istenirse son adımda fırlatmak (ya da `NonRetriableError`) gerekir.
- N-2b: Digest'te anahtar yokken sonuç `skipped` ve `success:true`. Bu belgelenmiş, bilinçli bir "best effort" tercihi. İç özet olduğu için veri kaybı yok, ama o haftanın özeti hiç gitmez.
- N-2c: `request-deletion` reddedilen bildirimi yalnız `console.warn` ile logluyor. Kullanıcı arayüzde onay gördüğü için kabul edilebilir.

---

## 3. TASK-MULQMKP4YOM04 (se-fb, `488313b1` `4630a1a8`) — ONAY (koşullu)

**Anahtar yokken kapalı mı? Evet.** `posthogConfig()` anahtar boşsa null dönüyor, `track` sessizce çıkıyor. `isSentryEnabled()` DSN yoksa false dönüyor, `recordAlert` iletmeye hiç girmiyor. Birim testleri: 7/7 + 14/14.

**Onaysız olay gidiyor mu? Hayır.** Kanıt gerçek tarayıcıdan. Anahtar derlemeye gömülü bir üretim derlemesi alındı (`NEXT_PUBLIC_POSTHOG_KEY=phc_crw18_fake`, host `http://127.0.0.1:47812`, chunk'ta sabit olduğu görüldü). Standalone sunucu `:3918`'de çalıştı. Chromium headless 1243 ile hazırlık testi baştan sona dolduruldu (15 soru → "Sonucu gör" → "Ücretsiz hesap aç"). Yerel bir yakalama sunucusu gelen her isteğin başlığını ve gövdesini yazdı.

| Senaryo | Dış istek | anonId | Not |
| --- | --- | --- | --- |
| A — bant yanıtsız (bant modal olduğu için DOM'dan kaldırıldı, akış sonuna kadar yürütüldü) | **0** | `null` | 3 `track` çağrısı tetiklendi, hiçbiri gitmedi |
| B — "Gerekli Çerezler" | **0** | `null` | consent `{"accepted":false,"level":"essential"}` |
| C — "Tümünü Kabul Et" | **3 POST + 1 OPTIONS** | `23973186-…` | aşağıda |

**Kişisel veri taraması: C senaryosunda yakalama sunucusunun aldığı gövdelerin tamamı.**
```
{"api_key":"phc_crw18_fake","event":"readiness_started","distinct_id":"23973186-…","timestamp":"…","properties":{"orgType":"municipality","$lib":"fonbridge-web","$process_person_profile":false,"$geoip_disable":true}}
{"api_key":"phc_crw18_fake","event":"readiness_completed",…,"properties":{"orgType":"municipality","total":0,"level":"baslangic",…}}
{"api_key":"phc_crw18_fake","event":"readiness_signup_clicked",…,"properties":{"orgType":"municipality","level":"baslangic",…}}
headers: origin "http://localhost:3918", referer "http://localhost:3918/" (yalnız origin), cookie null
```
Sonuç sayfasının adresi `…/fon-hazirlik?kurum=municipality&cevap=000000000000000`, kayıt bağlantısı `…/kayit?kaynak=fon-hazirlik&karne=municipality.…`. İkisi de **gövdeye ya da Referer'a girmedi**: tarayıcının varsayılan `strict-origin-when-cross-origin` politikası yalnız origin gönderiyor, uygulama da bu politikayı değiştirmiyor (`next.config.ts`'de Referrer-Policy/CSP yok). Gövdelerde e-posta, ad, kurum adı, il ve token yok. `src` içinde üç `analytics.track` çağrısı var ve üçü de yalnız `orgType`, `total` ve `level` gönderiyor.

**Sentry'ye giden hatalarda kişisel veri var mı? Olabilir → K-3a.**
- **K-3a (DSN açılmadan önce düzeltilmeli):** `buildSentryEvent` mesajı yalnız `scrubText` ile temizliyor, bu da **yalnız e-postayı** maskeliyor. Oysa `error` seviyesindeki çağrıların birçoğu mesaja `errorMessage(e)` ekliyor: `sso.ts:90,166`, `alerts-daily.ts:306`, `cordis-delta.ts:329`, `stripe-event-cleanup.ts:48`, `k2-monthly-cordis.ts:65`. Prisma doğrulama hatası mesajı sorgu argümanlarını **değerleriyle** taşır. Denendi (salt-okunur `findFirst`, çıktı doğrudan `buildSentryEvent`'ten):
  ```
  --- PrismaClientValidationError
  SSO domain lookup failed:
  Invalid `prisma.user.findFirst()` invocation:
  { where: { name: "Ayşe Yılmaz", email: "[email]", bogusField: "TC 12345678901", ~~~~
  --- PrismaClientKnownRequestError
  … Authentication failed against the database server, the provided database credentials for `fa…
  ```
  Ad ve TC numarası maskelenmeden `message.formatted` alanına giriyor. İkinci örnekte DB kullanıcı adı da görünüyor. §19a'daki "Uyarı mesajları kurala göre kiracı içeriği taşımaz" cümlesi bu yüzden koddan fazlasını vaat ediyor.
  **Öneri:** Sentry'ye `errorMessage(e)`'nin yalnız ilk satırını gönder (Prisma'da `Invalid \`…\` invocation:` satırı), ya da yalnız `source` + sabit şablon + hata sınıfı adı + Prisma `code` gönder. §19a'ya "e-posta dışındaki serbest metin maskelenmez; bu yüzden yalnız ilk satır gider" diye yaz. Sentry bugün kapalı ve DSN patron onayına bağlı, o yüzden **bloke etmiyor**, ama DSN'den önce yapılması şart.
- K-3b (belge, küçük): `VERI-YERLESIMI.md` K6 satırı hâlâ `src/lib/analytics.ts:5,11`'i gösteriyor. Bu satır numaraları eski stub'a ait, dosya yeniden yazıldı.

**Envanter §19a / §21 / §22 ↔ kod:** Açılma koşulu, gönderilen ve gönderilmeyen alanlar, `$process_person_profile:false`, `$geoip_disable:true`, EU varsayılan host, "yalnız yeni `error` satırı" ve 2 sn zaman aşımı kodla birebir tutuyor. Yalnız yukarıdaki "kiracı içeriği taşımaz" cümlesi fazla. se-fb'nin açık bıraktığı R-3 (çerez onayını geri alma yolu yok) doğru; anahtar açılmadan önce yapılmalı.

---

## 4. TASK-MUMH6W5I1W9WC (fe-fb, `6e550b68` `a8272e2b`) — DÜZELTME GEREKLİ

### B-4a (bloke eden): `pnpm build` dev HEAD'de i18n kapısında düşüyor
```
$ env -u NODE_ENV pnpm build
❌ More hard-coded text than the baseline allows (1):
   - src/app/[locale]/(app)/[workspace]/settings/modules/client.tsx  24 → 25  (+1)
❌ i18n check FAILED … Build error occurred  → exit=1
```
Kapıyı hangi commit'in bozduğunu bulmak için `scripts/i18n-check.ts` yalnız `client.tsx` değiştirilerek üç sürümde koşuldu:
- `6e550b68~1` sürümü → exit=0
- `6e550b68` sürümü → exit=1 (24→25)
- HEAD (`a8272e2b`) → exit=1 (25)

Kapıyı `6e550b68` açıyor. Bu kontrol `.github/workflows/i18n-check.yml`'de de çalışıyor, dolayısıyla CI da kırmızı olur. fe-fb raporu "tsc=0, lint=0, vitest geçti" diyor ama `pnpm build` ve i18n kapısından söz etmiyor. Bu kapı `next.config.ts` üzerinden **her üretim derlemesini** durduruyor. Dev'e bağlı bütün derlemeler (Docker imajı dahil) şu an kırık.
**Düzeltme:** Yeni sabit metinleri (`Aboneliğiniz yok · ücretsiz paket`, `Okunamadı`, `Son gün: … · yenilenmez`, `Pilot`/`Pilot bitti`, salt-okunur uyarı metinleri, `Plan dışında açık kalmış — kullanılamaz`, `Kapat`) `messages/tr.json` + `en.json`'a taşı. Ratchet kuralı dosyanın literal sayısının artmasına izin vermiyor. Baseline'ı yükseltmek kuralın amacına ters düşer.

(Kart 1 ve 3'ün derleme kanıtı için bu satırın baseline'ını **yalnız ayrık worktree'de, commit'lemeden** 25'e çektim, sonra `git checkout` ile geri aldım.)

### Kod incelemesi (B-4a dışında sağlam)
- **`'pro'` fallback'i gitti mi? Evet.** `actions.ts` ve `page.tsx` ikisi de `readModulesPlanView` üzerinden okuyor, bu yüzden yetki ve eylem **tek kaynaktan** geliyor. Plan kimliği kuralı (`TRIALING`/`ACTIVE` → `resolvePlanId`, yoksa `free`) `billing.ts:101-104` ile birebir aynı. `canEnableEntitled`, `getEntitlements().allowedModules`'ı kullanıyor, bu da `checkModuleAccess` (`access.ts:87-108`) ile aynı cevap.
- **Canlı DB testi:** `settings-modules-plan.test.ts` 4/4 ✓ (none / pilot / expired pilot yazmayı reddediyor / pro).
- **"Kapat" düğmesi (a8272e2b):** `toggleModuleState(id,'OFF')` çağırıyor. Başarılı olursa bilgi toast'ı gösteriyor, hata olursa hata toast'ı gösterip değişikliği geri alıyor (`client.tsx:206-217`). Pilot bittiyse düğme istemcide devre dışı. Sunucu tarafında da `requireTenantAction()` → `assertTenantWritable` (`tenant.ts:100-102`) yazmayı reddediyor, yani istemci kilidi tek savunma değil. Kapatma kademesi yalnız `activeModules` (açık **ve** plan içi) üzerinden hesaplanıyor. Plan dışındaki bağımlı modüller açık kalıyor, ama kapı onları zaten reddettiği için zararsız.
- **Bilinçli davranış değişikliğinin sonuçları:**
  - `free` = `["M3","M5"]` (katalogdan okundu). Aboneliği olmayan kiracı yalnız M3/M5'i açabiliyor. `'pro'` fallback'iyle daha önce yazılmış `ON` satırları DB'de duruyor. Sayfa bunları "plan dışında açık" olarak gösteriyor ve Kapat sunuyor. Modül kapısı bu satırları zaten reddediyordu, yani kullanıcıdan alınan gerçek bir erişim yok. Değişen yalnız ekranın dürüstlüğü.
  - Pilot kiracı (Belediye Ekip → `pro` tabanı) açılışta **0/11 aktif** görüyor (`sonra-pilot.png`). Pilot ataması (`pilot.ts`) `ModuleState` satırı açmıyor, sahip her modülü tek tek etkinleştirmek zorunda. Bu önceden de böyleydi. Ancak pilotun ilk izleniminde "hiçbir modül açık değil" görünüyor; pilot kurulum rehberine bir satır eklenmeli (N-4c).

### "Planı Değiştir" / "Planı Yükselt" pilotta çıkmaz mı? → K-4b
Kod olarak izlendi:
- `client.tsx:310-315`: "Planı Değiştir →" koşulsuz gösteriliyor, bağlantı `/settings/billing`'e gidiyor.
- `client.tsx:571-576`: `isPlanLocked` olan her kartta amber renkli **"Planı Yükselt"** CTA'sı var, o da `/settings/billing`'e gidiyor.
- Pilot planı `public-team` (`pilot.ts:42`), tabanı `pro`. `plansGrantingModule` çıktısı: M7, M9, M10 ve M11 yalnız `ultra`'da. Yani pilot sayfasında **dört kartta "Planı Yükselt" CTA'sı** çıkıyor.
- `/settings/billing` pilot sırasında plan gridini, portal düğmesini ve ömür boyu teklifi gizleyip yalnız bilgi kutusu gösteriyor (`BillingClient.tsx:290,401-411`): *"Pilot süresince ödeme ve plan yükseltme kapalıdır. Yıllık paket, pilot sonrasında sözleşmeyle açılır."*

**Sonuç:** Bağlantı kırık değil, kullanıcıyı bir açıklama sayfasına götürüyor. Ödeme 403'üne hiç ulaşılmıyor, çünkü satın alma düğmesi render edilmiyor. Ama dört kartta ve başlıkta **yapılamayan bir eylemi vaat eden CTA** var. Kullanıcı "Planı Yükselt"e basıyor ve "yükseltme kapalı" yazısını okuyor. Bu **K (UX), bloke etmez.** Öneri: `plan.pilot` varken kartta CTA yerine "Pilotta kapalı · Kurum paketinde" etiketi göster, başlıktaki bağlantının metnini "Plan bilgisi →" yap.

**"Patron yanıtladı" iddiası:** Liderin kanalından doğrulanamadığı bildirildi, ben de doğrulayamadım. Kod açısından iki karar (Kapat eklensin; Planı Değiştir kalsın) tutarlı ve zararsız uygulanmış. "Kalsın" kararı yalnız başlıktaki bağlantıyı kapsıyor; kartlardaki "Planı Yükselt" CTA'ları kararın kapsamında değil. K-4b bu yüzden karardan bağımsız olarak geçerli.

---

## 5. TASK-MUMH7OISNJ5OV (cs-fb, `6bfae321`) — ONAY (küçük ek)

Paketteki teknik iddialar tek tek koda karşı kontrol edildi (dev HEAD). Doğru çıkanlar:
- `oauth-registration.ts:228` `name: \`${input.userName || 'My'} Organization\``, `:231` `orgType: 'SME'` (858c139a'da ve HEAD'de aynı satırlar).
- `tenant.update` yazan yerler yalnız şunlar: il (`settings/profile/actions.ts:39`), `kind` (`agency/actions.ts:59`), ortak marka (`cobrand-store.ts:113`), SSO (`sso.ts:80`). Ad ya da tür değiştiren ekran yok.
- `agency-monthly-report.ts:26` `cron: '0 6 1 * *'`. "No e-mail" başlıkta yazılı. Rapor saklama biçimi `AuditEvent`; `src`'de `auditEvent.delete*` yok, yani "süresiz" iddiası doğru.
- `funnel.ts:61` `SMALL_CELL_THRESHOLD = 5`, `:168` `roundToFive`, `:185` `NO_PROVINCE`, `:269` `suppressedCells`, `:359` `buildAgencyFunnel`, `:455` `agency_funnel_counts_by_province(NULL::timestamp)`. `report.ts` başlığında "bütün sayıları gizli il rapora yazılmaz" yazıyor. `ci.yml` "Test → `pnpm test`" adımı var (satır ~116).
- Ajans testleri: funnel + attack + report + codes → **70/70** (cs-fb'nin 64'ü farklı bir dosya kümesinden: province yerine codes).
- Çerezler: `registration-province-cookie.ts` / `registration-readiness-cookie.ts` → `httpOnly`, `MAX_AGE_SECONDS = 15*60`. Tek kullanım: `auth.ts:126-135` `clearRegistrationChoiceCookies`.
- Metinler: `Auth.agencyInvite.sees` / `notSees`, `provinceHint`, `readinessImportHint` / `…NoCode` pakette birebir alıntılanmış. `legal` ad alanında "ajans", "kalkınma", "karne" ve "hazırlık" sözcükleri 0 kez geçiyor.
- Karne kutusu `useState(false)` (`AuthCard.tsx:129`). Kutu `{readiness && …}` ile `isRegistering` bloğu içinde gösteriliyor, davet kodu şartı yok, yani "kodlu ya da kodsuz her kayıtta" iddiası doğru.
- Reddedilen kod denetim satırı `jsonb_build_object('reason', reason, 'codeId', code_id)` (`fix-agency-invite-rejection-audit.sql:62-64`). Aktör ya da IP yok.
- Giriş: Google zorunlu. Entra yalnız iki anahtar birden varsa açılıyor. Credentials yalnız demo bayrağıyla açılıyor.

**K-5a (hukukçuya gitmeden önce bir cümle eklenmeli):** Paket, "her teknik iddia `858c139a`'da kontrol edildi" diyor. Ama PostHog (`488313b1`) bu commit'ten **sonra** ve paket commit'inden (`6bfae321`) **önce** girdi. Paket PostHog'dan hiç söz etmiyor. §3.3 madde 1'deki *"Kayıt olmadan doldurulan karne hiçbir yere kaydedilmez"* cümlesi bugün doğru, çünkü anahtar yok. Ancak kod, anahtar girildiği ve çerez onayı verildiği anda karnenin **kurum türünü, puanını ve seviyesini** tarayıcı başına kalıcı bir anonim kimlikle PostHog'a gönderiyor (bkz. §3 gövdeleri). Bu HUKUK-12 bağlamında hukukçunun bilmesi gereken bir işleme. Öneri: §3.3'e "PostHog anahtarı girilirse ve ziyaretçi analitik çerezlerine onay verirse karne tamamlama olayı (tür, puan, seviye; cevaplar ve il yok) anonim olarak PostHog AB'ye gider (§19a)" satırını ekle. §5'teki alıcılar sorusuna da PostHog'u ekle.

---

## Kapı çıktıları (ayrık worktree, `a8272e2b`)
- `env -u NODE_ENV pnpm build` (`.env` = example): **exit=1**, i18n (B-4a). Yalnız worktree'de baseline 25 → **exit=0**. `.env`'siz, `NODE_ENV=production` → **exit=0**. PostHog anahtarlı → **exit=0**.
- `npx tsc --noEmit` → **0**
- Hedefli vitest (ana `.env` ile canlı DB): alerts + cron-tenant-scope **20/20**; inngest-dev-mode + posthog + sentry + modules-plan + email **36/36**; ajans **70/70**.
- **Tam kapı:**
  - `pnpm test` → `Test Files 2 failed | 207 passed | 2 skipped (211)` · `Tests 2 failed | 2400 passed | 8 skipped`. İki kırmızının ikisi de **bu beş kartın dışında**:
    - (a) `invoice-writer.test.ts` "reconstructs the charged amount exactly…": tam paket yükü altında 5 sn zaman aşımına düştü, tek başına koşulunca **geçti**. Kararsız test.
    - (b) `public-sector-assignment.test.ts` seat limit: `The column 'token of relation Invitation' does not exist in the current database`. Yerel DB şeması kaymış. Test dosyasının son değişikliği `2c35e535`; incelenen commit'ler Invitation'a ve şemaya dokunmuyor. Tek başına da kırmızı; ortam sorunu, ayrı kart konusu.
  - `eslint` (dokunulan dizinler: modules settings, analytics, observability, email, inngest, env, instrumentation) → **exit=0**
  - `tsx scripts/i18n-check.ts` → **exit=1** (B-4a, aynı satır)

## Platform beyanı
- **Doğrulandı: yalnız macOS** (Darwin 27.0.0, arm64). Kullanılanlar: Node, Docker Desktop (busybox bağlam listesi), Chromium headless shell 1243, yerel Postgres `fabrika-postgres:5433`.
- **Windows / Linux: koşulamadı**, çünkü bu makinede yoklar. Koddan değerlendirme:
  - Kart 1: `.dockerignore` desenleri Docker'ın kendi eşleştiricisiyle çalışır, host'tan bağımsızdır. Inngest kilidi derleme sabiti olduğu için OS'tan bağımsızdır. Tek ayrıntı `process.exit(1)`: Windows'ta da süreç sonlanır, servis yöneticisinin yeniden başlatma döngüsüne girer ve bu beklenen davranıştır.
  - Kart 3: `fetch`, `localStorage` ve `crypto.randomUUID` bütün tarayıcılarda aynı. `keepalive` + CORS preflight Chromium'da doğrulandı; Firefox ve Safari'de keepalive preflight desteği sürüme bağlı. Olay kaybı olabilir ama gizlilik tarafı etkilenmez.
  - Kart 2, 4, 5: platforma bağlı kod yolu yok.

## Riskler / açık sorular
- B-4a düzelmeden dev'den hiçbir üretim derlemesi çıkmaz. 1 Ekim push kuralından önce kapanmalı.
- K-3a, `SENTRY_DSN` patron onayından **önce** kapanmalı. Bu şart processing-register §19a'ya da yazılmalı.
- fe-fb'nin iddia ettiği patron kararları doğrulanamadı; lider teyit etmeli.

- **İnceleme sonu durumu:** Rapor yazılırken `dev`, `178f9ffc`'ye ilerlemişti (8 yeni commit). Bunların hiçbiri `settings/modules`, `i18n-baseline.json`, `observability` ya da hukuk paketine dokunmuyor; B-4a commit'li `dev`'de hâlâ açık. Test (b)'deki `Invitation.token` hatası, sonradan gelen `587a50e0`'ın (token'lar yalnız SHA-256) yerel DB'ye uygulanmamış olmasıyla uyumlu. Paylaşımlı çalışma ağacında **commit'lenmemiş** bir i18n değişikliği sürüyor: `settings/modules/client.tsx`, `messages/{tr,en}.json` ve başka ekranlar ` M` durumunda. B-4a'yı bu değişiklik kapatıyor olabilir. Commit'lendiğinde yalnız `pnpm build` + i18n-check yeniden koşulmalı.

## Sonraki adım
- fe-fb: B-4a (metinleri i18n'e taşı, `pnpm build` çıktısını ekle). İsteğe bağlı: K-4b.
- se-fb: K-3a (Sentry mesajında yalnız ilk satır gitsin + §19a cümlesi), K-3b.
- cs-fb: K-5a (PostHog satırı).
- Yeniden inceleme: yalnız B-4a düzeltmesi.

## Temizlik
Kendi başlattığım süreçler (standalone sunucular :3917/:3918, yakalama sunucusu :47812, Playwright) kapatıldı. `crw18-ctx` imajı kaldırıldı. Worktree `/Users/macbook/alan/FONBRIDGE-crw18` kaldırıldı.
