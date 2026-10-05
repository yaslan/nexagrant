# TASK-MTR6Q2IODYQRC — Checkout no longer trusts the client's price

**Sprint:** S11 · **Öncelik:** P0 · **Ajan:** blockzincir-pm · **Branch:** dev · **Tarih:** 2026-09-07

---

## 1. Ne yapıldı

`POST /api/billing/checkout` Stripe tutarını istekten gelen `price` / `originalPrice` /
`discountPercent` alanlarından hesaplıyordu. Artık tutarın tek kaynağı sunucudaki katalog.

### Yeni: `src/lib/billing/catalog.ts` — saf, tek doğruluk kaynağı

Stripe yok, Prisma yok, React yok, `process.env` okuması yok. Diğer dört kart bunu import eder.

| Plan | Aylık (liste) | Yıllık (liste, tam yıl) | Reklam edilen aylık-eşdeğer |
|---|---|---|---|
| Basic | `4_500` ($45.00) | `38_700` ($387.00) | $32.25 |
| Pro   | `8_700` ($87.00) | `74_700` ($747.00) | $62.25 |
| Ultra | `14_700` ($147.00) | `119_700` ($1,197.00) | $99.75 |

| Tek seferlik | Liste | İndirim | Ödenecek | Kampanya |
|---|---|---|---|---|
| `lifetime-ultra` | `257_600` ($2,576.00) | %50 (sabit) | `128_800` ($1,288.00) | `OMURBOYU20` |

Hepsi **Int minor unit (cent) + `currency: 'USD'`** — CLAUDE.md kural 9. Dosyada tek bir kayan
noktalı dolar yok. İndirim aritmetiği `src/lib/money.ts` içine eklenen `applyPercentDiscount()`
ile yapılır (tam sayı çarpımı, sonra yarım-yukarı yuvarlama).

**İndirim kademeleri de katalogda** (`DISCOUNT_TIERS`): ILK5 %70 · SONRAKI10 %60 · LANSMAN50 %50 ·
KURUCU40 %40 · GROWTH30 %30 · SCALE20 %20 · PROMO10 %10, artı liste fiyatı için `NONE` (%0).
Her kademe `cumulativeSubscribers` eşiğini de taşır (5/15/35/85/185/385/885), böylece abone sayısı
güvenilir bir olguya dönüştüğü gün `tierForSubscriberCount()` merdiveni yeniden yazmadan devreye
girebilir.

### Yıllık fiyat nereden türüyor — karar ve gerekçe

Karar: **yıllık toplam bir kez indirilir ve bir kez yuvarlanır** (`YEARLY_DERIVATION =
'discount-once-on-yearly-total'`).

Reklam edilen aylık-eşdeğer × 12 tam dolar veriyor ($32.25×12 = $387.00), yani *liste* düzeyinde
iki sıralama da aynı. Fark indirimde çıkıyor — ölçüldü:

```
(a) round(aylık-eşdeğer × (1−d)) × 12  → Basic @%70: round(3225×0.30)=968¢ ×12 = 11.616¢
(b) round(aylık-eşdeğer × 12 × (1−d))  → Basic @%70:      38700×0.30      = 11.610¢
                                                             fark = 6¢ / yıl
```

(b) seçildi. Gerekçe: (a) yarım kuruşu yukarı yuvarlayıp hatayı **on iki ile çarpıyor** ve her
planda, her yarım-kuruşlu kademede müşteriden yılda 6¢ fazla alıyor — küçük ama bir yuvarlama
artefaktı yüzünden alınmış para. Ayrıca Stripe yıllık aboneliği **tek bir `unit_amount`** olarak
tahsil ediyor; tam sayı cent olmak zorunda olan rakam yıllık rakam, gösterilen aylık rakam değil.
Aylık-eşdeğer `monthlyEquivalentMinor` olarak yalnızca **gösterim için** duruyor ve testte
"asla tahsil edilmez" diye sabitlendi.

### Aktif kademe artık sunucuda — kaynağı ve gerekçesi

