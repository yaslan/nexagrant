# TASK-MTPZL9GK4TFS1 — iyzico ödeme + entitlement akışının tamamlanması

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi) · **Tip:** feature/entegrasyon · **Sprint:** S10
**Commit:** `5bd921a` — `feat(billing): complete the iyzico payment + entitlement flow`
**Branch:** `dev`

---

## 1. Ne yapıldı

### Önce Stripe deseni okundu (kart: "deseni ORADAN kopyala")

`src/app/api/webhooks/stripe/route.ts` + `src/lib/billing/subscription-sync.ts` okundu. Alınan desen:
imza doğrulaması rotada → sağlayıcıdan **yeniden okuma** (webhook gövdesine güvenme) → `Subscription`
upsert → yeni/yeniden aktivasyonda `CreditLedger` grant → plan düşüşünde `ModuleState = OFF` →
`AuditEvent` (audit + fatura kaydı). iyzico'ya birebir aynı sıra uygulandı.

**Stripe'tan bilinçli olarak kopyalanmayan tek şey idempotency sorgusu.** Stripe tarafında:

```ts
prisma.auditEvent.findFirst({ where: { data: { equals: { stripeEventId: eventId } } } })
```

`equals` **tüm JSON belgesinin** o tek alanlı nesneye eşit olmasını arar; oysa yazılan `data`
`planId`, `status`, `creditsGranted` … da taşıyor. Yani bu koşul hiçbir zaman eşleşmez —
Stripe'ın idempotency kapısı fiilen kapalı. iyzico'da doğru olan JSON-yol filtresi kullanıldı:

```ts
data: { path: ['iyzicoEventId'], equals: eventId }
```

> Stripe'taki bu latent hata bu görevin kapsamı dışında (kart: m6/m9/marketing ve diğer
> ağaçlara dokunma). Riskler bölümünde ayrı bir iş olarak bırakıldı.

### Değişikliğin özeti

