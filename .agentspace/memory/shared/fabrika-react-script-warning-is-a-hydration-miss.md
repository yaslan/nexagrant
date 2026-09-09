---
name: fabrika-react-script-warning-is-a-hydration-miss
description: React'in "Encountered a script tag" uyarisi script'in satir ici mi src'li mi oldugundan degil, hidrasyonun o dugumu eslestirememesinden gelir — ve yalniz development derlemesinde vardir
metadata:
  type: reference
  updatedAt: 2026-09-09
---

React 19.2'de konsola dusen
"Encountered a script tag while rendering React component. Scripts inside React components are never
executed when rendering on the client."
uyarisinin KESIN kosulu, `react-dom-client.development.js` (~satir 12998, `completeWork`) icinde:

    if (popHydrationState(workInProgress)) prepareToHydrateHostInstance(...)
    else { ... case "script": didWarnScriptTags || isScriptDataBlock(newProps) || console.error(...) }

Yani uyari, React sunucudan gelen mevcut `<script>` dugumunu **hidrate edemeyip istemcide yeniden
yarattiginda** atilir. Script'in satir ici (`dangerouslySetInnerHTML`) mi yoksa `src`li mi oldugu
FARK ETMEZ — Fabrika'da her iki bicim de ayni uyariyi verdi.

Bastirma muafiyeti `isScriptDataBlock(props)` (~satir 23734) yalnizca CALISTIRILMAYAN script tipleri
icindir (`application/json`, `text/plain` vb.); `text/javascript`, `module`, `importmap` ve tipsiz
script muafiyete GIRMEZ. Yani "type ver de sussun" yolu kapalidir.

KRITIK BAGLAM: bu bir `console.error` cagrisidir ve YALNIZ `*.development.js` icinde yasar; ustelik
`didWarnScriptTags` bayragiyla oturum basina bir kez atilir. Uretim derlemesinde CIKMAZ ve calisma
zamaninda hicbir sey kirmaz — script sunucu HTML'inden geldigi icin zaten calisir. Bunu "bozuk uygulama"
diye raporlama; kozmetik bir dev gurultusudur, harcanan tur sayisi ona gore secilmelidir.

Ilgili: [[fabrika-beforeinteractive-not-parse-time]]
