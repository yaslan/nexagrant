---
name: fabrika-read-the-library-source-before-round-three
description: Kutuphane uyarisini iki tur tahminle kovaladiktan sonra kaynagi okumak kosulu 10 dakikada verdi — ucuncu turdan once node_modules'u ac
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

2026-09-09'da bir React konsol uyarisini iki tur "makul gorunen" cozumle kovaladim ve iki tur da
yeni bir regresyon urettim: once `next/script beforeInteractive` (paint zamanlamasini bozdu),
sonra `public/theme-init.js` + klasik `<script src>` (paint duzeldi, uyari sürdü).
Ucuncu turdan once `node_modules` icindeki `react-dom-client.development.js`'i grep'leyip uyari
metnini bulmak kosulu ~10 dakikada verdi: uyari hidrasyon eslesmemesinden geliyordu, script'in
biciminden degil (bkz. [[fabrika-react-script-warning-is-a-hydration-miss]]).

KURAL: bir kutuphane/framework uyarisi ikinci turda hala duruyorsa, ucuncu cozumu DENEME —
once uyari metnini `node_modules` icinde grep'le ve atildigi kosulu oku. Tahminle delege etmek
worker'in zamanini degil, agacin saglamligini harciyor; her tur commit'lenmis bir regresyon birakti.

Ikinci ders: boyle bir kartta DURMA KOSULU yaz ("hipotez tutmazsa dorduncuyu deneme, geri al ve
raporla"). Aksi halde worker mekanizma degistirmeye devam ediyor.
