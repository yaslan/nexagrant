---
name: fabrika-theme-resolved-server-side-from-cookie
description: Fabrika'da tema artik sunucuda cerezden cozuluyor ve html'e yaziliyor — theme-init script'i YOK, tema degistiren kod cerezi guncellemek zorunda
metadata:
  type: project
  updatedAt: 2026-09-09
---

2026-09-09 (commit 0d16788) itibariyle Fabrika'da tema **sunucuda** belirlenir:
kok layout `cookies()` ile `fabrika-theme` cerezini okur, cerez yoksa ya da `system` ise
`headers()` uzerinden `Sec-CH-Prefers-Color-Scheme` istemci ipucuna bakar ve sonucu
dogrudan `<html class="dark" data-theme="dark">` olarak render eder.

BUNLAR ARTIK YOK, aramayi birak: `public/theme-init.js` SILINDI, layout'ta hicbir
`<script>` etiketi yok. Tema yazan bir sey ekleyecekseniz **cerezi** guncelleyin;
`localStorage` artik gerçegin kaynagi DEGIL (ThemeProvider baslangic durumunu sunucudan
prop olarak alir ve render sirasinda localStorage OKUMAZ).

Paylasilan sozlesme `src/lib/theme.ts`'te: `Theme`/`ResolvedTheme` tipleri,
`THEME_COOKIE_NAME`, `THEME_COOKIE_MAX_AGE`, `parseTheme()`. Istemci ipucu icin
`next.config.ts` her yola `Accept-CH` + `Critical-CH` yazar.

BILINCLI KABUL: Safari/Firefox istemci ipuclarini gondermez; orada cerezi olmayan
sistem-karanlik kullanici ILK ziyarette bir kez acik tema gorur, hidrasyondan sonra duzelir.

OLCULEN BEDEL: `cookies()` kok layout'u dinamiklestirir ama Fabrika zaten 117 rotanin
116'sinda dinamikti — build rota tablosu once/sonra diff'i ayni cikti, **0 rota** statiklikten
cikti. Yani bu degisiklik statiklik acisindan bedava geldi; baska projede ayni varsayimi yapma, OLC.

Kapilar: `tests/e2e/theme-no-script-warning.spec.ts` (konsolda 0 script uyarisi) ve
`tests/e2e/theme-paint-timing.spec.ts` (chunk'lar bloklu iken temanin HTML'de olmasi).
Ikisi de iki-yonlu kanitla dogrulandi.

Ilgili: [[fabrika-react-script-warning-is-a-hydration-miss]], [[fabrika-beforeinteractive-not-parse-time]]
