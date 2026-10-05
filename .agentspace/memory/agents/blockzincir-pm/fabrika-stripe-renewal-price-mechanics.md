---
name: fabrika-stripe-renewal-price-mechanics
description: Fabrika'da bir Stripe aboneliğinin yenileme tutarını kim/ne zaman belirliyor — checkout'ta bir kez sabitlenir, sonrası Stripe'ın kendi motoru; fiyat kilidi mutlak tutarı değil yüzdeyi dondurur
metadata:
  type: project
  updatedAt: 2026-09-07T20:20:00Z
---

TASK-MTR882HVZ8BG7'nin 3. alt-görevinde ("bir sonraki yenilemede ne ödeyeceğim") doğrulandı.

## Mekanik

- Fabrika'da bir aboneliğin fiyatı **yalnızca checkout anında bir kez** üretiliyor:
  `src/app/api/billing/checkout/route.ts` Stripe Checkout Session'ı `price_data.unit_amount`
  ile açıyor (Stripe fiyat kataloğunda önceden tanımlı bir `Price` id'si YOK — dinamik
  `price_data`). Stripe bu tutarı aboneliğe kalıcı bağlıyor ve her periyotta **kendi
  motoruyla** aynı tutarı tekrar tahsil ediyor.
- Uygulama kodu bunu **hiçbir zaman** sonradan değiştirmiyor: `grep -rn "subscriptions\.update"
  src` → 0 sonuç, repoda hiçbir yerde yok. `syncStripeSubscription`
  (`src/lib/billing/subscription-sync.ts`) yenileme webhook'unda (`customer.subscription.updated`)
  çalışan tek fonksiyon ve sadece DB'yi Stripe'ın söylediğiyle senkron ediyor — fiyata
  dokunmuyor.
- Sonuç: "yenilemede ne ödenir" sorusunun cevabı checkout anında `effectiveTier()` +
  `priceLine()` ile **bir kez** karara bağlanıyor, sonrası tamamen Stripe'a devrediliyor.
  Yeni bir checkout (plan değişikliği, döngü değişikliği) açılırsa aynı zincir tekrar
  çalışıyor ve yine kilidi (`readPriceLock()`) okuyor.

## Fiyat kilidi: yüzde donuyor, mutlak tutar donmuyor — bilinçli tasarım

`Subscription.lockedAmountMinor` (o gün gerçekten tahsil edilen mutlak rakam) yalnız
**denetim/kanıt** için saklanıyor — bir sonraki fiyatı hesaplamak için **hiç okunmuyor**.
Bunun yerine `effectiveTier()` kilitli **yüzdeyi** döndürüyor ve `priceLine()` bu yüzdeyi
o anki `catalog.ts` liste fiyatına (`monthlyListMinor`/`yearlyListMinor` — kod sabiti)
uyguluyor. Bu **kasıtlı**: yüzde böylece plan yükseltme/düşürme ve aylık↔yıllık geçişte de
taşınabiliyor (`price-lock.test.ts`: "carries the rate across an upgrade and a downgrade").
Mutlak tutarı donduran bir tasarım bunu yapamazdı (yanlış planın fiyatını dondurmüş olurdu).

**Örtük varsayım:** katalog liste fiyatları (`PLANS` sabiti) zaman içinde değişmez. Bugüne
kadar hiç değişmedi. Değişirse — kod düzeyinde bilinçli bir fiyat kararıyla — kilitli
kiracıların yüzdesi yeni liste fiyatına uygulanır; "kilitli %70" = "liste fiyatının %70
indirimlisi", "sabit $X sonsuza dek" değil. Bu docs/BILLING.md §4.1.1'e yazıldı.

## Nasıl kullanılır

Fabrika'da billing/renewal/price-lock ile ilgili bir görev gelirse: "yenileme"nin ayrı bir
kod yolu olmadığını, tamamen Stripe'ın recurring engine'ine devredildiğini, ve kilidin
mutlak değil yüzde-tabanlı olduğunu varsaymadan önce doğrulama — hâlâ doğruysa (checkout
route + subscription-sync.ts değişmediyse) yukarıdaki grep'i tekrarlamak yeterli kanıt.

İlgili: [[price-lock-validation-done]] [[fabrika-server-side-price-source-decision]]
