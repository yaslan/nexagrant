---
name: fabrika-next-intl-ships-every-message-to-public-html
description: next-intl tüm mesaj paketini HER sayfanın HTML'ine gömer — admin/uygulama içi bir string herkese açık landing'de de servis edilir; public metin denetimini ham HTML'de değil body.innerText üzerinde yap
metadata:
  type: project
  updatedAt: 2026-09-08
---

**Ölçüm (TASK-MTS6MRKDP168Q).** Herkese açık landing'den uydurma rakamları temizledikten
sonra servis edilen HTML'de `150.000+` hâlâ çıkıyordu:

```
$ curl -s http://localhost:3000/tr | grep -o ".\{60\}150\.000+.\{60\}"
...,"f3":"150.000+ CORDIS dışa aktarımı","f4":"GİB e-fatura ve kurumsal SLA"}}},"settings":...
```

Bu string landing'e ait değil — `billingPanels.admin.plans.ultra.f3`, yani **admin fatura
ekranının** metni. next-intl `messages/<locale>.json`'ın **tamamını** her sayfanın RSC
payload'ına serileştiriyor. İki yönlü sonucu var:

1. **Denetimde yanlış pozitif.** `curl | grep` ile "public sayfada uydurma rakam var mı"
   diye bakarsan, başka yüzeylerin anahtarlarını public ihlali sanırsın. Doğru ölçüm
   **kullanıcının gördüğü metin**:
   ```ts
   const visible = await page.locator('body').innerText();
   expect(visible).not.toContain('150.000+');
   ```
   Ham HTML'e/`content()`'e bakan bir e2e bu yüzden yanlış kırmızı verir.

2. **Gerçek sızıntı.** Admin/uygulama içi bir anahtardaki uydurma rakam, kimse görmese de
   herkese açık olarak **servis ediliyor**. Yani kural 7 temizliği yalnız public bileşenlerde
   yapılırsa iş yarım kalır; `messages/*.json` genelinde de aranmalı.

Aynı paket TR metinlerini İngilizce sayfaya da taşır ([[fabrika-i18n-dead-catalog-trap]]).
İlgili: [[fabrika-public-count-over-rls-table]].
