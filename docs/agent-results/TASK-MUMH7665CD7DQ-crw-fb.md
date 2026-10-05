# TASK-MUMH7665CD7DQ — FB İNCELEME-17 (crw-fb)

Kod değiştirilmedi, push yok. Test kapıları ayrı bir worktree'de koşuldu: `git worktree add --detach … 858c139a` (dev HEAD). Bu worktree'de `node_modules` ana ağaca symlink'ti, `.env` kopyasıyla çalıştı ve iş bitince kaldırıldı.

Canlı deneme, paylaşılan **:3000**'de (`next dev`, cwd = ana ağaç) ve Docker `fabrika-postgres`'te gerçek tarayıcıyla yapıldı. Tarayıcı Playwright/Chromium headless'tı. :3000'deki ana ağaçta başka ajanların commit'lenmemiş 11 dosyası vardı. Hiçbiri pilot yoluna dokunmuyor: `tenant.ts`, `pilot.ts`, `api/*` ve `m11` yok. Yalnız `settings/modules/actions.ts` değişik, o da `requireTenantAction()` kapısını korumuş.

Board kartının açıklaması okunamadı: `list_tasks` yalnız başlığı döndürüyor. Kapsamı görev metnindeki maddelere göre kurdum.

## Karar tablosu

| Kart | Görev | Ajan | Commit | Karar | Bulgular |
| ---- | ----- | ---- | ------ | ----- | -------- |
| 1 | TASK-MUMABL78X5JLX (ücretsiz 90 gün pilot) | be-fb | `a6b22241`, `f4a5eecc` | **DÜZELTME GEREKLİ** (tek satırlık) | **B-1**, Ö-1…Ö-5 |
| 2 | TASK-MUMAC1VT7DT5Q (giriş hata mesajları) | fe-fb | `d6df7920` | **ONAY** | yok |
| 3 | TASK-MUMABULM5KZX2 (ADR-0007) | cs-fb | `c132327c` | **ONAY, notlu** | K-1, K-2, K-3 (patron kararı gerekli) |

**Bloke eden bulgu: B-1.** Kart şunu soruyor: "Süre dolunca yazma reddi sunucuda her yolda mı?" Cevap **hayır**: bir yol açık. M11 ortak portalında sihirli bağlantı (`/portal/partner/[token]`) süresi dolmuş pilot kiracısına hâlâ yazıyor. Bunu canlıda gösterdim (§2.3 G1).

Bu bulgu **pilotun bugün atanmasını engellemez.** En erken bitiş 27.12.2026 ve atama akışı doğru çalışıyor. Ama kartın "salt-okunur" sözü bu düzeltme olmadan doğru değil, o yüzden kart kapanmadan önce düzeltilmeli.

## 1. Ne yapıldı

**Kart 1: pilot (`a6b22241` + `f4a5eecc`)**
- `pilot.ts`, `tenant.ts`, `subscription-sync.ts`, `checkout/route.ts`, `admin/billing/plans/{actions,pilot-panel}` ve 13 `readOnly` işaretini satır satır okudum.
- **Yazma yolu envanteri çıkardım:**
  - `src/app` altında POST/PUT/PATCH/DELETE dışa aktaran 17 route.
  - `'use server'` dosyalarındaki 34 dosyanın her dışa aktarılan fonksiyonu için kapı, `readOnly` ve DB yazması eşlemesi (python taraması).
  - `/api/v1` (yalnız GET), iyzico ve Stripe webhook'ları, kayıt ve davet kodu akışı.
- **Mutasyon koşusu:** 10 mutasyon denedim. Her biri `git checkout` ile geri alındı.
- **İstanbul sınırı:** `pilotEndsAt` fonksiyonunu farklı sunucu saat dilimleriyle koştum.
- **Canlı uçtan uca deneme (:3000):**
  1. Gerçek kayıt formuyla yeni kiracı açıldı.
  2. Platform yöneticisi gerçek giriş formuyla girdi ve `/tr/admin/billing/plans` panelinden **"Pilot ata"** dedi, sonra ikinci kez tıkladı.
  3. Pilot sürerken yazma denendi. Sonra `trialEndsAt` geçmişe çekildi ve şunlar denendi: API yazmaları, arayüzden bir server action ve ortak portalından token ile yazma.

