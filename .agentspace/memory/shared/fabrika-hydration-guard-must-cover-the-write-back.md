---
name: fabrika-hydration-guard-must-cover-the-write-back
description: localStorage okumasini render'dan cikarmak YETMEZ — ayni useIsHydrated bayragiyla YAZMA efektini de guardla, yoksa hidrasyon-oncesi bos yer tutucu depoyu her sayfa yuklemesinde siler
metadata:
  type: project
  updatedAt: 2026-09-09
---

`useState` baslaticisindaki `localStorage` okumasini `useIsHydrated()` arkasina almak
(bkz. [[fabrika-storage-during-render-is-the-repo-wide-hydration-bug]]) duzeltmenin YALNIZ YARISIDIR.

Ayni bilesende genellikle bir de **geri yazma efekti** vardir
(`useEffect(() => localStorage.setItem(KEY, JSON.stringify(state)), [state])`). Sira sudur:

1. ilk commit — `useIsHydrated()` henuz `false`, state BOS yer tutucu
2. efektler kosar → `setItem(KEY, "[]")` → **depodaki gercek veri silinir**
3. bayrak `true` olur, okuma yapilir → artik okunacak bir sey yoktur

Yani hidrasyon uyusmazligi kapanir ama sepet/veri her sayfa yuklemesinde kaybolur. Yazma efektine
`if (!isHydrated) return;` eklemek ZORUNLUDUR (`src/components/cart/CartContext.tsx`, TASK-MTU04TNPTCTQ).

Bunu hidrasyon testi YAKALAMAZ — konsol temizdir. Yakalayan olcum ayridir ve her seferinde yapilmalidir:
**gercek tarayicida UI'dan ekle → sayfayi yenile → veri hala duruyor mu.** Kart "yazma mantigina dokunma"
dese bile bu guard mantigi degistirmez, yalnizca hidrasyon-oncesi tetiklenmesini engeller.

Ayrica olculdu (TASK-MTU04TNPTCTQ): `src/lib/hooks/use-read-notifications.ts` SSR acisindan GERCEKTEN
guvenli — dolu `fonbridge_read_notifs_*` anahtarlariyla `/tr/<ws>/notifications` (hem sayfa hem
`(app)/layout.tsx`'teki `UserMenu`) sifir uyusmazlikla hidrate oldu. Tek tarayici-varsayimi: `subscribe()`
`window`'a guard'siz dokunuyor, ama React `subscribe`'i sunucuda cagirmaz.
