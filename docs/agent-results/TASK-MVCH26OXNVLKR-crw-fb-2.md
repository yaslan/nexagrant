# TASK-MVCH26OXNVLKR (FO-59) — PR #143 yeniden inceleme (B1/B2/B3 kapanış kontrolü)

**Hüküm: ONAY.** Bloke eden bulgu yok. B1, B2, B3 kapandı. Kalan notlar bloklamaz, takip olarak aşağıda.

- **PR:** https://github.com/yaslan/fonbridge/pull/143 — `feat(billing): internal plan assignment in admin tenants (FO-59)`
- **Dal:** `fe-fb/fo59-internal-plan-dev` → taban `dev`
- **Head:** `7530c5e6` (önceki incelenen head `1c0c392c`)
- **Tip:** review · **Sprint:** SPRINT-FONBRIDGE-PS1
- **Platform:** macOS (Darwin 27) — doğrulandı. Windows / Linux: koşulamadı (bu makinede yok). Değişiklik web/DB kodu; platforma bağlı yol ya da süreç kodu yok.
- **Kod değişikliği:** yapılmadı. Merge yapılmadı. PR'a yorum atılmadı.

## Önceki bulguların durumu

### B1 — KAPANDI (kural + kapı + alarm)
- **Kural tek yerde:** `src/lib/billing/subscription-owner.ts:50-59` — `stripeSyncBlocker` (sync) ve `checkoutBlocker` (checkout) aynı kaynaktan türüyor; `CHECKOUT_BLOCK` eşlemesi `INTERNAL_PLAN_PROTECTED → INTERNAL_PLAN_CHECKOUT_CLOSED`.
- **Checkout kapısı:** `src/app/api/billing/checkout/route.ts` (diff) — `withTenant` ile abonelik okunuyor, `checkoutBlocker` doluysa 403 + `code`. Pilot kapısı aynı noktada; `isPilotSubscription` (`pilot.ts:105`) eski `getPilotState(...).kind !== 'none'` ile birebir aynı koşul (provider=pilot, TRIALING, trialEndsAt) → pilot davranışı değişmedi.
- **Arayüz:** `src/components/cart/CartDrawer.tsx` — `data.code === 'INTERNAL_PLAN_CHECKOUT_CLOSED'` → `t('internalPlanCheckoutClosed')`. Anahtar tr ve en'de var (`billingPanels.cart`).
- **Webhook sessiz düşmüyor:** `subscription-sync.ts` `reportProtected` her korunan skip'te `logger.error`; iç plan için ayrıca `recordAlert` (`source: 'stripe-webhook'`, `code`, `eventId`, `stripeSubscriptionId`; tenantId yok). `recordAlert` (`src/lib/observability/system-alert.ts:309`) aynı açık alarmı tekilleştiriyor (`repeatCount`), spam üretmiyor. `reportProtected` transaction DIŞINDA çağrılıyor (fast path ve catch sonrası), yani alarm yazımı claim/transaction'ı etkilemiyor.
- **Yanlış "replay" iddiası kaldırıldı:** `subscription-sync.ts` yorumları ve `subscription-owner.ts` başlığı artık "replay yok, Dashboard'dan elle" diyor.

### B2 — KAPANDI
- `src/app/[locale]/admin/tenants/page.tsx`: `listInternalPlans()` ayrı `try/catch`; hata yalnız rozeti düşürür, tenant listesi kendi `try` bloğunda kalır.

### B3 — KAPANDI
- `src/app/[locale]/admin/tenants/[tenantId]/page.tsx`: geçmiş artık `actorLabel` ile ad (e-posta) çözümlüyor; çözülemezse kısaltılmış id.

## Kontroller (istenen liste)
- **İç plan aktifken checkout 403 + TR/EN mesajı:** kod ve i18n doğru; gerçek tarayıcı kanıtı `e2e/admin-internal-plan.spec.ts` (fe-fb raporu 6/6) — bu incelemede yeniden koşulmadı.
- **Webhook'ta sessiz düşme yok (log + SystemAlert):** doğrulandı (yukarıda).
- **Kural tek yerde (subscription-owner.ts):** doğrulandı. Checkout, sync ve cancellation aynı `stripeSyncBlocker`'ı kullanıyor; `hasActiveInternalPlan` silinmiş, grep ile başka kopya yok.
- **Önceki bulguların hepsi kapandı mı:** evet (B1, B2, B3).
- **Testler (süre sınırlı, `perl -e 'alarm 900; exec @ARGV'`):** worktree `7530c5e6` üzerinde, pure/unit testler:
  ```
  internal-plan-checkout, subscription-sync, pilot, pilot-gates, subscription-sync-tenant-scope,
  admin/tenants actions.test.ts, admin/tenants page.test.tsx, tests/billing-manage-billing-role.test.ts
  Test Files  8 passed (8)
  Tests  78 passed (78)
  ```
