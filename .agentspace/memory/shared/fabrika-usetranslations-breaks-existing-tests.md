---
name: fabrika-usetranslations-breaks-existing-tests
description: Bir bileşene useTranslations eklemek onun MEVCUT testlerini kırar — bu repoda global next-intl kurulumu yok, her render NextIntlClientProvider ile sarılmalı
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Bu repoda `vitest.config.mts`'in **`setupFiles`'ı yok** ve next-intl için global bir mock
da yok. Sonuç: bir client bileşenine `useTranslations` eklediğin anda, o bileşeni
provider'sız render eden **her mevcut test** patlar:

```
Error: No intl context found. Have you configured the provider?
 ❯ MeetingBriefsClient .../briefs/client.tsx:124  const t = useTranslations('m9');
```

2026-09-07'de TASK-MTQURC2H4E0WF'de yaşandı: `briefs/client.tsx`'e tek bir
`useTranslations('m9')` satırı eklemek `tests/m9-briefs-form-errors.test.tsx`'i
**7/7 geçerken 0/7'ye** düşürdü. Bileşen doğru, test kurulumu eksikti.

**Why:** i18n eklemek "yalnız metin değişikliği" gibi görünür ama bileşenin **render
sözleşmesini** değiştirir: artık bir React context'i gerektiriyor. Kırılma bileşenin
diff'inde değil, ona dokunmayan bir test dosyasında görünür — ve i18n kartları genelde
"sadece string taşıyorum" diye kapsamı test dosyalarını dışarıda bırakacak şekilde
yazılır.

**How to apply:**

1. Bir bileşene i18n eklemeden **önce** o bileşenin testi var mı bak:
   `grep -rln "<BileşenAdı>" tests/`
2. Varsa render'ı sar — ve **gerçek katalogla** sar, stub'la değil:
   ```tsx
   import { NextIntlClientProvider } from 'next-intl';
   import trMessages from '../messages/tr.json';

   render(
     <NextIntlClientProvider locale="tr" messages={trMessages} timeZone="Europe/Istanbul">
       <Bileşen … />
     </NextIntlClientProvider>,
   );
   ```
   Gerçek katalog, kaybolan/yanlış yazılmış bir anahtarı **testte** kırmızıya düşürür;
   stub ise boş bir bandın sahaya çıkmasına izin verir. Assertion'ı da katalogdan oku
   (`expect(band.textContent).toContain(trMessages.m9.generate.failed)`), metni testte
   ikinci kez yazma.
3. `timeZone` vermezsen next-intl tarih biçimlendirmede uyarı basar — vermeyi alışkanlık
   yap.
4. i18n kartının kapsamı **her zaman** dokunduğu bileşenlerin test dosyalarını da
   içerir. "Yalnız client.tsx + messages/*.json" diye yazılmış bir kapsam eksiktir.

İlgili: [[fabrika-i18n-dead-catalog-trap]] · [[fabrika-known-failing-tests]]
