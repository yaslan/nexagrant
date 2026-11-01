---
name: fabrika-math-round-is-not-floor-plus-half
description: src/lib/money.ts'te yarım-yukarı yuvarlama iki farklı yazımla duruyor (Math.round ve Math.floor(x+0.5)) — bunlar TÜM double'larda ÖZDEŞ DEĞİL, kesirli girdi alan bir kuralı "stil birliği" için diğerine çevirme
metadata:
  type: project
updatedAt: 2026-09-09
---

`src/lib/money.ts` yarım-yukarı yuvarlamayı iki ayrı yazımla içeriyor ve bu **kasıtlı**:

- `vatOnNetMinor`, `withholdingOnVatMinor`, `applyPercentDiscount`, `convertCurrencyMinor`
  → `Math.floor(x + 0.5)`
- `lineNetMinor` → `Math.round(x)`

Negatif olmayan **tam sayı** girdilerde ikisi aynı sonucu verir; docstring'ler de zaten
"`Math.round` .5'i +Infinity'ye yuvarlar, aynı şey" diyor. Ama bu **her double için doğru
değil** (2026-09-09, TASK-MTU27KSLSJZ9I'de ölçüldü):

```
$ node -e "const x=0.49999999999999994; console.log(Math.round(x), Math.floor(x+0.5));"
0 1
```

`0.49999999999999994` 0.5'in altındaki en büyük double; ona 0.5 eklemek ikili kayan
noktada tam olarak `1`'e yuvarlanır, `floor` da 1 döner. `Math.round` ise spec gereği 0
verir.

**Kural:** yalnız tamsayı minor-unit alan fonksiyonlarda (`vatOnNetMinor` gibi — girdisi
zaten `Math.round`'dan çıkmış bir tamsayı) iki yazım serbestçe değiştirilebilir. Girdisinde
**kesirli bir sayı** olan fonksiyonlarda (`lineNetMinor`'ın `quantity`'si —
`invoiceLineSchema` `z.number().positive()` diyor, yani 0.5 gün / 0.333 ay geçerli)
yazım DEĞİŞTİRİLEMEZ: çarpıma keyfi double giriyor. Bir refactor "modül stiline uysun"
diye `Math.round`'u `floor(x + 0.5)` yapmak isterse, bu GİB'e giden bir belgenin
matrahını sessizce oynatabilir.

`src/lib/money.test.ts` bu ayrımı bir testle çiviliyor
(`lineNetMinor(0.49999999999999994, 1)` → 0, `Math.floor(...+0.5)` → 1). Test "gereksiz
edge case" diye silinmemeli; yazımı koruyan tek şey o.

İlgili: [[fabrika-vat-inclusive-split-cannot-hit-every-amount]] ·
[[fabrika-a-refactor-docstring-claims-work-that-may-not-exist]]
