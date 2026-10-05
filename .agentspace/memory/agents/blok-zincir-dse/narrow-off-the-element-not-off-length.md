---
name: narrow-off-the-element-not-off-length
description: noUncheckedIndexedAccess düzeltirken `.length > 0` kontrolünü koruyup `!` eklemek karar mantığını NaN'a açar — daraltmayı elemanın kendisinden yap
metadata:
  type: project
updatedAt: 2026-09-10
---

`noUncheckedIndexedAccess` altında `arr[arr.length - 1]` `T | undefined` olur. Kod zaten
`if (arr.length > 0)` ile sarılıysa cazip düzeltme `arr[arr.length - 1]!`. Fabrika'da
`src/lib/gates/evaluate.ts` G3'te bunun sonucu ölçüldü: boş liste
`Math.min(undefined, undefined, undefined)` = **NaN** üretir, NaN her eşik karşılaştırmasında
`false` döner, yani gate sessizce geçer ama `GateDecision.inputs`'a `minCriterionScore: NaN`
yazılır — eşiğin diğer yönünde *"Criterion score NaN is below minimum required 4"* diye dosyalanır.
Kimsenin değerlendirmediği teklif, **değerlendirilip kaldığı** kayda geçer (CLAUDE.md §7 ihlali).

Doğrusu `.length` yerine elemandan daraltmak — mevcut else dalı olduğu gibi korunur:

```ts
const latest = opp.evaluations[opp.evaluations.length - 1];
if (latest) { /* ölç */ } else { /* "ölçülemedi" dalı, zaten vardı */ }
```

**Why:** `.length` kontrolü ile index erişimi arasında TS bağ kuramaz; `!` o boşluğu kapatmaz,
sadece susturur. Karar/puan/kapı mantığında susturulan undefined NaN'a, NaN da "ölçüldü ve kaldı"
gibi okunan bir kayda dönüşür — `null`/absent ile `0`/NaN arasındaki fark Fabrika'da tekrar eden
kusur sınıfı (bkz. M6 "not-measured contract").

**How to apply:** Karar veren kodda `!` kullanma. Daraltmayı elemandan yap; sınırlı döngülerde
`for (const [i, x] of arr.entries())` guard'ı tamamen gereksiz kılar. `.split('T')[0]` gibi
"her zaman var" erişimlerde repoda zaten baskın olan `.slice(0, 10)` idiomunu kullan.
Guard'ın işe yaradığını yeşil testle değil, naif `!` düzeltmesini geri koyup testin kırıldığını
görerek kanıtla.

[[fabrika-verification-recipe-mutation-and-counterfactual]]
[[measure-a-compiler-flag-with-a-sibling-config-not-by-editing-the-shared-one]]
