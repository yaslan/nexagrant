---
name: a-nan-that-never-reaches-the-screen-is-the-dangerous-kind
description: "NaN kullanıcıya ulaşıyor mu?" diye sorulan kartta doğru cevap çoğu zaman "hayır, daha kötüsü" — karşılaştırma NaN'ı sessizce false'a çevirip makul görünen YANLIŞ bir karar üretir; testi Number.isNaN'a değil ürün anlamına yaz
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Fabrika TASK-MTVR9F6VLZ1WM: `m6/scoring.ts`'te boş `scores` → `0/0 = NaN` ortalama.
"NaN ekrana çıkıyor mu?" ölçtüm — **çıkmıyor**, ve bu iyi haber değil:
`Math.abs(NaN - x) <= 1` sadece `false` döner, yani NaN bir *karara* dönüşür.
Oy birliğiyle 5 veren panel `divergent @ %33.33`, tek oy veren panel
`divergent @ %0` — hepsi tamamen makul görünen sayılar.

**Kural: `Number.isNaN` assertion'ı bu sınıf hatayı GÖREMEZ.** Yazdığım
`never produces NaN from an unmarked reviewer` testi fix'ten ÖNCE de yeşildi.
Kırmızı olanlar ürün anlamına bakanlardı: *hangi değerlendirici sayıldı*,
*hangi yokluk adlandırıldı*. NaN'lı bir kartta test hep şunu sormalı:
"bu girdi hangi KARARI bozuyor?", "NaN görünüyor mu?" değil.

İkinci refleks: NaN aritmetiğe girmeden önce hangi karşılaştırmadan geçiyor?
`<`, `<=`, `===`, `Math.min` — hepsi NaN'ı yutar ve yerine bir yalan koyar.
Yutulduğu yeri bul; hata orada değil, yutulan değerin ürettiği çıktıda.

Karar tarafı: "yok" olanı 0 saymak yerine HESABA KATMA. Fabrika'nın kendi
yerleşik kuralı bu (`panelAverage: null` + `unmeasuredReason`, CLAUDE.md §7) —
mark 1..5 ise 0 skalanın dışıdır, düşük not değildir.
[[a-cleanup-claim-in-a-report-is-a-claim-not-a-fact]]