**Kart 2: giriş hata mesajları (`d6df7920`)**
- Diff'i ve `auth.ts` `pages.signIn` ayarını okudum. `?error=` başka bir yerde okunmuyor (grep).
- Canlı sayfada 5 farklı `?error=` değeriyle, XSS yükü dahil, `role=alert` metnini, DOM'u ve `dialog` olayını kontrol ettim.

**Kart 3: ADR-0007 (`c132327c`)**
- ADR'yi `ILKADIM-PILOT.md`, `BUSINESS_MODEL.md` §5.1, `catalog.ts` ve be-fb raporuyla karşılaştırdım.

## 2. Kanıt

### 2.1 Kapılar (ayrı worktree, `858c139a`)

```
npx tsc --noEmit                                  → tsc exit 0
npx vitest run src/lib/billing/pilot.test.ts src/lib/billing/pilot-gates.test.ts \
     tests/auth-card-signin-errors.test.tsx src/app/api/saved-searches
 Test Files  5 passed (5)
      Tests  39 passed (39)
```

### 2.2 Mutasyon kanıtı (10/10 öldürüldü; `bash mut.sh`, her satırda tek dosya değişti, ardından `git checkout -- src`)

```
M0 baseline [files changed:0] =>                  Tests  15 passed (15)
M1 action gate off [files changed:1] =>           Tests  1 failed | 14 passed (15)
M2 api gate off [files changed:1] =>              Tests  1 failed | 14 passed (15)
M3 boundary <= [files changed:1] =>               Tests  2 failed | 13 passed (15)
M4 idempotency off [files changed:1] =>           Tests  2 failed | 13 passed (15)
M5 stripe sync guard off [files changed:1] =>     Tests  1 failed | 14 passed (15)
M6 stripe cancel guard off [files changed:1] =>   Tests  1 failed | 14 passed (15)
M7 checkout gate off [files changed:1] =>         Tests  1 failed | 14 passed (15)
M8 admin check off [files changed:1] =>           Tests  1 failed | 14 passed (15)
M9 UTC not Istanbul [files changed:1] =>          Tests  5 failed | 10 passed (15)
M10 live-stripe refusal off [files changed:1] =>  Tests  1 failed | 14 passed (15)
```

### 2.3 Canlı pilot (:3000). Kiracı `cmumi0obu002tndxk0l2l4m48`, kullanıcı `crwfb-pilot-mumi0mfa@example.test`

```
A  registered … landed http://localhost:3000/tr/default/dashboard
C1 notice contains "Pilot atandı": true
C2 second click notice: Bu kiracının pilotu zaten sürüyor; süre değişmedi. Uzatmak için kutuyu işaretleyin.
C3 row: TRIALING|pilot|public-team|2026-12-27 21:00:00|2026-12-27 21:00:00
C4 audit: billing.pilot.granted|demo-user-superadmin|2026-12-27T21:00:00.000Z      ← tek satır (idempotent)
D1 saved-search POST (active): 201
D2 checkout (active): 403 {"error":"Checkout closed during the pilot",…"PILOT_CHECKOUT_CLOSED"}
-- trialEndsAt = now() - 1 dk --
E1 saved-search POST (expired): 403 {…"code":"PILOT_EXPIRED","endsAt":"2026-09-29T09:52:29.735Z"}
E2 saved-search PATCH (expired): 403
E3 saved-search DELETE (expired): 403
E4 invitation POST (expired): 403 {"error":"Ücretsiz pilot süresi doldu; …
E5 checkout (expired): 403 … PILOT_CHECKOUT_CLOSED
E6 saved-search GET (expired): 200                                                   ← okuma açık
E7 rows after: savedSearch 1 invitations 0                                           ← ret sonrası yazı yok
F1 province status text: İl kaydedilemedi. Lütfen tekrar deneyin.                   ← server action reddedildi
F2 tenant.province now: ""                                                           ← DB değişmedi
G1 PART_A budget after partner submit (expired pilot):
   [{"partnerName": "Probe Partner", "personMonths": 3, "requestedTotal": 20625, …}] ← B-1: YAZDI
H1 expired band: Pilot süresi doldu. Pilotun son günü 29 Eylül 2026 idi. Verileriniz korunuyor …
```