`src/lib/billing/active-tier.ts` → `getActiveTier()`. Kaynak: **`BILLING_ACTIVE_TIER` ortam
değişkeni** (`src/lib/env.ts`'e eklendi; CLAUDE.md doğrudan `process.env` okumayı yasaklıyor).
Boşsa reklam edilen varsayılan kademe (ILK5) — boş bırakmak, müşteriye az önce verilen fiyatı
sessizce yükseltmemeli. Okunamayan bir değer sessizce "indirim yok"a (sürpriz zam) ya da "en derin
indirim"e (bedava verilen gelir) dönüşmez; varsayılana düşer ve `logger.warn` ile bağırır.

**Neden canlı abone sayısı değil** (ölçüldü, 2026-09-07, bu veritabanı):

```
Subscription tablosu: [{"status":"ACTIVE","n":1}]   Tenant: [{"n":1}]
```

Tek satır var ve o satır **seed edilmiş demo kiracı**. Sayıya bağlansaydı bugün "1 abone → %70
indirim" tohum verisinden okunacaktı. Tablo ödeyen müşteriyi demo/beta/seed kiracıdan ayırt
edemiyor ve `SubStatus` TRIALING'i ACTIVE ile birlikte sayıyor. Ödeyen abone denetlenebilir bir
kayıt olana kadar (CLAUDE.md kural 7 — gösterilen her oran bir kayda bağlı) herkesin fiyatını
kimsenin doğrulamadığı bir sayıdan türetmek yanlış olur. Ortam değişkeni ise bir istatistik gibi
sunulan olgu değil, deploy geçmişinde denetlenebilir bir dağıtım kararı. Sayım güvenilir olduğunda
`getActiveTier()` gövdesi `tierForSubscriberCount(await countPayingSubscribers())` ile
değiştirilir — merdiven zaten hazır.

### Checkout yeniden yazıldı

- Gövdeden yalnız **`sku`/`id`/`planId`, `quantity`, `billingCycle`, `couponCode`** okunur (Zod).
  Bilinmeyen anahtarlar zod tarafından **strip** edilir — bir `price` alanı fiyatlama koduna hiç
  ulaşmaz.
- `price` · `originalPrice` · `discountPercent` · `unitAmount` · `amount` · `total` gelirse
  **yok sayılır ve `logger.warn` ile loglanır** (saldırı sinyali sessizce yutulmaz), ayrıca demo
  yanıtında `ignoredClientFields` olarak geri döner.
- Kupon kodu yalnız **hangi kampanya** olduğunu söyler. Aktif olmayan bir kademeyi adlandırırsa
  hiçbir şeyi değiştirmez, loglanır.
- Bilinmeyen `planId`/`sku` → **400**. `priceId` yolundaki sessiz `price: 45` varsayılanı silindi;
  o yol da katalogdan geçer.
- `Math.max(50, unitAmountCents)` **kaldırıldı**. Katalog 50¢ altı bir tutar üretirse istek 500 ile
  reddedilir — yanlış tutarı başarılı 50 sentlik tahsilata çeviren tam olarak o clamp'ti.

---

## 2. Kanıt

### 2.1 SALDIRI KANITI — `price: 0.5` + `discountPercent: 99` (Ultra yıllık)

```console
$ curl -s -X POST http://localhost:3000/api/billing/checkout -H 'Content-Type: application/json' \
  -d '{"items":[{"id":"plan-ultra","name":"Ultra","type":"plan","price":0.5,"originalPrice":0.5,
       "discountPercent":99,"billingCycle":"yearly","quantity":1}],"couponCode":"ILK5","discountPercent":99}'
{
    "demoMode": true,
    "tenantId": "default-tenant",
    "activeTier": { "code": "ILK5", "percentOff": 70 },
    "ignoredClientFields": [
        "discountPercent", "items[0]price", "items[0]originalPrice", "items[0]discountPercent"
    ],
    "currency": "USD",
    "totalMinor": 35910,
    "lines": [{ "sku": "plan-ultra", "billingCycle": "yearly", "quantity": 1,
                "amountMinor": 35910, "listAmountMinor": 119700,
                "percentOff": 70, "campaignCode": "ILK5", "totalMinor": 35910 }]
}
```

İstemci 50 sent + %99 istedi; sunucu **35.910¢ = $359.10** üretti (Ultra yıllık liste 119.700¢,
aktif kademe %70) — birim test tablosundaki değerin birebir aynısı.

**50 sentlik Ultra Lifetime denemesi:**

```console
$ curl -s -X POST .../checkout -d '{"items":[{"id":"lifetime-ultra","price":0.5,"originalPrice":0.5,"discountPercent":99,"quantity":1}]}'
ignored: ['items[0]price', 'items[0]originalPrice', 'items[0]discountPercent']
lines:   [{"sku":"lifetime-ultra","billingCycle":"one-time","amountMinor":128800,
           "listAmountMinor":257600,"percentOff":50,"campaignCode":"OMURBOYU20","totalMinor":128800}]
```

$0.50 istendi, **$1.288,00** üretildi.

**Sunucu logu (aynı istek):**

```
[WARN] Checkout request carried client-supplied pricing fields; ignoring them
       {"tenantId":"default-tenant","fields":"discountPercent,items[0]price,items[0]originalPrice,items[0]discountPercent"}
[WARN] Checkout coupon names a tier that is not the active one; pricing at the active tier
       {"tenantId":"default-tenant","couponCode":"ILK5","activeTier":"LANSMAN50"}
```

### 2.2 Aktif kademe gerçekten sunucudan geliyor

Aynı saldırı gövdesi, sunucu `BILLING_ACTIVE_TIER=LANSMAN50` ile koşarken:

```json
{ "activeTier": { "code": "LANSMAN50", "percentOff": 50 },
  "totalMinor": 59850,
  "lines": [{ "sku": "plan-ultra", "amountMinor": 59850, "listAmountMinor": 119700,
              "percentOff": 50, "campaignCode": "LANSMAN50" }] }
```

İstek `couponCode: "ILK5"` (%70) gönderdi, sunucu %50 fiyatladı. Kupon oranı taşımıyor.

### 2.3 Bilinmeyen plan → 400

```console
$ curl -s -w "HTTP %{http_code}\n" -X POST .../checkout -d '{"items":[{"id":"plan-enterprise","price":0.5}]}'
HTTP 400
{"error":"Unknown plan: plan-enterprise"}

$ curl -s -w "HTTP %{http_code}\n" -X POST .../checkout -d '{"priceId":"price_1MadeUpStripeId","mode":"payment"}'
HTTP 400
{"error":"Unknown plan: price_1MadeUpStripeId"}     ← eskiden sessizce $45 olurdu
```

### 2.4 Mutlu yol — GERÇEK TARAYICI (Playwright, headed akış, gerçek tıklama)

`/tr/pricing` → çerez onayını kapat → **"Pro Paketini Sepete Ekle"** tıkla → sepet çekmecesi →
**"Stripe İle Ödemeye Geç"** tıkla. Yakalanan ağ trafiği:

```
--- POST BODY THE BROWSER SENT ---
{"items":[{"id":"plan-pro","type":"plan","name":"Pro Plan (Yıllık)","price":18.675,
           "originalPrice":62.25,"billingCycle":"yearly","quantity":1,
           "promoCode":"ILK5","discountPercent":70}],
 "couponCode":"ILK5","discountPercent":70,"locale":"tr","workspace":"default"}

--- SERVER RESPONSE (200) ---
{"activeTier":{"code":"ILK5","percentOff":70},
 "ignoredClientFields":["discountPercent","items[0]price","items[0]originalPrice","items[0]discountPercent"],
 "currency":"USD","totalMinor":22410,
 "lines":[{"sku":"plan-pro","name":"Pro","billingCycle":"yearly","quantity":1,
           "amountMinor":22410,"listAmountMinor":74700,"percentOff":70,"campaignCode":"ILK5"}]}
```

Sunucunun ürettiği **22.410¢ = $224.10/yıl**, katalog değeriyle ve birim test tablosuyla birebir
aynı (Pro yıllık liste 74.700¢ × %30).

Ekran görüntüleri: `docs/agent-results/TASK-MTR6Q2IODYQRC-screenshots/`
`e2e-01-pricing-pro-card.png` · `e2e-02-cart-drawer.png` · `e2e-03-checkout-response.png`

> **Bu koşunun ortaya çıkardığı ikinci bulgu (devir notu):** tarayıcı `price: 18.675` gönderdi —
> bu aylık-eşdeğer, yıllık toplam değil. **Eski kod** bunu `round(62.25 × 0.30 × 100) = 1868`
> cent'e çevirip `recurring: { interval: 'year' }` ile gönderiyordu; yani Pro yıllık için bir yıl
> boyunca **$18.68** tahsil edilecekti, $224.10 yerine. Route yalnız saldırıya açık değildi,
> meşru mutlu yolda da **12 kat eksik** fatura kesiyordu. Sepet çekmecesi ve demo modalı hâlâ kendi
> hesabını gösteriyor (`$18.67`, ekran görüntüsü 02/03) — bu ekranlar artık sunucunun
> `totalMinor` / `lines` yanıtını basmalı; `TASK-MTR6QYPGOS2N0`'ın işi.

### 2.5 Birim testler — her plan × her kademe × (aylık/yıllık)

`src/lib/billing/catalog.test.ts` beklenen cent tablosunu **elle yazılmış** tutar (aritmetiğin
ikinci bir kopyası değil, spec). 3 plan × 8 kademe × 2 döngü + lifetime + yuvarlama + sku +
kademe + aktif-kademe çözümlemesi.

```console
$ pnpm vitest run src/lib/billing/catalog.test.ts src/lib/money.test.ts
 Test Files  2 passed (2)
      Tests  53 passed (53)
```

Yuvarlama davranışı testle sabitlendi:

```ts
it('discounts the yearly total once instead of the monthly figure twelve times', () => {
  const perMonthFirst = applyPercentDiscount(3_225, 70) * MONTHS_PER_YEAR;  // 11_616
  const charged = priceLine({ sku: 'basic', billingCycle: 'yearly' }, tier('ILK5')).amountMinor; // 11_610
  expect(perMonthFirst - charged).toBe(6); // 6¢/yıl müşterinin borcu değil
});
```

### 2.6 `pnpm gate` — temiz

```console
$ pnpm gate
✖ 194 problems (0 errors, 194 warnings)          ← lint: 0 hata (194 uyarı depoda önceden var,
                                                    dokunduğum dosyalarda 0 uyarı)
$ tsc --noEmit                                    ← çıktı yok = temiz
$ vitest run --passWithNoTests
 Test Files  61 passed | 2 skipped (63)
      Tests  635 passed | 8 skipped (643)
$ tsx scripts/check-rls.ts
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.
$ tsx scripts/check-rls-live.ts
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

---

## 3. Diğer iki kart için kullanım örneği

Katalog saf ve senkron; sunucu bileşeninden de, server action'dan da, API route'undan da çağrılır.

### `TASK-MTR6QYPGOS2N0` — pricing / admin billing / settings billing ekranları

Fiyatı **hesaplamayın**, katalogdan **isteyin**. Kademe seçimi artık sunucunun; istemci yalnız
gösterir.

```ts
// Sunucu bileşeni (page.tsx) — kademe ve fiyatlar tek yerden
import { getActiveTier } from '@/lib/billing/active-tier';
import { priceLine, DISCOUNT_TIERS, type BillingCycle } from '@/lib/billing/catalog';
import { toDecimalString } from '@/lib/money';

export default async function PricingPage() {
  const tier = getActiveTier();                       // ← tek yetkili kademe
  const cycle: BillingCycle = 'yearly';

  const cards = (['basic', 'pro', 'ultra'] as const).map((planId) => {
    const line = priceLine({ sku: planId, billingCycle: cycle }, tier);
    return {
      planId,
      priceLabel: toDecimalString(line.monthlyEquivalentMinor, line.currency), // "18.68" — GÖSTERİM
      yearTotalLabel: toDecimalString(line.amountMinor, line.currency),        // "224.10" — ÖDENEN
      listLabel: toDecimalString(line.listAmountMinor, line.currency),         // "747.00" üstü çizili
      percentOff: line.percentOff,                                            // 70
      couponCode: line.campaignCode,                                          // "ILK5"
    };
  });

  return <PricingClient tiers={DISCOUNT_TIERS} activeTierCode={tier.code} cards={cards} />;
}
```

Sepet/checkout POST gövdesi artık şu kadar olmalı — `price`, `originalPrice`, `discountPercent`
**gönderilmemeli** (gönderilirse yok sayılır ve saldırı olarak loglanır):

```ts
await fetch('/api/billing/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    items: cartItems.map((i) => ({ sku: i.id, quantity: i.quantity, billingCycle: i.billingCycle })),
    couponCode: activeCoupon,   // yalnız kampanya adı; oranı taşımaz
    locale, workspace,
  }),
});
```

Demo modunda yanıt `totalMinor`, `currency` ve `lines[]` döner — sepet toplamını ve demo modalını
**bu alanlardan** basın, kendi çarpımınızdan değil (bkz. §2.4 devir notu).

Sepet çekmecesindeki "Aktif İndirim Katmanı" seçici artık fiyat belirlemiyor; ya salt-okunur
gösterilmeli (`activeTierCode`) ya da kaldırılmalı.

### `TASK-MTR6QIE05ZKNH` — EUR 5 planın emekliye ayrılması

```ts
import { CATALOG, findEntry, priceLine, NO_DISCOUNT_TIER } from '@/lib/billing/catalog';

