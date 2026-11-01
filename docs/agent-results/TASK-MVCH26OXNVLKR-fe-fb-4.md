# TASK-MVCH26OXNVLKR (FO-59): PR #143 B1 düzeltmesi, ödeme iç planda engelleniyor (fe-fb, 4. koşu)

**Hüküm:** ✅ HAZIR. B1 kapandı. Checkout iç plan aktifken 403 ile reddediliyor (TR/EN i18n mesajı, gerçek tarayıcıda kanıtlandı). Webhook tarafında sessiz düşme kalmadı: log + `SystemAlert` yazılıyor. "Replay edilir" iddiası koddan çıkarıldı. Kural tek yerde, `subscription-owner.ts`'te. Tam pre-push gate yeşil, `--no-verify` kullanılmadı. PR #143 head'i `7530c5e6`, durumu OPEN / MERGEABLE. **Merge edilmedi.**

## Ne yapıldı
Patron kararı uygulandı: iç plan aktifken ödeme ENGELLENİR.

1. **Checkout reddi, kural tek yerde.** `src/lib/billing/subscription-owner.ts` dosyasına `checkoutBlocker(sub)` eklendi. Fonksiyon `stripeSyncBlocker`'ın sonucunu eşler:
   - `PILOT_PROTECTED` → `PILOT_CHECKOUT_CLOSED`
   - `INTERNAL_PLAN_PROTECTED` → `INTERNAL_PLAN_CHECKOUT_CLOSED`

   Böylece "checkout kapalı" ile "Stripe yazamaz" aynı kuraldan türüyor ve birbirinden sapamıyor. `src/app/api/billing/checkout/route.ts` aboneliği rol kontrolünden sonra bir kez okuyor (`withTenant`), `checkoutBlocker` doluysa `{error, message, code}` ile 403 dönüyor. Eskiden ayrı duran `getPilotState` ve `hasActiveInternalPlan` kontrolleri kaldırıldı; `hasActiveInternalPlan` silindi.
2. **Arayüz.** `CartDrawer.tsx`, `INTERNAL_PLAN_CHECKOUT_CLOSED` kodu gelince `t('billingPanels.cart.internalPlanCheckoutClosed')` mesajını gösteriyor (TR + EN). Hata kutusunda `data-testid="cart-checkout-error"` var.
3. **Webhook, sessiz düşme yok.** `subscription-sync.ts` içindeki `reportProtected()` her korunan skip'te `logger.error` yazıyor. `INTERNAL_PLAN_PROTECTED` için ayrıca `recordAlert({level:'error', source:'stripe-webhook', meta:{code, eventId, stripeSubscriptionId}})` çağırıyor; meta'da tenantId yok.
4. **Yanlış yorumlar düzeltildi.** "Event claim edilmedi, sonra replay edilir" ifadesi kaldırıldı. Yerine doğrusu yazıldı: webhook `skipped` durumunda 200 döner, Stripe yeniden denemez, replay ancak Dashboard'dan elle yapılır, bu yüzden alarm üretilir. `subscription-owner.ts` başlık yorumu da güncellendi.
5. **Önceki koşunun B2/B3 düzeltmeleri korundu** (`6e281b78`): admin tenant listesinde `listInternalPlans` için ayrı try/catch; geçmişte kullanıcı ID'si yerine aktör adı/e-postası.
6. `origin/dev` dala merge edildi (`e2a2c5aa`). Tek çakışma `i18n-baseline.json`'daydı: dev sürümü alındı, sonra `--update-baseline` çalıştırıldı.
7. Gate'in yakaladığı teardown bekçisi düzeltildi (`7530c5e6`): live testteki `systemAlert.deleteMany({ id: { in: … } })` listesi `presentIds(...)` ile sarıldı.

## Kanıt (ham çıktı)
**Tam pre-push gate (4. deneme, `git push` → hook):**
```
$ pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check && pnpm rls:check && pnpm rls:bypass-check && pnpm rls:verify --require-db && pnpm db:rls-role && pnpm test:e2e && pnpm alerts:check
 Test Files  381 passed | 2 skipped (383)
      Tests  5025 passed | 54 skipped (5079)
  9 skipped
  386 passed (13.9m)
✅ Öksüz alarm yok: her açık alarm ya bir tenant adı taşımıyor ya da yaşayan bir tenant'ı gösteriyor.
   1c0c392c..7530c5e6  fe-fb/fo59-internal-plan-dev -> fe-fb/fo59-internal-plan-dev
PUSH_EXIT=0
```
Gate, ortak DB'nin izole kopyasına karşı koştu: `127.0.0.1:55591/fo59`, container `fo59fix-pg`.

**Önceki gate denemeleri (dürüst kayıt):**
- **1. deneme:** 9 kırmızı.
  - 1'i gerçekti: `teardown-where-guard` → `src/lib/billing/internal-plan.test.ts:187`. `7530c5e6` ile düzeltildi.
  - 8'i yük kaynaklı zaman aşımıydı (load ~50–70). Tek başına koşunca 6 dosya / 82 test yeşil.
- **2. deneme:** 3 zaman aşımı/hız eşiği. Bunlardan biri `rag-pdf` testinde `expected 3374ms < 3000` hatasıydı.
- **3. deneme:** 1 zaman aşımı, `expert-prereg-form` (30 sn). Tek başına 3×: 19/19 geçti, bu test 3.6–6.3 sn sürdü.
- **4. deneme:** `VITEST_MAX_WORKERS=4` ile yeşil. Testlerin hepsi yine koştu; yalnız paralellik azaldı. Load 8'e inmişti.