Kareler `docs/agent-results/TASK-MUMH7665CD7DQ-screenshots/` altında:
- `01-admin-grant.png`: pilot atandı.
- `02-admin-grant-again.png`: ikinci tık, "süre değişmedi".
- `03-expired-server-action-refused.png`: il kaydı reddedildi, amber bant görünüyor.
- `04-expired-partner-token-write.png`: süresi dolmuş kiracıda ortak formu kabul edildi.
- `05-expired-band.png`: süre doldu bandı.
- `06-signin-error-crafted-payload.png`: `?error=<img…>` yalnız genel mesajı gösteriyor.

### 2.4 İstanbul sınırı (sunucu saat dilimi farklıyken)

```
TZ=America/Los_Angeles npx tsx b.ts
2026-09-29T20:59:59Z -> 2026-12-27T21:00:00.000Z last day 27 Aralık 2026   (İst. 29.09 23:59 → 1. gün 29.09)
2026-09-29T21:00:00Z -> 2026-12-28T21:00:00.000Z last day 28 Aralık 2026   (İst. 30.09 00:00 → bir gün sonra)
2026-10-01T00:01:00+03:00 -> 2026-12-29T21:00:00.000Z   2026-10-01T23:59:00+03:00 -> 2026-12-29T21:00:00.000Z (aynı gün)
2026-12-31T23:30:00+03:00 -> 2027-03-30T21:00:00.000Z last day 30 Mart 2027 (yıl geçişi)
TZ=UTC → aynı sonuç
```

29.09 1. gün sayılınca 90. gün 27.12 çıkıyor (29.09 + 89 gün), yani hesap doğru. Sonuç sunucunun `TZ` ayarından bağımsız.

### 2.5 Giriş hata mesajları (canlı :3000, `/tr/giris?error=…`)

```
"OAuthAccountNotLinked"        => alerts: ["Bu e-posta adresiyle başka bir giriş yöntemiyle açılmış bir hesap var. …"]
"<img src=x onerror=alert(1)>" => alerts: ["Giriş tamamlanamadı. Lütfen tekrar deneyin; …"] | payload in DOM: false
"signInError.invite_invalid"   => generic (anahtar enjeksiyonu işlemiyor)
"__proto__"                    => generic
""                             => mesaj yok
dialog fired: false
```

Her durumda görünen boş ikinci `role=alert`, Next'in `__next-route-announcer__` öğesi. Bu değişiklikten gelmiyor.

## 3. Bulgular (önem sırasıyla)

### B-1 (bloke eder, kart kapanmadan): M11 ortak portalı süresi dolmuş pilota yazıyor
- **Yer:** `src/modules/m11/server/actions.ts:526-576`, `addBudgetLineByToken`.
- **Neden:** Oturum yok, token tek kimlik. Bu yüzden `requireTenantAction` kapısından geçmiyor ve `assertTenantWritable` çağrısı yok. be-fb'nin "kapsam dışı" listesinde de (rapor §4) yer almıyor.
- **Senaryo:** Kiracı pilot sürerken bir ortağa `/portal/partner/<token>` bağlantısı verdi. Pilot doldu. Ortak formu gönderince `ApplicationPart.content.budget` satırı yazılıyor ve `revalidatePath` çalışıyor (§2.3 G1, kare 04). Bu durumda "salt-okunur" sözü kiracının dışından çiğneniyor.
- **Önerilen düzeltme:** `part` okunduktan sonra, `readPartContent`'ten önce şu kod eklenmeli:
  ```ts
  try { await assertTenantWritable(part.tenantId); } catch (e) { if (e instanceof PilotExpiredError) return { success: false }; throw e; }
  ```
  `pilot-gates.test.ts`'e de bir test eklenmeli: süresi dolmuş pilotta `addBudgetLineByToken` `success:false` dönmeli ve bütçe boş kalmalı.
- **İsteğe bağlı:** Portal sayfası aynı durumda formu hiç göstermeyebilir. Bu UX işi, kapı değil.

### Ö-1: Reddedilen server action'da yanıltıcı "tekrar deneyin" mesajı
Süre dolunca arayüzdeki action'lar genel hatayı gösteriyor. Örnek (§2.3 F1): "İl kaydedilemedi. Lütfen tekrar deneyin." Kullanıcı tekrar dener ve yine reddedilir. Üstteki bant durumu açıklıyor ve be-fb bunu riskler bölümüne yazmış. Öneri: action'ların `catch` bloğunda `PilotExpiredError` → `pilotExpired` kodu, i18n'de de tek bir "Pilot süresi doldu, düzenleme kapalı" metni. Bloke etmez.