| Konu | Önce | Sonra |
|---|---|---|
| Checkout | `checkoutFormContent` içine gömülü sahte `<iframe>`, gerçek çağrı yok | `POST /payment/iyzipos/checkoutform/initialize/auth/ecom`, **IYZWSv2** imzalı |
| Fiyat | çağıranın verdiği `priceCentsTRY` | sunucudaki `TRY_PLAN_PRICES` (kuruş) — çağıran tutar belirleyemez |
| Sonuç doğrulama | yok | `POST /payment/iyzipos/checkoutform/auth/ecom/detail` — para ve statü **yalnız buradan** |
| Webhook imzası | **yok** — gövde doğrudan işleniyordu | `x-iyz-signature-v3`, HMAC-SHA256, `timingSafeEqual` |
| Anahtarlar | `process.env.IYZICO_API_KEY \|\| 'demo-iyzico-api-key'` | `src/lib/env.ts`; demo fallback **yok** (yoksa rota 503) |
| Kiracı atfı | gövdedeki `tenantId` alanı | checkout'ta bizim ürettiğimiz `conversationId` |
| İdempotency | yok (aynı olay iki kez → iki kredi grant'i) | event-id'li audit satırı + `pg_advisory_xact_lock` |
| Tutar | `priceCentsTRY / 100` (float) | `Int` kuruş + `currency`, `src/lib/money.ts` |
| Plan düşüşü | yok | yeni planın kapsamadığı modüller `OFF` |

### Güvenlik kararları (gerekçeleriyle)

1. **Demo anahtar fallback'i kaldırıldı.** `'demo-iyzico-api-key'` ile imza doğrulaması yapmak,
   herkesin bildiği bir sırla imzalanmış bildirimi kabul etmek demektir. Anahtar yoksa rota
   **503** döner (400 değil: bildirim gerçek olabilir, biz doğrulayamıyoruz; iyzico 5xx'te
   yeniden dener, yani anahtar sonradan girilince olay kurtarılır).
2. **Kiracı `conversationId`'den okunur.** iyzico `conversationId`'yi bildirimde ve ödeme
   detayında aynen geri verir. Bizim üretmediğimiz bir `conversationId` tanım gereği
   atfedilemez → reddedilir. Gövdedeki `tenantId` alanı artık hiç okunmuyor.
3. **Para sağlayıcıdan okunur.** Bildirim yalnızca "bir şey oldu" sinyalidir; `paidPrice`,
   `paymentStatus` ve `paymentId` `.../detail` çağrısından alınır.
4. **Yarış koşulu kapatıldı.** Yalnız "önce oku, sonra yaz" kapısı yeterli değil: aynı olayın
   eşzamanlı iki teslimi kapıdan birlikte geçip krediyi iki kez verebilir. `pg_advisory_xact_lock`
   (event-id'nin SHA-256'sından türetilmiş anahtar) aynı olayın teslimlerini seri hale getirir.
   Şema değişikliği gerektirmez — kartın "yalnız şu dosyalar" kısıtı içinde kalır.
5. **Loglara kişisel veri yazılmıyor.** Sağlayıcı hata gövdesi (alıcı adı/e-postası içerebilir)
   loglanmaz, yalnız HTTP statüsü yazılır. İmza hatasında istemciye ayrıntı dönülmez.

---

## 2. Kanıt

Ortamda **iyzico sandbox anahtarı yok** (`.env` içindeki `IYZICO_API_KEY` / `IYZICO_SECRET_KEY`
boş). Kart gereği gerçek sağlayıcıya çağrı yapılmadı ve anahtar üretilmeye kalkışılmadı. Bunun
yerine **yalnız sağlayıcı** yerel bir mock HTTP sunucusuyla değiştirildi
(`127.0.0.1:4599`); Fabrika'nın kendi kodunun tamamı — rota, imza doğrulama, Prisma yazımları —
gerçek olarak koştu. Sunucu: `next build` + `next start -p 3011`, env:
`IYZICO_API_KEY=sandbox-e2e-key IYZICO_SECRET_KEY=sandbox-e2e-secret IYZICO_BASE_URL=http://127.0.0.1:4599`.

### 2.1 Yapılandırılmamış sunucu → fail-closed (gerçek istek, :3000, IYZICO_* boş)

```
$ curl -s -i -X POST http://127.0.0.1:3000/api/webhooks/iyzico -H 'content-type: application/json' \
    -d '{"iyziEventType":"CHECKOUT_FORM_AUTH","token":"tok_x","paymentConversationId":"fabrika:t:team:month:aa","status":"SUCCESS"}'
HTTP/1.1 503 Service Unavailable
{"success":false,"error":"iyzico integration is not configured"}
```

### 2.2 İmza doğrulaması — dört ret yolu (:3011, yapılandırılmış)

```
=== B) NO signature header ===
HTTP/1.1 401 Unauthorized
{"success":false,"error":"Signature verification failed"}

=== C) WRONG signature ===
HTTP/1.1 401 Unauthorized
{"success":false,"error":"Signature verification failed"}

=== D) VALID signature, body tampered after signing (paymentId değiştirildi) ===
HTTP/1.1 401 Unauthorized
{"success":false,"error":"Signature verification failed"}

=== E) malformed body ===
HTTP/1.1 400 Bad Request
{"success":false,"error":"Malformed notification body"}
```

D önemli: imza gövdedeki alanları bağlar, bu yüzden imzalandıktan **sonra** düzenlenmiş bir
gövde geçmez.

### 2.3 Geçerli imza → entitlement DB'de güncellendi

Hedef kiracı: `cmtq0ej29001wvsxkc1xy86fi` (Marmara Fon Danışmanlık — seed'lenmiş demo kiracı).

**ÖNCE:**
```
subscription : {"planId":"enterprise","status":"TRIALING","provider":"stripe","providerSubId":null,"interval":"month","currentPeriodEnd":null}
creditLedger rows: 0
billing audit rows: 0
invoice rows      : []
```

**İstek (F) ve tekrarı (G):**
```
=== F) VALID signature — 1st delivery ===
HTTP/1.1 200 OK
{"received":true,"success":true,"outcome":"synced","tenantId":"cmtq0ej29001wvsxkc1xy86fi","planId":"enterprise",
 "status":"ACTIVE","amountMinor":4500000,"currency":"TRY","creditsGranted":10000,"disabledModules":[],
 "message":"iyzico subscription ACTIVE for tenant cmtq0ej29001wvsxkc1xy86fi on plan enterprise"}

=== G) VALID signature — SAME event, 2nd delivery ===
HTTP/1.1 200 OK
{"received":true,"success":true,"outcome":"duplicate","tenantId":"cmtq0ej29001wvsxkc1xy86fi","planId":"enterprise",
 "message":"Event ref-e2e-0001 already processed; no second write"}
```

**SONRA (iki teslimin ardından):**
```
subscription : {"planId":"enterprise","status":"ACTIVE","provider":"iyzico","providerSubId":"99887766","interval":"month","currentPeriodEnd":"2026-10-07T03:13:59.036Z"}
creditLedger rows: 1
billing audit rows: 2
invoice rows      : [{"target":"99887766","data":{"planId":"enterprise","currency":"TRY","interval":"month",
                      "provider":"iyzico","amountMinor":4500000,"iyzicoEventId":"ref-e2e-0001"}}]
```

**İdempotency kanıtı:** 2 teslim → `creditLedger` **1** satır, `subscription.updated` **1**,
`invoice.payment_succeeded` **1**. Tutar `4500000` kuruş (= 45.000,00 TL), `currency: "TRY"`,
`Int` — float yok.

### 2.4 Eşzamanlı tekrar teslim (advisory lock yarış testi)

Aynı olay (`ref-e2e-0002`) **5 paralel** istekle gönderildi:

```
=== H) SAME event delivered 5x CONCURRENTLY ===
  resp: synced credits= 0
  resp: duplicate credits= None
  resp: duplicate credits= None
  resp: duplicate credits= None
  resp: duplicate credits= None

=== DB after the 5 concurrent deliveries ===
creditLedger rows: 1        # değişmedi — abonelik zaten ACTIVE
billing audit rows: 4       # 2 (ilk olay) + 2 (bu olay) — olay başına tam 2 satır
invoice rows      : [ …iyzicoEventId":"ref-e2e-0001…, …iyzicoEventId":"ref-e2e-0002… ]
```

5 eşzamanlı teslimden **tam 1'i** yazdı. Advisory lock olmadan bu testin çift yazma üretmesi
beklenirdi.

### 2.5 Atıf reddi (imza geçerli, atıf geçersiz)

```
=== I) correctly signed, but conversationId is not one we minted ===
HTTP/1.1 200 OK
{"received":true,"success":false,"outcome":"not_attributable","message":"conversationId does not identify a tenant"}

=== J) correctly signed, tenant does not exist ===
HTTP/1.1 200 OK
{"received":true,"success":false,"outcome":"unknown_tenant","tenantId":"no-such-tenant-id","message":"Tenant not found: no-such-tenant-id"}
```

200 dönülüyor çünkü bu kalıcı bir durum — iyzico'nun asla başarılı olmayacak bir bildirimi
tekrar tekrar denemesi anlamsız. DB'ye hiçbir şey yazılmadı.

### 2.6 Checkout başlatma — gerçek IYZWSv2 imzalı istek

```
checkout result: {
  "status": "success",
  "token": "tok_e2e_0001",
  "paymentPageUrl": "https://sandbox-cpp.iyzipay.com/tok_e2e_0001",
  "conversationId": "fabrika:cmtq0ej29001wvsxkc1xy86fi:team:year:2fe875362624e410",
  "priceMinor": 7536000,
  "currency": "TRY"
}
```

Sağlayıcının (mock) gördüğü istek — `Authorization` başlığı ve sunucuda türetilmiş fiyat:

```
[mock-iyzico] POST /payment/iyzipos/checkoutform/initialize/auth/ecom authorization=IYZWSv2 YXBpS2V5OnNh…
[mock-iyzico]   body: {"locale":"tr","conversationId":"fabrika:cmtq0ej29001wvsxkc1xy86fi:team:year:2fe875362624e410",
  "price":"75360.00","paidPrice":"75360.00","currency":"TRY","basketId":"team-year","paymentGroup":"SUBSCRIPTION",
  "callbackUrl":"http://localhost:3011/tr/billing/iyzico/return","enabledInstallments":[1],
  "buyer":{…},"basketItems":[{"id":"team-year","name":"Ekip Planı (yıllık)","category1":"SaaS","itemType":"VIRTUAL","price":"75360.00"}]}
```

`7536000` kuruş → tel üzerinde `"75360.00"`; dönüşüm yalnız `src/lib/money.ts` sınırında.

### 2.7 Birim testler — 28 yeni test

```
$ npx vitest run src/lib/iyzico.test.ts src/lib/money.test.ts
 Test Files  2 passed (2)
      Tests  28 passed (28)
```

Kapsam: conversationId round-trip ve reddi · imza (geçerli / eksik / oynanmış gövde / yanlış sır /
yanlış uzunluk) · IYZWSv2 başlığı · checkout (sunucu fiyatı, sağlayıcı hatası, TRY fiyatı olmayan
plan) · webhook (sync, idempotency, atfedilemez, başarısız ödeme, başka konuşmaya ait ödeme,
bilinmeyen kiracı, aktif abonelikte kredi tekrar verilmiyor, plan düşüşünde modül kapatma) ·
money (yuvarlama, ayrıştırılamayan tutarda `throw`, round-trip).

### 2.8 Tüm süit + typecheck + lint

```
$ npx vitest run
 Test Files  49 passed | 2 skipped (51)
      Tests  433 passed | 8 skipped (441)

$ npx tsc --noEmit -p tsconfig.json
typecheck exit=0

$ npx eslint src/lib/iyzico.ts src/lib/money.ts src/lib/iyzico.test.ts src/lib/money.test.ts \
    src/app/api/webhooks/iyzico/route.ts src/lib/env.ts
(çıktı yok — temiz)

$ npx next build
exit=0    # ƒ /api/webhooks/iyzico derlendi
```

`any` / `@ts-ignore` / doğrudan `process.env` yok:
```
$ grep -n "process.env" src/lib/iyzico.ts src/lib/money.ts src/app/api/webhooks/iyzico/route.ts
process.env in product code: 1 (1 = eşleşme yok)
```

### 2.9 Test verisi geri alındı

E2E, seed'lenmiş demo kiracının `Subscription` satırını değiştirdi. Satır, testten **önce**
alınan anlık görüntüdeki değerlere geri yazıldı:

```
$ npx tsx restore.ts
restored: {"planId":"enterprise","status":"TRIALING","provider":"stripe","providerSubId":null,"currentPeriodEnd":null,"interval":"month"}
```

`AuditEvent` ve `CreditLedger` satırları append-only geçmiştir, silinmedi (silme yıkıcı işlem —
açık onay olmadan koşulmaz). Yerel dev DB'sinde bu kiracıda 4 audit + 1 kredi satırı kanıt olarak
duruyor.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/iyzico.ts` | Yeniden yazıldı: checkout init, sonuç doğrulama, IYZWSv2 imzalama, bildirim imza doğrulaması, conversationId atfı, idempotent entitlement senkronu |
| `src/app/api/webhooks/iyzico/route.ts` | Yeniden yazıldı: fail-closed imza kapısı, ret yolları, sonuç kodları |
| `src/lib/money.ts` | **YENİ** — kuruş/cent yardımcıları (CLAUDE.md kural 9). Depoda yoktu; kural onu tek dönüşüm noktası olarak işaret ediyordu |
| `src/lib/env.ts` | `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL` eklendi |
| `src/lib/iyzico.test.ts` | **YENİ** — 20 test |
| `src/lib/money.test.ts` | **YENİ** — 8 test |
| `.env.example` | `IYZICO_BASE_URL` + yorumlar (**dosya `.gitignore`'da**, commit'e girmedi — yalnız yerelde) |

Migration **yok**, şema değişikliği **yok**, mevcut tablolara dokunulmadı — bu yüzden geri alma
yolu tek adım: `git revert 5bd921a`.

---

## 4. Riskler

1. **Bildirim imzasının kanonik dizgisi sandbox'a karşı doğrulanmadı.** V3 şeması
   `secretKey + iyziEventType + paymentId + paymentConversationId + status` olarak uygulandı ve
   tek bir fonksiyonda (`notificationSignaturePayload`) izole edildi. Sandbox anahtarı olmadığı
   için gerçek bir iyzico teslimi ile replay edilemedi. iyzico'nun canlı başlığı farklı bir sıra
   kullanıyorsa düzeltme **tek satır**; dosyanın geri kalanı alan sırasına bağlı değil.
   **Canlıya almadan önce bir sandbox teslimiyle doğrulanmalı.**
2. **Stripe tarafındaki idempotency kapısı fiilen kapalı** (`data: { equals: {...} }` tam belge
   eşitliği arıyor, yazılan `data` daha fazla alan taşıyor). Aynı Stripe olayının iki teslimi
   krediyi iki kez verebilir. Bu görevin kapsamı dışında; ayrı bir bug kartı hak ediyor.
3. **`Subscription` iyzico için tek satır/kiracı.** Bir kiracı hem Stripe hem iyzico ile ödeme
   yaparsa ikinci sağlayıcı birincinin satırını ezer. Bugünkü ürün için doğru (kiracı ya TL ya
   EUR faturalanır) ama karma durum için şema kararı gerekir.
4. **TL fiyat listesi kodda.** `TRY_PLAN_PRICES` BILLING.md §4'ün "faz 2"de `Plan.prices[]` JSON'a
   taşınacağını söylediği listedir; kolon henüz yok. Kur güncellemesi bugün kod değişikliği +
   deploy gerektiriyor.
5. **Webhook `prisma` singleton'ıyla yazıyor** (oturum yok → `fabrika` rolü, RLS bypass). Stripe
   rotası da aynı şekilde çalışıyor; kiracı izolasyonu `conversationId` atfıyla sağlanıyor,
   RLS ile değil.
6. **Otomatik yenileme yok.** Bu akış tek seferlik ödeme + 30/365 günlük dönem sonu yazıyor.
   iyzico abonelik (recurring) API'si ayrı bir iştir.

---

## 5. Açık sorular

1. iyzico sandbox anahtarları ne zaman girilecek? (Risk 1'i kapatmak için tek gereken şey.)
2. TL fiyatları `Plan.prices[]` JSON kolonuna taşıyalım mı? Taşırsak migration + seed + DATA_MODEL
   güncellemesi gerekir — ayrı görev.
3. Checkout'u başlatan UI/server action bu görevin kapsamında değildi. `createIyzicoCheckout`
   çağıran bir server action + dönüş sayfası (`/[locale]/billing/iyzico/return`) kim yazacak?
4. Stripe idempotency bug'ı için kart açayım mı?

---

## 6. Sonraki adım

1. Sandbox anahtarı girilir girilmez: bir gerçek checkout → gerçek bildirim ile imza şemasını
   doğrula (Risk 1).
2. Checkout'u tetikleyen server action + dönüş sayfası (ayrı görev).
3. Stripe idempotency düzeltmesi (ayrı görev).
4. iyzico recurring/abonelik API'si — yenileme ve iptal olayları.
