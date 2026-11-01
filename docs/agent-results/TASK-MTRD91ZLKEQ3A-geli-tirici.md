# TASK-MTRD91ZLKEQ3A — Faturalandırma paneli plan ID fallback düzeltmesi

## Ne yapıldı

Ayarlar → Faturalandırma panelinde emekli 'team' planı fallback olarak kullanılıyordu. Bu plan TASK-MTR6QIE05ZKNH'de emekliye ayrıldığından, PLAN_GRANTS katalogunda artık mevcut değildir.

**Düzeltme:**
- `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` line 9: `FALLBACK_PLAN_ID` import'a eklendi
- `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` line 97: `currentPlanId = 'team'` → `currentPlanId = FALLBACK_PLAN_ID` ('free')

## Kanıt

**Değişen dosya:**
```typescript
// import satırında FALLBACK_PLAN_ID eklendi
import {
  CATALOG,
  FALLBACK_PLAN_ID,  // ← yeni
  MONTHS_PER_YEAR,
  ...
} from '@/lib/billing/catalog';

// Fallback plan ID değiştirildi
export function BillingClient({
  workspace,
  locale,
  tenantName,
  currentPlanId = FALLBACK_PLAN_ID,  // ← 'team' yerine 'free'
  activeTier,
  ...
```

**Verification:**
- `pnpm lint`: temiz ✓
- `pnpm typecheck`: temiz ✓
- Kod incelemesi: FALLBACK_PLAN_ID değeri `src/lib/billing/catalog.ts:336` 'free' olarak tanımlanmış ✓

## Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx`

## Riskler

**Düşük:** Fallback planı değiştirmek yalnızca query başarısız olduğunda tetiklenir. Entitlements başarılı şekilde yüklenirse, DB'deki plan kullanılır (page.tsx line 67: `resolvePlanId(tenant.subscription.planId)`).

## Açık sorular

Yok.

## Sonraki adım

Tamamlandı. Panelde artık fallback durum 'free' planı gösterecektir.

---

**Ajan:** BE-EN (geli-tirici)
**Tarih:** 2026-09-07
**Doğrulama:** Kod inceleme + lint/typecheck temiz
