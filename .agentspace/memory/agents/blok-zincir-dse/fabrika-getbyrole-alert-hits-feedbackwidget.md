---
name: fabrika-getbyrole-alert-hits-feedbackwidget
description: Fabrika e2e'sinde sayfa geneli getByRole('alert')/('status') kullanma — FeedbackWidget her uygulama sayfasında kendi role=alert düğümünü mount ediyor ve testin çalışan özelliği kırmızı gösteriyor
metadata:
  type: project
updatedAt: 2026-09-08
---

Fabrika'da `/[locale]/(app)/…` altındaki HER sayfada `src/components/FeedbackWidget.tsx`
mount oluyor ve içinde bir `role="alert"` düğümü var. Dolayısıyla bir spec'te

```ts
await expect(page.getByRole('alert')).toHaveCount(0);   // hata bandı yok mu?
```

yazarsan, ölçmek istediğin bant olmasa bile 1 bulur: test, kayıt gerçekten yazılmışken
ve satır ekranda dururken kırmızı verir (TASK-MTSHUZUMVLTBF ilk koşusu).

Yap: bandı `data-testid` ile daralt, a11y sözleşmesini ayrıca `toHaveRole()` ile çivile.
Bir de bandı ÇİFT bekle — hangisi gelirse:

```ts
await expect(statusBand.or(errorBand)).toBeVisible({ timeout: 30_000 });
await expect(errorBand).toHaveCount(0);
await expect(statusBand).toContainText(X);
```

Böylece POST 500 verdiğinde koşu, başarı bandını 30 sn bekleyip sebepsiz düşmek yerine
hata bandının kendi mesajıyla düşer.
İlgili: [[fabrika-verification-recipe-mutation-and-counterfactual]]
