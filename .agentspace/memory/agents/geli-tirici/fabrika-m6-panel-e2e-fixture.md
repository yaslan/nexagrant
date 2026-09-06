---
name: fabrika-m6-panel-e2e-fixture
description: Fabrika'da gerçek-tarayıcı e2e için hazır reçete — seed script + credentials login + cookie banner atlatma + main scope
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Fabrika'da oturum gerektiren bir sayfayı Playwright ile gerçek tıklamayla doğrulamanın
çalışan reçetesi (TASK-MTQ5ZF5ZRU5SM'de kuruldu, örnek: `scripts/seed-m6-e2e.ts` +
`tests/e2e/m6-evaluator.spec.ts`).

1. **Fixture**: sabit id'li idempotent seed script, `--rollback` ile tam geri alma
   (her `deleteMany` sabit id'ye anahtarlı). `seed`/`rollback` export edilir, spec
   `beforeAll`/`afterAll`'da import eder. `M6_E2E_KEEP=1` ile rollback atlanır →
   yazılan satırları elle sorgulayıp rapora kanıt koyabilirsin.
   Tuzaklar: `Membership` bileşik anahtarı `tenantId_userId` (ters değil);
   `Opportunity.workspaceId` zorunlu.

2. **Login**: Credentials sağlayıcısı sadece e-postayla giriyor.
   `/tr/giris?callbackUrl=<hedef>` → `input[type="email"]` doldur →
   **`page.locator('form button[type="submit"]').click()`**. Butonun metnini kullanma:
   TR "E-posta ile Giriş Yap →", EN farklı — locale-agnostik selector şart.

3. **Çerez bandı ZORUNLU atlatılır**: `CookieConsent` tam ekran `inset-0` bir
   `role="alertdialog"` basıyor ve TÜM sayfanın pointer olaylarını yutuyor. Tıklamadan
   önce banner'ı kapatmaya çalışma (hidrasyondan sonra geliyor, yarış var); onun yerine:
   ```ts
   await page.addInitScript(() => {
     window.localStorage.setItem('fabrika_cookie_consent',
       JSON.stringify({ necessary: true, analytics: true, marketing: true }));
   });
   ```

4. **`main`'e scope'la**: Next dev streaming sırasında giden sayfa DOM'da bir an duruyor,
   bu yüzden çıplak `getByTestId` geçici olarak 2 eşleşme verip strict-mode hatası atıyor.
   `waitForURL` → `waitForLoadState('networkidle')` → `page.getByRole('main').getByTestId(...)`.

İlgili: [[fabrika-e2e-gate-was-never-running]]
