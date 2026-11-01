---
name: fabrika-render-loop-reads-as-infinite-skeleton
description: "Sonsuz iskelet" şikâyeti genelde veri katmanı değil, kabuktaki sınırsız React render döngüsüdür — React 19 bileşen yığını basmaz, console.error'ı addInitScript ile sarıp JS yığınını yakala
metadata:
  type: reference
  updatedAt: 2026-09-07
---

TASK-MTQW76AKXW8OP: `/tr/<ws>/opportunities/<id>/evaluations/panel` "iskelette asılı
kalıyor" diye raporlandı, ama aynı Prisma sorgusu script'ten 221 ms'de dönüyordu. Gerçek
sebep `src/components/UserMenu.tsx`'te (rotanın kendisinde değil, **uygulama kabuğunda**)
sınırsız bir render döngüsüydü: `baseNotifications` her render'da yeni bir dizi literali →
ona bağlı `useCallback` her render'da yeni → ona bağlı `useEffect` her render'da yeniden
koşuyor → `setState` → tekrar. Ana iş parçacığı dolduğu için RSC yükü hâlâ akan rota
`loading.tsx` iskeletinde kalıyordu.

**Neden önemli:** Bu semptomda ilk refleks "await edilmemiş promise / yanlış Suspense
sınırı" aramak oluyor. Sunucu tarafında saatler harcamadan önce TARAYICI KONSOLUNA bak;
`Maximum update depth exceeded` görüyorsan sorun sunucuda değil.

**Nasıl uygula (React 19 bileşen yığını basmıyor, `m.location()` yalnız react-dom
internals'ı gösteriyor):** Playwright'ta sayfa içinde `console.error`'ı sar ve yığını
kendin yakala —

```ts
await ctx.addInitScript(() => {
  (window as any).__stacks = [];
  const orig = console.error;
  console.error = function (...args: any[]) {
    const s = args.map(String).join(' ');
    if (s.includes('Maximum update depth') && (window as any).__stacks.length < 3)
      (window as any).__stacks.push(new Error('capture').stack);
    return orig.apply(console, args as any);
  };
});
// ... gezin, sonra:
const stacks = await page.evaluate(() => (window as any).__stacks);
```

Yığın `Component.useCallback[fnAdı]` → `Component.useEffect` satırlarını AÇIKÇA veriyor.

Ölçüm için de aynı dinleyiciyi sayaç olarak kullan ve birkaç rotayı tara: hangi rotaların
etkilendiğini ve düzeltmenin işe yarayıp yaramadığını 601 → 0 gibi sayıyla gösterebilirsin
(iddia değil, kanıt). Rota-başına tarama ayrıca sorunun rotaya mı kabuğa mı ait olduğunu
ayırt ettirir.

**İlgili:** [[fabrika-runtime-verification-recipe]], [[fabrika-e2e-own-fixture-hides-route-bugs]],
[[fabrika-force-server-action-failure-in-browser]]