**Hedefli testler (izole DB):**
- 12 dosya / 105 test geçti.
- Merge sonrası: 22 dosya / 303 test geçti (`src/lib/billing`, role, checkout-auth, stripe webhook live, admin/tenants).
- Saf test: "checkout is closed exactly where Stripe may not write". 5 satırlık tablo, `checkoutBlocker === null` ⇔ `stripeSyncBlocker === null`.
- Live test: atamadan önce `checkoutBlocker(row) === null`, atamadan sonra `INTERNAL_PLAN_CHECKOUT_CLOSED`. Webhook iç planın üstüne gelince 2 `SystemAlert` yazılıyor (`level:'error'`, `code: INTERNAL_PLAN_PROTECTED`, meta'da tenantId yok).
- **Mutant:** `INTERNAL_PLAN_PROTECTED` eşlemesi null yapılınca 3 test kırmızıya döndü; dosya geri alındı.

**Gerçek tarayıcı (Playwright e2e `tests/e2e/admin-internal-plan.spec.ts`, 6/6):** iç plan atanmış tenant'ta "Ultra"yı sepete ekle → "Stripe ile ödemeye geç". Yanıt 403 + `INTERNAL_PLAN_CHECKOUT_CLOSED`, hata kutusunda i18n mesajı çıkıyor. :3000'e dokunulmadı (E2E_PORT=3159).
- TR: `docs/agent-results/TASK-MVCH26OXNVLKR-screenshots/04b-checkout-closed-internal-plan.png`. Metin: "Planınız yönetici tarafından atandı; ödeme ve plan değişikliği buradan yapılamaz. Değişiklik için bizimle iletişime geçin."
- EN: `docs/agent-results/TASK-MVCH26OXNVLKR-screenshots/04c-checkout-closed-internal-plan-en.png`. Metin: "Your plan was assigned by an administrator, so payments and plan changes are not available here. Please contact us to change it."
- B3: `docs/agent-results/TASK-MVCH26OXNVLKR-screenshots/07-history-actor-name.png`

## Değişen dosyalar
Commit'ler (dal `fe-fb/fo59-internal-plan-dev`): `6e281b78` → `f72951c3` → `e2a2c5aa` (merge origin/dev) → `7530c5e6`
- `src/lib/billing/subscription-owner.ts`: `checkoutBlocker`, `CheckoutBlock`
- `src/app/api/billing/checkout/route.ts`: tek okuma + 403 `CHECKOUT_CLOSED`
- `src/lib/billing/internal-plan.ts`: `hasActiveInternalPlan` silindi
- `src/lib/billing/subscription-sync.ts`: `reportProtected` (log + SystemAlert), replay yorumları
- `src/components/billing/CartDrawer.tsx` (önceki commit): kod → i18n mesajı, testid
- `messages/tr.json`, `messages/en.json`: `billingPanels.cart.internalPlanCheckoutClosed`
- admin tenant listesi + geçmiş (B2/B3, `6e281b78`)
- Testler: `src/lib/billing/internal-plan.test.ts`, `src/lib/billing/internal-plan-checkout.test.ts`, `tests/billing-manage-billing-role.test.ts`, admin `page.test.tsx`, `tests/e2e/admin-internal-plan.spec.ts`
- `i18n-baseline.json`: admin/tenants satırı çıktı, sayfada 0 literal kaldı
- Kanıt kareleri: `docs/agent-results/TASK-MVCH26OXNVLKR-screenshots/04b…`, `04c…`, `07…`

## Riskler
- Checkout'taki TR `message` alanı API gövdesinde sabit metin olarak duruyor; pilot reddiyle aynı kalıp. Arayüz yalnız `code`'a bakıp i18n mesajı gösteriyor. Ham `message` yalnız tanınmayan bir kodda yedek olarak çıkar.
- İç plan aktifken bir müşteri Stripe tarafında (örneğin eski bir abonelik ya da Dashboard'dan) ödeme yaparsa webhook bunu YAZMAZ, alarm üretir. İade/temizlik elle yapılır; bu, patron kararıyla uyumlu.
- `grantPilot` ve `scripts/assign-ultra-lifetime.ts` henüz `stripeSyncBlocker`'ı sormuyor (FO-59 kapsamı dışında, önceden bilinen durum).
- Gate makine yüküne duyarlı: `expert-prereg-form` ve `rag-pdf` hız eşikleri yük altında düşüyor. Bu PR ile ilgili değil.

## Açık sorular
- Yok. Patron kararı (ödeme engellenir) uygulandı.

## Sonraki adım
- crw-fb'nin PR #143'ü (`7530c5e6`) yeniden incelemesi. Merge, inceleme onayından sonra lider/patron tarafından yapılır.

## Platform beyanı
- **macOS (Darwin 27, arm64): doğrulandı.** Tam gate, e2e (chromium) ve gerçek tarayıcı kareleri bu makinede alındı.
- **Windows / Linux: koşulamadı.** Bu makinede yoklar. Değişiklik web/DB kodu (Next.js route, Prisma, React); platforma bağlı yol ya da dosya sistemi kodu yok.