- **Canlı DB testleri (`internal-plan.test.ts`, `stripe-webhook-*.live.test.ts`, fa49):** bu incelemede KOŞULMADI. Yerel 5433 açık ama paylaşımlı DB; teardown yaptığı için izole kopya olmadan koşulmadı. fe-fb'nin izole gate kanıtı (`127.0.0.1:55591/fo59`) referans alındı.

## Bulgular (bloklamayan)

### N1 — Orta (takip): ödeme, kapı açıkken başlamış bir Stripe oturumundan gelirse düşer
- `src/app/api/billing/checkout/route.ts`: kapı yalnız oturum açılırken kontrol ediliyor. Müşteri iç plan atanmadan önce açtığı Stripe oturumunu tamamlarsa webhook `INTERNAL_PLAN_PROTECTED` ile atlar, 200 döner, Stripe yeniden denemez.
- **Ne kaldı:** log + `SystemAlert` (operatör görür), ama ödeme yazılmaz ve otomatik replay yok. Patron kararı ("ödeme engellenir") gereği iade/temizlik elle. Bu, B1'in "sessiz" kısmını kapatır; "ödeme kaybı" riski ise kabul edilmiş bir ürün kararı olarak kalıyor.
- **Öneri:** yayın öncesi ops runbook'una "internal-plan alarmı = elle iade/temizlik" satırı eklensin.

### N2 — Düşük: `grantPilot` iç plan satırının üstüne yazabiliyor
- `src/lib/billing/pilot.ts` (`grantPilot`, ~satır 216-222): canlı-sağlayıcı kontrolü `providerSubId` gerektiriyor; iç plan satırında `providerSubId: null`, yani engellenmiyor. Sonuç: admin "pilot ver" dediğinde iç plan sessizce pilota dönüyor; iç plan atamasının `PlanAssignment` satırı kalıyor (yetim). Ödeme yolu değil, yalnız admin eylemi. Report'un "bilinen" notu doğru; bu PR kapsamında değil, ama takibe alınmalı.

### N3 — Düşük: pilot reddi UI'da hâlâ İngilizce
- `CartDrawer.tsx` yalnız `INTERNAL_PLAN_CHECKOUT_CLOSED` kodunu i18n'liyor; `PILOT_CHECKOUT_CLOSED` için hâlâ sunucunun İngilizce `error` metni gösteriliyor. PR'ın eski davranışı; bu PR ile regresyon değil.

### N4 — Düşük (rapor düzeltmesi): dosya yolu
- fe-fb raporunda `src/components/billing/CartDrawer.tsx` yazıyor; doğru yol `src/components/cart/CartDrawer.tsx`.

### N5 — Nit: `listInternalPlans` kendi içinde yetki kontrolü yapmıyor
- `src/lib/billing/internal-plan.ts`: `withSystemScope('platform-admin', …)` ile tüm iç plan tenant'larını (tenantId→planId) okuyor. Yalnız admin sayfası çağırıyor ve sayfa `isPlatformAdminSession` ile korunuyor; kabul edilebilir, ama dosyadaki yorum bu kısıtı belirtmeli.

## Doğru bulunanlar (önceki incelemeden korunan)
- Yetki: action `requirePlatformAdmin()`, sayfa `isPlatformAdminSession` → `notFound()`.
- Zod: `planId` enum, `note` trim + `min(1)` + `max(500)`; servis de boş notu reddediyor.
- Plan kaynağı: `grantsFor` / `FALLBACK_PLAN_ID`; ikinci plan listesi yok, şema değişikliği yok.
- Yarış: `lockPilotRow` atama ve Stripe senkronunda aynı kilit; Stripe blokajı kilit içinde tekrar kontrol ediliyor.
- Audit: `plan.internal.assigned` / `plan.internal.revoked`, eski→yeni plan + not, aynı transaction.
- Canlı Stripe aboneliği olan tenant'a atama `LiveProviderSubscriptionError` ile reddediliyor.

## Açık sorular
- Yok. N1 bir ürün kararı olarak zaten alınmış (patron: ödeme engellenir); N2 ayrı bir iş kalemi olabilir.

## Sonraki adım
- N2 için ayrı kart açılsın (grantPilot iç plan guard'ı). N1 için ops runbook satırı.
- Merge: inceleme onayından sonra lider/patron tarafından.

## Değişen dosyalar
- `docs/agent-results/TASK-MVCH26OXNVLKR-crw-fb-2.md` (bu rapor). Kod değişikliği yok.