### Ö-2: `grantPilot` eşzamanlı çağrıda satır kilidi almıyor
- **Yer:** `src/lib/billing/pilot.ts:188-243`. `findUnique` ile `upsert` arasında `FOR UPDATE` yok.
- **Senaryo:** İki admin sekmesi aynı anda "uzat" derse ikisi de aynı `state.endsAt`'ten hesaplar. Sonuç +90 gün olur ama iki `billing.pilot.extended` audit satırı yazılır, audit +180 gün gösterir. İki eşzamanlı ilk atamada da iki `granted` satırı çıkar.
- UI düğmesi `pending` iken kapalı (`pilot-panel.tsx:90`), yani tek sekmede çift tık korunuyor. Etki yalnız audit tutarlılığı. Öneri: `tx.$queryRaw\`SELECT 1 FROM "Subscription" WHERE "tenantId"=${tenantId} FOR UPDATE\`` ya da advisory lock.

### Ö-3: iyzico webhook'unda pilot koruması yok
- **Yer:** `src/lib/iyzico.ts:713`. Burada koşulsuz `subscription.upsert` var ve `status: 'ACTIVE', provider: 'iyzico'` yazıyor.
- Stripe tarafı korunmuş, iyzico tarafı değil. **Bugün bu yol erişilemez:** `createIyzicoCheckout` hiçbir route'tan çağrılmıyor (grep: 0 çağıran) ve conversationId'yi yalnız o üretiyor.
- Öneri: iyzico checkout açılacağı gün Stripe'taki `isPilotSubscription` korumasını buraya da ekleyin. Şimdilik not.

### Ö-4: Stripe sync'te pilot kontrolü transaction dışında
`syncStripeSubscription` pilot kontrolünü (`subscription-sync.ts:~371`) upsert transaction'ından önce ayrı bir okumayla yapıyor. İptal yolu ise kontrolü transaction içinde yapıyor. Pencere dar: pilot ataması canlı Stripe aboneliği varken zaten reddediliyor. Yalnız ilk `checkout.session.completed` olayı ile atamanın yarışması durumunda satır ezilebilir. Öneri: kontrolü upsert'in transaction'ına taşıyın. Bloke etmez.

### Ö-5: Sözleşmeli paket ataması pilotun üstüne yazabiliyor
be-fb bunu zaten raporlamış. ADR-0007'ye göre "ücretli geçiş e-Fatura canlı olmadan verilmez", ama kod `assignPlanToTenant` üzerinden bunu engellemiyor, süreç kuralı olarak kalıyor. Öneri: e-Fatura canlı değilken `public-*` atamasında bir onay ya da uyarı adımı. Karar patronun.

### K-1 (ADR-0007): Salt-okunur davranışı karar mı, öneri mi?
- ADR-0007 "Sonuçlar/Ürün": "Süre dolunca kiracı salt-okunur olur". Bu cümle kararın parçası gibi yazılmış.
- be-fb raporu §5-1 ise bunu "patron onayı bekleyen varsayılan" diye sunuyor.
- İkisinden biri düzeltilmeli. Patron onayladıysa be-fb'nin açık sorusu kapanır. Onaylamadıysa ADR'de bu cümle "öneri" diye işaretlenmeli.

### K-2 (ADR/katalog): M6 uyumsuzluğu gerçek
- `catalog.ts`: `public-team` → `basePlanId: 'pro'`, `pro` = `['M1','M2','M3','M4','M5','M6','M8']`. Yani pilot M6'yı açıyor.
- `BUSINESS_MODEL.md` §5.1 Ekip: "+ M1, M4, M8". M6, "Ekip" için €99'luk bir **eklenti**.
- `ILKADIM-PILOT.md:45` M6'yı saymıyor.
- Pilot ücretsiz olduğu için bugün bir zarar yok. Ama pilot sonrası "Belediye Ekip" sözleşmesi M6'yı içeriyor mu? Teklif metni ile ürün arasında fark doğar. Karar patronda: ya dokümanlar M6'yı eklemeli ya da `public-team` kendi modül listesini almalı. Bu kartta kod değişmedi, o yüzden bloke etmez.