// Kanonik liste — Prisma `Plan` tablosundaki EUR satırlarını buna eşleyin:
CATALOG.filter((e) => e.kind === 'plan');           // basic / pro / ultra
findEntry('pro')?.sku;                              // 'plan-pro' (bare id de kabul)
priceLine({ sku: 'pro', billingCycle: 'monthly' }, NO_DISCOUNT_TIER).amountMinor; // 8700 = liste
```

`NO_DISCOUNT_TIER` ile fiyatlamak **liste fiyatını** verir — migration/seed ve fatura
mutabakatında kampanya bulaşmadan karşılaştırmak için doğru olan bu.

Katalog kasıtlı olarak `prisma/**`, `src/lib/billing.ts`, `src/lib/iyzico.ts` ve
`docs/BILLING.md`'ye dokunmuyor; para birimi USD sabit — TRY/iyzico eşlemesi o kartın kapsamında.

---

## 4. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/billing/catalog.ts` | **yeni** — saf katalog, kademeler, `priceLine()` |
| `src/lib/billing/active-tier.ts` | **yeni** — sunucudaki aktif kademe (env kaynaklı) |
| `src/lib/billing/catalog.test.ts` | **yeni** — 3 plan × 8 kademe × 2 döngü + lifetime + yuvarlama |
| `src/app/api/billing/checkout/route.ts` | yeniden yazıldı — zod, katalog fiyatı, clamp yok |
| `src/lib/money.ts` | `applyPercentDiscount()` eklendi (tam sayı, yarım-yukarı) |
| `src/lib/money.test.ts` | `applyPercentDiscount` testleri |
| `src/lib/env.ts` | `BILLING_ACTIVE_TIER` opsiyonel değişkeni kaydedildi |
| `docs/agent-results/TASK-MTR6Q2IODYQRC-screenshots/*.png` | gerçek tarayıcı kanıtı |

`src/lib/env.ts` kartın dosya listesinde yoktu ama yasak listesinde de değildi: CLAUDE.md doğrudan
`process.env` okumayı yasakladığı için ortam değişkeni oraya kaydedilmek zorundaydı. Tek satırlık,
opsiyonel bir ekleme; başka hiçbir şeye dokunmadı.

## 5. Riskler

1. **Ön yüz ile sunucu şu an aynı fiyatı göstermiyor.** Sepet "$18.67" diyor, sunucu $224.10
   fiyatlıyor (§2.4). Bu, `TASK-MTR6QYPGOS2N0` inene kadar açık kalan görünür bir tutarsızlık —
   yönü doğru (sunucu haklı), ama kullanıcıya yanlış rakam gösteriliyor. **Bu iki kart aynı sürümde
   çıkmalı.**
2. `BILLING_ACTIVE_TIER` production'da set edilmezse ILK5 (%70) çalışır. Kampanya bittiğinde bu
   değişkenin set edilmesi bir **deploy adımıdır**; unutulursa gelir kaybı sessizdir (log yok,
   çünkü varsayılan geçerli bir durum). Kademe geçişleri için operasyon notu gerekiyor.
3. Katalog USD'ye sabit. TRY/iyzico akışı bu kataloğu henüz kullanmıyor — `TASK-MTR6QIE05ZKNH`.
4. Stripe anahtarları bu ortamda boş, dolayısıyla `stripe.checkout.sessions.create()` çağrısı
   canlı olarak koşturulmadı; fiyat hesabı demo yanıtı üzerinden kanıtlandı ve Stripe'a giden
   `unit_amount` tam olarak aynı `line.amountMinor` alanı.

## 6. Açık sorular

1. **Aktif kademe kimin kararı?** Bugün deploy değişkeni. Panelden (admin billing) değiştirilebilir
   olmalı mı — yoksa fiyat değişikliği bilinçli olarak deploy gerektirsin mi?
2. "Son 2 Koltuk" gibi sayaçlar bir kayda bağlı değil (CLAUDE.md kural 7). Kaldırılsın mı, yoksa
   ödeyen abone sayımı denetlenebilir hale mi getirilsin?
3. Pricing kartındaki Ultra "ömür boyu" satırı `897 × multiplier` hesaplıyor, aşağıdaki büyük blok
   ise $1.288/$2.576 diyor. Katalog patron kararını (2.576 → %50 → 1.288) aldı; $897'lik varyant
   ölü kabul edildi — doğrulanmalı.
4. Mevcut aboneler kademe değişince ne oluyor? Sayfa "Katıldığınız fiyat sabit kalır" diyor;
   yenilemede bu sözü tutan bir mekanizma henüz yok.

## 7. Sonraki adım

- `TASK-MTR6QYPGOS2N0`: üç ekranı katalogdan besle, POST gövdesinden fiyat alanlarını çıkar,
  sepet/demo modal toplamını sunucu yanıtından bas (§3).
- `TASK-MTR6QIE05ZKNH`: EUR 5 planı emekliye ayır, Prisma `Plan` satırlarını `CATALOG`'a eşle.
- Operasyon: `BILLING_ACTIVE_TIER` production ortamına eklensin ve kampanya geçiş prosedürü yazılsın.
