---
name: fabrika-blame-e2e-failure-without-stashing
description: Ortak ağaçta stash edemediğinde bir e2e hatasının senin olup olmadığını kanıtlama — kendi bileşeninin BULUNMADIĞI bir sayfada aynı hatayı say
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

`[[fabrika-blame-the-e2e-failure-with-a-stash]]` "kendi dosyalarını stash et, testi tekrar koş"
diyor. Ama S10 kapanış dalgası gibi **dört ajan tek çalışma ağacında** çalışırken stash riskli:
`git stash` senin dosyalarını alırken başkasının yarım işine de dokunabilir
([[fabrika-agents-share-one-working-tree]]).

Stash'siz, 30 saniyelik alternatif: **hatayı senin kodunun BULUNMADIĞI bir sayfada say.**

2026-09-07, TASK-MTQWBAJ2T5XSV: pipeline panosu hidrate olmuyordu, konsol saniyede yüzlerce
`Maximum update depth exceeded` basıyordu. Ben o sırada `board.tsx`'te bir `useEffect`
kaldırmıştım — ilk şüpheli bendim. Tek kullanımlık probe:

```ts
// tests/e2e/__loop-probe.spec.ts — koşup silinir
for (const url of ['/tr/giris', '/tr']) {   // panonun HİÇ render edilmediği sayfalar
  test(`loop probe ${url}`, async ({ page }) => {
    let n = 0;
    page.on('console', (m) => { if (m.type() === 'error' && m.text().includes('Maximum update depth')) n++; });
    await page.goto(url);
    await page.waitForTimeout(6000);
    console.log(`PROBE ${url}: ${n}`);
  });
}
```

```
PROBE /tr/giris: 853
PROBE /tr:      1016      → benim bileşenim orada yok, dolayısıyla hata benim değil
```

Gerçek kaynak `src/components/UserMenu.tsx` (uygulama kabuğu) idi ve o sırada BAŞKA bir ajan
zaten düzeltiyordu. Onların düzeltmesi ağaca düşünce aynı probe `0 / 0` verdi ve kendi e2e'm
ilk denemede geçti.

Kural: **düzeltmeye başlamadan önce sahipliği kanıtla.** Kendi dosyalarına dokunmadan yapılacak
iki ölçüm var:
1. Hatayı senin kodunun olmadığı bir rotada say (yukarıdaki).
2. Sayı sıfırsa/başkasınınsa: BEKLE ve tekrar ölç — paralel ajan dalgasında düzeltme dakikalar
   içinde gelebilir. Onların dosyasını "yardım olsun" diye düzeltme; çakışırsın.

Yan not: `page.on('console')` + `page.on('pageerror')` + `page.on('requestfailed')` üçlüsünü
teşhis edeceğin her Playwright probe'una koy — `waitFor` zaman aşımı sana "neden" demez,
tarayıcı konsolu der.

İlgili: [[fabrika-playwright-dogfood-recipe]], [[fabrika-parallel-agent-file-race]]
