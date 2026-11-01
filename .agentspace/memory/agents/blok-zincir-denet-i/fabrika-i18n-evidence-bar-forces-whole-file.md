---
name: fabrika-i18n-evidence-bar-forces-whole-file
description: i18n kartı birkaç satır numarası verse de kanıt "ekran EN'de İngilizce" ise dosyanın TAMAMINI çevir — yarım çeviri kanıt karesini geçemez
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

S12 kartları i18n işini "şu satırları t('...') yap" diye dar veriyor ama kanıt olarak
"EN dilinde ekranın İngilizce olduğunu gösteren kare" istiyor. On satırı çevirip kırk
satırı bırakınca kare hâlâ Türkçe çıkıyor ve iş kabul edilmiyor.

Kural: kanıt barı satır listesini değil, **ekranı** ölçüyor. Dosya zaten senin dosya
listendeyse tamamını çevir — bu kapsam aşımı değil, aynı kusurun tamamı.

Yanında iki şey daha var, kolayca atlanıyor:
- `toLocaleDateString('tr-TR')` gibi sabit locale çağrıları — `useLocale()` ile değiştir.
- Ekranda kalan Türkçe harfli tek satır kiracının KENDİ verisiyse (fırsat başlığı,
  kurum adı) doğrudur; kanıt betiğinde bunu ayıklayıp raporda söyle.

Var olan bir e2e spec çevirdiğin metni arıyor olabilir (m10-audit-identity.spec.ts
banner başlığını arıyordu): TR dizesini **birebir aynı** tut, spec yeşil kalsın.
