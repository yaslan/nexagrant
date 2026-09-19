---
name: fabrika-conflict-avoidance-must-not-shrink-a-directive
description: Çakışma korkusuyla kartı iki dosyaya daralttım ve patronun marka direktifi %5 tamamlandı — tek-kaynaklı bir değerin dönüşünde ÖNCE tam yüzeyi say, sonra kapsamı böl
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Ne oldu
Patron ürün adını `Fabrika` → `FonBridge` çevirtti. Kartı `src/lib/brand.ts` +
`smtp-form.tsx` ile sınırladım ve `messages/*.json`'a dokunmayı **yasakladım** — çünkü o an
geli-tirici o kataloglarda çalışıyordu ve çakışma istemiyordum. Worker kartı eksiksiz yaptı,
kapı yeşildi, ben patrona "değişiklik ağaçta ve doğru" dedim. Doğruydu — **kapsam içinde**.

Sonra `tests/retired-brand-name.test.ts` muhafızı kırmızıya döndü ve gerçek boyutu gösterdi:

```
src/ içinde kalan 'Fabrika' literali ......... 84
messages/{tr,en}.json ........................ 16 + 16
```

Sayfa `<title>`'ları, SEO meta açıklamaları, fiyatlandırma ve gizlilik sayfası metinleri, ICS
takvim `PRODID`'si — hepsi kullanıcıya görünen yüzeyler. Direktif ~%5 tamamlanmıştı ve ben
onu "tamam" diye raporlamıştım.

## Kök neden
Çakışma yönetimi bir **sıralama** aracıdır, **kapsam** aracı değil. Ben ikisini karıştırdım:
"orada başka worker var" bilgisini "orası bu işin parçası değil"e çevirdim. Kapsamı belirleyen
şey işin doğası olmalıydı — tek-kaynaklı bir değerin dönüşünde iş, o değerin **her yeniden
yazıldığı yer** kadardır.

## Kural
Tek-kaynaklı bir değer (marka adı, para birimi, alan adı, oran) değiştiğinde:
1. **ÖNCE tam yüzeyi SAY** — `grep -rn "<eski değer>" src/ messages/ | wc -l`. Bu sayı kartın
   boyutudur ve patrona verilecek kapsam beyanının dayanağıdır.
2. Sayı tek worker'a sığıyorsa **bölme** — çakışan dosya boşalana kadar sıraya al.
3. Bölmen gerekiyorsa **takip kartını AYNI ANDA aç** ve ikisini birbirine bağla; "sonra bakarız"
   diye bırakma.
4. Patrona "bitti" derken **kapsamı da söyle**: "brand.ts ve SMTP formu bitti; kalan 116 yer
   şu kartta" — kapsamsız "bitti" yanlış bilgidir.

## Bunu ne yakaladı
`tests/retired-brand-name.test.ts` — adı "emekli marka" olan bir muhafız. Worker onu
gevşetmedi, **ters çevirdi** (`RETIRED` sabiti `'FonBridge'`→`'Fabrika'`) ve kırmızıya döndü.
Dürüstçe ters çevrilmiş bir muhafız, öncül değişince işini yapmaya devam ediyor —
[[fabrika-a-reversed-premise-invalidates-work-already-shipped]]'in kanıtı.

İlgili: [[fabrika-a-one-line-copy-request-can-be-a-52-surface-decision]] · [[fabrika-file-ownership-delegation-works]]
