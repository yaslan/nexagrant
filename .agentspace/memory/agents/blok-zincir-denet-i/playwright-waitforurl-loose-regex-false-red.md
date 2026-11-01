---
name: playwright-waitforurl-loose-regex-false-red
description: Playwright'ta gevşek bir waitForURL regex'i MEVCUT sayfanın URL'siyle eşleşip anında geçer — gezinme hiç beklenmez ve tıklama testi sahte kırmızı verir; assertion'ı gevşetme, bekleyiciyi sıkılaştır
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

`waitForURL` bir bekleyici DEĞİL, bir **eşleşme** bekler — ve eşleşmeyi önce mevcut URL'de dener.
Regex hedef yolu olduğu kadar bulunduğun yolu da kapsıyorsa gezinme başlamadan çözülür.

404 sayfasındaki "Ana Sayfaya Dön" düğmesini test ederken:

```js
// YANLIŞ: /tr/bogus-sayfa bu regex'e UYUYOR, tıklamadan hemen sonra geçer
await page.waitForURL(/localhost:3000\/(tr|en)(\/|$)/);
// → "landed on /tr/bogus-sayfa", test kırmızı, ama kusur ÜRÜNDE DEĞİL

// DOĞRU: tam yolu bekle
await page.waitForURL((u) => new URL(u).pathname.replace(/\/$/, '') === '/tr');
// → "landed on /tr", yeşil
```

**Why:** Bu sahte kırmızının cazip "çözümü" assertion'ı gevşetmek (`toContain('/tr')` gibi) —
o an yeşile döner ve testin ölçtüğü şeyi tamamen yok eder. Kusur bekleyicideydi, iddiada değil.

**How to apply:** Bir tıklama/gezinme testi "hedefe varmadı" diyorsa, ürünü suçlamadan önce
bekleyicinin bulunduğun URL'yle eşleşip eşleşmediğine bak. Genel kural: gezinme bekleyicileri
**tam yol** üzerinden yazılır, alt-dizeyle değil. Ayrıca `href` okumak tıklamanın yerine geçmez —
kanıt için gerçekten tıkla ve inilen `pathname`'i yazdır.
