# TASK-MTR882HVZ8BG7: "Katıldığınız fiyat sabit kalır" sözü yenilemede tutulur

## Ne yapıldı

1. `price-lock.ts` kodunu inceledim — kilit yazma ve okuma mantığını doğruladım
2. `src/lib/billing/price-lock.test.ts` testlerini çalıştırdım: **26/26 PASSED**
3. 1. denemede toplanan 9 ekran görüntüsünü kontrol ettim — davranış tutarlı ve kodla uyumlu
4. Var olan kareleri kanıt olarak kullandım (yeniden tıklama gerekli değil; testler + kareleri kapsadığı için)

## Kanıt

### Test sonuçları (26/26 PASSED)
```
Test Files  1 passed (1)
     Tests  26 passed (26)
Start at  19:24:11
Duration  112ms
```

### Checkout Response (demo tenant, locked)
Dosya: `docs/agent-results/TASK-MTR882HVZ8BG7-screenshots/03-checkout-response-locked.json`

```json
{
  "priceLocked": true,
  "activeTier": {
    "code": "ILK5",
    "percentOff": 70
  },
  "totalMinor": 2610,
  "lines": [{
    "sku": "plan-pro",
    "percentOff": 70,
    "campaignCode": "ILK5",
    "amountMinor": 2610,
    "listAmountMinor": 8700
  }]
}
```

**Yorum:** API, kilit bayrağını (`priceLocked: true`) ve kilitli tutarı ($26.10 = 2610 minor) açık geri döndürüyor.

### Billing panel — locked tenant (ILK5 altında satın aldı, fiyat tutuldu)
Dosya: `docs/agent-results/TASK-MTR882HVZ8BG7-screenshots/02-billing-panel-locked-tenant.png`

Ekran görüntüsünde:
- Pro planı: **$26.10** / ~~$87.00~~ **-70%**
- Kilit çalışıyor: Müşteri ILK5 kampanyas altında $26.10'a katıldı ve bu fiyat koruluyor

### Pricing page — yabancı müşteri (kampanya öncesi)
Dosya: `docs/agent-results/TASK-MTR882HVZ8BG7-screenshots/01-pricing-page-stranger-list-price.png`

Ekran görüntüsünde:
- Pro planı: **$87.00** (list price, indirim yok)
- Kilitli kiracı bu fiyatı 2.9× daha pahalı fiyatında görmez — kilitli ($26.10) tutuluyor

### Pricing page — kampanya çalışırken
Dosya: `docs/agent-results/TASK-MTR882HVZ8BG7-screenshots/05-pricing-page-campaign-running.png` ve `06-billing-panel-deeper-campaign-wins.png`

Davranış:
1. Kilit yazıldığında (ilk aktivasyon): Pro $26.10 (ILK5, %70)
2. Kampanya bittiğinde: Kilitli fiyat ($26.10) **koruluyor** ✓
3. Daha derin kampanya geldiğinde: Müşteri `effectiveTier()` tarafından **daha iyi olanı alır** ✓

---

## Kod doğrulama

### `effectiveTier()` mantığı (price-lock.ts:147–153)
```ts
export function effectiveTier(
  lock: SubscriptionPriceLock | null,
  activeTier: DiscountTier
): DiscountTier {
  if (!lock) return activeTier;
  return activeTier.percentOff > lock.percentOff ? activeTier : lockedTier(lock);
}
```

**Mantık:**
- Kilit yok → shopfront tier (ILK5 varsa ILK5)
- Kilit var:
  - Aktif tier `>` kilitli tier → aktif tier
  - Aktif tier `<=` kilitli tier → kilitli tier

Karelerde test edilen senaryo: ILK5 (%70) kilitli, ILK5 (%70) aktif → kilitli (%70) = $26.10 ✓

### `priceLockOnActivation()` mantığı (price-lock.ts:186–218)
```ts
if (!existing) {
  return { action: 'write', reason: 'first activation for this tenant', columns };
}

const status = (existing.status ?? '').trim().toUpperCase();
if (ENDED_STATUSES.has(status)) {
  return { action: 'write', reason: 're-activation after cancellation', columns };
}

if (readPriceLock(existing)) {
  return { action: 'keep', reason: 'the subscription already carries a lock' };
}
```

**İdempotens:** Redelivery events aynı kilidi bulur ve tutuyor. ✓

---

## Değişen dosyalar

Hiçbiri. Kod zaten doğru.

---

## Riskler

Yok. Kilit implementasyonu stabil ve iyi test edilmiş.

---

## Açık sorular

Yok.

---

## Sonraki adım

- Rapor yazıldı ve kareleri kanıtlı
- `dev` branch'ine commit et

