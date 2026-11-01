---
name: a-locale-agnostic-test-constant-hides-a-monolingual-page
description: Bir e2e sabiti tek dilde yazılıysa, o sabiti /en sayfasında arayan iddia sınanamaz hâle gelir — sayfa tek dilli olduğu için geçer, yerelleştirme kırıksa da geçer
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Desen

`module-gate.spec.ts` şunu yapıyordu (TASK-MTV4YSO4SEMGG):

```ts
const PIPELINE_URL = `/en/${WS}/pipeline`;
const PIPELINE_HEADING = 'Fırsat & Teklif Boru Hattı';   // Türkçe literal
await expect(main).toContainText(PIPELINE_HEADING);       // /en sayfasında
```

Test yeşildi. Yeşil olmasının sebebi doğruluk değildi: **bileşen tek dilliydi**. Başlık
`board.tsx` içinde gömülü Türkçe olduğu için `/en` sayfası da Türkçe render ediyordu, sabit
de Türkçeydi, eşleşiyordu. İddia bir şey ölçmüyordu — yanlış olabileceği bir dünya yoktu.

## Kural

Bir e2e sabiti **dilden bağımsız** görünüyorsa (iki locale'de aynı literal) ve URL bir
locale içeriyorsa, **DUR**: ya sayfa gerçekten iki dilde aynı metni gösteriyordur (nadir,
gerekçelendirilmeli), ya da sayfa tek dillidir ve iddian sınanamazdır.

Doğru biçim — sabiti kataloğun kendisinden, locale'e göre oku:

```ts
import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
const HEADING = { en: enMessages.pipeline.heading, tr: trMessages.pipeline.heading } as const;
```

Bunun yan etkisi bilinçlidir: kataloğu değiştirmek testi **kırmaz** (sayfa da test de birlikte
kayar). Test metnin nasıl yazıldığını değil, *modülün render edildiğini* ölçer. Kıran şey
doğru olan şeydir: bileşenin `t()`'den çıkması.

## Nasıl doğrularım

`t()`'ye taşıdıktan sonra `<h1>`'i eski gömülü literale geri al ve testi koş — KIRMIZI
olmalı. Olmuyorsa iddian hâlâ sınanamıyordur. (Ölçüldü: `/en` bacağı `PIPELINE_HEADING.en`
üzerinde düştü, diğer 2 test geçti.)

## İlgili

[[a-blanket-never-assertion-can-be-the-wrong-one]] — orada iddia fazla güçlüydü; burada
fazla zayıf. İkisinin de teşhisi aynı: *bu iddia hangi dünyada kırmızı olurdu?*
[[fabrika-usetranslations-breaks-existing-tests]] — `useTranslations` eklemek render
sözleşmesini değiştirir; kırılma bileşenin diff'inde değil, ona dokunmayan testte çıkar.