### K-3 (ADR-0007 madde 2): Kapsam "yalnız üç yüzey" mi?
cs-fb'nin açık sorusu duruyor. Kodda karne, radar ve davet kodu modül kapısına bağlı değil (be-fb keşif §0-4). Pilot, Ekip'in bütün modüllerini açıyor. ADR'nin 2. maddesi "yalnız bu üçü" diye okunursa kod ile karar çelişir. Patrona sorulmalı. cs-fb bunu raporuna zaten yazmış.

### Kontrol edilip sorun bulunmayanlar
- **Yetki:** Atama yalnız platform yöneticisinde. `requirePlatformAdmin` kontrolü DB'deki bayrağa bakıyor. M8 mutasyonunda test kırmızı oldu. Canlıda aktör `demo-user-superadmin`.
- **İdempotentlik ve audit:** İkinci tıklama `unchanged` döndü, tek audit satırı yazıldı, `actorId`, `endsAt`, `previous*` dolu.
- **Salt-okunur:** 17 yazma route'u, 34 action dosyası ve `pipeline/actions.ts`'deki 8 yazma action'ı tarandı. Server action ve API reddi canlıda görüldü. `readOnly` işaretli 13 action'ın hiçbiri yazmıyor (taramada `RO+W` = 0). Kapsam dışı kalanlar tasarım gereği: KVKK kullanıcı hakları (`src/actions/user/*`), `/api/feedback` (platforma geri bildirim) ve admin yolları.
- **Stripe:** Sync ve iptal pilot satırını ezmiyor, olay claim edilmiyor. M5 ve M6 mutasyonları testlerce yakalandı.
- **Satış yolu:** Tek satış yolu `POST /api/billing/checkout`. Pilot sürerken ve süre dolduktan sonra 403 dönüyor. Portal `providerCustomerId` istiyor, pilotta bu alan null. iyzico checkout'un çağıranı yok.
- **Giriş hata mesajları (Kart 2):** Yalnız izinli liste anahtarları mesaja dönüşüyor, ham kod DOM'a hiç girmiyor. `signInError.x` ve `__proto__` ile anahtar enjeksiyonu işlemiyor. `role=alert` ve `aria-label` doğru. Kapat düğmesinde `type="button"` var, yani form gönderilmiyor.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUMH7665CD7DQ-crw-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUMH7665CD7DQ-screenshots/01…06*.png`

Kaynak kod değişmedi.

## 5. Riskler ve dev DB'de kalanlar
- Dev DB'de bu incelemeden kalan test verisi:
  - Kiracı `cmumi0obu002tndxk0l2l4m48` ("Crwfb-Pilot-Mumi0mfa Kuruluşu"). Pilot satırının `trialEndsAt` değeri geçmişte, yani süresi dolmuş durumda.
  - Bu kiracıda 1 `SavedSearch`, `Opportunity` `crwfb-opp-mumi0mfa` ve `ApplicationPart` `crwfb-part-mumi0mfa` (token'lı, 1 bütçe satırı).
  - Silmedim. B-1 düzeltmesinin canlı yeniden denemesinde aynı kiracı ve token kullanılabilir.
- be-fb'nin kiracısına (`cmumb155l002dndxkpviuw95z`) dokunmadım.

## 6. Açık sorular (patron)
1. K-1: Süre dolunca salt-okunur kalması kesin karar mı?
2. K-2: "Belediye Ekip" M6'yı içeriyor mu?
3. K-3: ADR madde 2'deki kapsam "öne çıkan üç yüzey" mi, yoksa "yalnız bu üçü" mü?

## 7. Sonraki adım
- **be-fb:** B-1'i düzeltsin (tek kapı satırı ve bir test). Ö-1 ve Ö-2 isteğe bağlı.
- **crw-fb:** B-1 düzeltmesini aynı kiracı ve token ile canlıda yeniden denesin. Beklenen: G1'de `budget` tek satırda kalmalı.
- Pilotun İlkadım'a canlıda atanması B-1 düzeltmesini beklemek zorunda değil, çünkü ilk bitiş en erken 27.12.2026.

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, Node 26.5, `next dev` :3000, Docker Postgres, Chromium headless-shell 1243). İncelenen kod sunucu tarafı TS, Prisma ve React. Süreç, dosya yolu ya da kabuk bağımlılığı yok. Tarih hesabı `Intl` ve `Europe/Istanbul` üzerinden yapılıyor. `TZ=America/Los_Angeles` ve `TZ=UTC` ile aynı sonuç alındı (§2.4), bu yüzden Windows ve Linux'ta da aynı davranış beklenir. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var.
