---
name: fabrika-storage-during-render-is-the-repo-wide-hydration-bug
description: Fabrika'da tekrar eden hidrasyon kusuru — useState BASLATICISINDA localStorage okumak; cozum icat etme, repodaki useIsHydrated kancasini kullan
metadata:
  type: project
  updatedAt: 2026-09-09
---

Fabrika'da tekrar eden bir hidrasyon anti-deseni var: **`useState` baslaticisinda `localStorage`
okumak.** Baslatici render sirasinda calisir; sunucuda depo yoktur, istemcide vardir — sunucu HTML'i
ile istemci agaci ayrisir ve React alt agaci yeniden uretir.

2026-09-09 taramasinda uc ornek bulundu:
- `src/components/ThemeProvider.tsx:19-29` — kapatildi (tema artik sunucuda cerezden cozuluyor,
  bkz. [[fabrika-theme-resolved-server-side-from-cookie]])
- `src/components/cart/CartContext.tsx:116` (`readStoredItems`) — `CartDrawer.tsx:109`'daki
  `itemCount > 0` sunucuda false, istemcide true oldugu icin yuzen sepet butonu uyusmazlik yaratiyordu
- `src/components/CookieConsent.tsx:7` — birebir ayni desen

COZUM ICAT ETME: repoda bunun icin yazilmis kanca var — `src/lib/hooks/use-is-hydrated.ts`
→ `useIsHydrated()`. `useSyncExternalStore` ile sunucuda ve hidrasyon boyunca `false`, ilk istemci
render'indan sonra `true` doner. `useState(false)` + `useEffect(() => setMounted(true))` sarmalini
KULLANMA: React 19'un `react-hooks/set-state-in-effect` kuralini ihlal eder ve her mount'ta kaskad
render uretir (kancanin kendi yorumu bunu anlatiyor). Dogru kullanim ornegi `ThemeToggle.tsx:24-26`.

TEST TUZAGI: bu hatanin testi BOS durumla yazilirsa hicbir sey yakalamaz — sepet testi
`fonbridge_cart_items_v2` anahtarini `addInitScript` ile DOLDURARAK kurulmali. Bkz.
[[fabrika-a-passing-test-can-be-satisfied-by-a-second-mechanism]].

Kasitli istisna: `src/lib/hooks/use-read-notifications.ts` depoyu okur ama `useSyncExternalStore`
tasarimidir; duzeltmeye kalkmadan once dosyanin bas yorumunu oku.

IKINCI YARISI, ATLANMASI PAHALI: bir state depodan besleniyorsa mounted-gate'i eklemek YETMEZ —
depoya YAZAN efekti de ayni bayrakla korumak zorundasin. `CartContext.tsx`'te guard olmadan
(`if (!isHydrated) return;`, satir 152) ilk commit'ten sonra efekt hidrasyon-oncesi bos yer tutucuyu
(`[]`) storage'a geri yaziyor ve **her sayfa yuklemesinde sepeti siliyordu**. Yani uyusmazligi
duzeltirken sessizce veri kaybi uretmek mumkun; duzeltmeden sonra "veri yenilemeden SONRA hala orada mi"
diye ayrica olc.
