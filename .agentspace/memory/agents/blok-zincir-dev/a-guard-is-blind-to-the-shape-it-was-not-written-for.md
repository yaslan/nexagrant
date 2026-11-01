---
name: a-guard-is-blind-to-the-shape-it-was-not-written-for
description: Bir yasak-değer muhafızı yalnız YAZILDIĞI BİÇİMİ görür — marka adını arayan tarama, aynı markanın alan adı biçimini (küçük harfli fabrika.dev) hiç göremez; muhafız yeşilken bile değer dışarı gitmeye devam eder
metadata:
  type: feedback
updatedAt: 2026-09-10
---

`tests/retired-brand-name.test.ts` `RETIRED = 'Fabrika'` (büyük F, tek biçim) arıyor. Muhafızı
5/5 yeşile getirdikten ve `src/`'deki kalıntıyı 13 → 1'e indirdikten SONRA üretim yolunu
gerçekten koşturdum (`pnpm beta:pricing`) ve giden e-postanın footer'ında emekli markayı
buldum: `feedback@fabrika.dev`. Ölçtüm: 14 dosyada 23 geçiş, dört ayrı varyant
(fabrika.app/dev/io/eu) — bazıları giden postanın ZARF BAŞLIĞINDA, üstelik
`from: 'FonBridge <no-reply@fabrika.app>'` gibi yeni marka + emekli alan adı aynı satırda.

**Neden:** muhafız bir DEĞERİ değil, o değerin BİR YAZIMINI kovalıyor. Aynı kavramın öbür
biçimleri (küçük harf, alan adı, slug, kısaltma, URL) tarama penceresinin dışında kalıyor ve
"yeşil muhafız" bunu kanıt sanmaya davet ediyor.

**Nasıl uygula:** Bir muhafızı yeşile getirdiğinde "bitti" DEME — muhafızın gördüğü biçimi ve
GÖRMEDİĞİ biçimleri ayrı ayrı yaz. Değer dışarı giden bir metne (e-posta, User-Agent, belge)
basılıyorsa üretim yolunu koştur ve ÇIKTIYA bak; kaynak koddaki yeşil tarama bunun yerine
geçmez. Bulduğun öbür biçimi kendi kartının kapsamında değilse ADIYLA ve SAYIYLA bildir.

Aynı olgunun arayüz-dışı yüzü: [[fabrika-a-value-sweep-leaves-its-residue-outside-the-ui]].
Tamamlayıcı: [[fabrika-two-way-evidence-for-guard-tests]] muhafızın ÖLÇTÜĞÜNÜ kanıtlar,
bu kayıt muhafızın GÖRMEDİĞİNİ. İkisi ayrı sorudur.
İlgili: [[a-blanket-never-assertion-can-be-the-wrong-one]],
[[a-handed-down-root-cause-is-a-hypothesis]].
