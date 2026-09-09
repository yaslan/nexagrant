# TASK-MTU1CM8ITW6VH — Sepet Kalıcılığı Regresyon Kapısı

## Ne Yapıldı

Sepet kalıcılığını korumak için bir regresyon test'i eklendi. Test, `CartContext.tsx` satır 152'deki `if (!isHydrated) return;` guard'ının sepeti sayfa yenilemesinden sonra silinmesinden koruduğunu doğrulayıcı.

### Arka Plan
- **Sorun**: Hidrasyon öncesi boş yer tutucu localStorage'a geri yazılırsa, HER SAYFA YÜKLEMESİNDE müşterinin sepeti silinir.
- **Çözüm**: Guard, hidrasyon tamamlanana kadar localStorage yazışını engeller.
- **Risk**: Guard silinirse test bunu yakalamalı (bu raporun kanıt bölümünde doğrulandi).

## Kanıt

### GREEN Durum (Guard Mevcut)
```
✓  1 [chromium] › tests/e2e/hydration-clean.spec.ts:35:7 › no hydration mismatch on /tr with a full cart and the cookie banner (2.5s)
✓  2 [chromium] › tests/e2e/hydration-clean.spec.ts:35:7 › no hydration mismatch on /en with a full cart and the cookie banner (2.4s)
✓  3 [chromium] › tests/e2e/hydration-clean.spec.ts:83:5 › cart persists across page reload (4.6s)

  3 passed (10.1s)
```

**İnterpretasyon**: Test yeşil. Sepetin localStorage'a dolu yazılması ve sayfa yenilemesinden sonra korunması doğrulandı.

### RED Durum (Guard Silindi)
```
  ✘  1 [chromium] › tests/e2e/hydration-clean.spec.ts:35:7 › no hydration mismatch on /tr with a full cart and the cookie banner (12.6s)
  ✘  2 [chromium] › tests/e2e/hydration-clean.spec.ts:35:7 › no hydration mismatch on /en with a full cart and the cookie banner (12.6s)
  ✘  3 [chromium] › tests/e2e/hydration-clean.spec.ts:83:5 › cart persists across page reload (12.6s)

  1) Error: expect(locator).toBeVisible() failed
  Locator: getByRole('button', { name: 'Sepeti aç' })
  Expected: visible
  Timeout: 10000ms
  Error: element(s) not found

  2) Error: expect(locator).toBeVisible() failed
  Locator: getByRole('button', { name: 'Open cart' })
  Expected: visible
  Timeout: 10000ms
  Error: element(s) not found

  3) Error: expect(locator).toBeVisible() failed
  Locator: getByRole('button', { name: 'Sepeti aç' })
  Expected: visible
  Timeout: 10000ms
  Error: element(s) not found

  3 failed
```

**İnterpretasyon**: Test kırmızı. Guard olmadan sepetin butonu kayboldu (localStorage silinmiş). Bu test başarısıyla algılıyor ve kırılıyor.

## Değişen Dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `tests/e2e/hydration-clean.spec.ts` | Yeni test eklendi: "cart persists across page reload" |

### Diff
```diff
+test('cart persists across page reload', async ({ page }) => {
+  await page.addInitScript(
+    ([cartKey, consentKey, cart]) => {
+      try {
+        localStorage.setItem(cartKey as string, cart as string);
+        localStorage.removeItem(consentKey as string);
+      } catch {
+        // Storage unavailable would make the seeding pointless, but not this test wrong.
+      }
+    },
+    [CART_STORAGE_KEY, CONSENT_STORAGE_KEY, JSON.stringify(SEEDED_CART)] as const
+  );
+
+  await page.goto('/tr', { waitUntil: 'networkidle' });
+  await page.waitForTimeout(1500);
+
+  // Verify the cart is present before reload
+  await expect(page.getByRole('button', { name: CART_BUTTON_LABEL.tr })).toBeVisible();
+
+  // Reload the page
+  await page.reload({ waitUntil: 'networkidle' });
+  await page.waitForTimeout(1500);
+
+  // Verify the cart button is still visible after reload
+  // (this means the cart data was not erased on re-hydration)
+  await expect(page.getByRole('button', { name: CART_BUTTON_LABEL.tr })).toBeVisible();
+
+  // Verify the cart items in localStorage were not wiped
+  const cartAfterReload = await page.evaluate(() => {
+    try {
+      const stored = localStorage.getItem('fonbridge_cart_items_v2');
+      return stored ? JSON.parse(stored) : null;
+    } catch {
+      return null;
+    }
+  });
+  expect(cartAfterReload).not.toBeNull();
+  expect(Array.isArray(cartAfterReload)).toBe(true);
+  expect(cartAfterReload.length).toBeGreaterThan(0);
+});
```

**Üretim Kodu**: Değişmedi. Git diff src/ = boş.

## Riskler

Yok. Yalnızca bir test eklendi; üretim kodu değişmedi.

## Açık Sorular

Yok.

## Sonraki Adım

Test regresyon kapısı kuruldu. Görev tamamlandı. Guard silinirse, bu test PR'ı otomatik olarak kıracak ve gözden geçirenler testin açıklamasından sorunun ne olduğunu anlayacak.

---

**Commit**: `dev e502c9c` — "test(cart): guard the cart against being wiped on reload"
