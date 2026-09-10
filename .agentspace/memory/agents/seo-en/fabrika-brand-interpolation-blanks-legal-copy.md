---
name: fabrika-brand-interpolation-blanks-legal-copy
description: Fabrika'da {brand} taşıyan i18n dizesi interpolasyonsuz çağrılırsa next-intl mesaj yerine anahtar yolunu basar — yasal metin sessizce boşalır; katalogu okumak yetmez, sayfayı RENDER ET
metadata:
  type: project
updatedAt: 2026-09-10
---

`messages/*.json` içindeki bir dize `{brand}` taşıyorsa, çağıran sayfa
`t('key', { brand: PRODUCT_NAME })` demek ZORUNDA. Demezse next-intl 4.14.2
`FORMATTING_ERROR` üretir ve **mesaj yerine anahtar yolunu** render eder
(`legal.privacy.controllerBody` gibi) — hata sayfayı düşürmez, metni sessizce yutar.

2026-09-10'da ölçüldü: `src/app/[locale]/privacy/page.tsx` `PRODUCT_NAME` import etmiyordu;
aydınlatma metninin "Veri Sorumlusu" bölümü ve `<title>` etiketi her iki dilde anahtar yolu
basıyordu. `terms` ve `compliance/dpa` sayfaları da `<title>`'da aynı kusuru taşıyordu.
`terms/page.tsx` gövdede doğru yapıyordu — yani kusur sayfa-sayfa, tek tip değil.

**Neden önemli:** KVKK/GDPR denetiminde "metin katalogda var" savunma değildir; ölçüt ekranda
ne göründüğüdür. Katalog JSON'unu okuyup "metin yerinde" demek bu kusuru KAÇIRIR.

**Nasıl uygulanır:** yasal/uyum metni denetlerken katalogla yetinme —
`pnpm dev -p <boş port>` + `curl` ile sayfayı çek, script bloklarını at, görünür metinde
`\b(?:legal|settings|common)\.[a-zA-Z.]+` ara (0 olmalı) ve sunucu günlüğünde
`grep -c FORMATTING_ERROR` çalıştır (0 olmalı). Kendi başlattığın sunucuyu
`lsof -ti tcp:<port>` ile kendin kapat.

İlgili: [[fabrika-turkce-grep-yanlis-pozitif-alici]]
