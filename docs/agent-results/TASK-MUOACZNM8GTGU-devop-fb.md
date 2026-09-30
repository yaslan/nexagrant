# TASK-MUOACZNM8GTGU — FB TAKİP (İNCELEME-98 Y-1/D-1 + İNCELEME-99 Ö-1) — devop-fb

**Durum:** DEVAM EDİYOR
**Dal:** `devop-fb/muoacz-csp-case` (dev `c3ba06d2`'den)

## Plan
1. Harf/yazım varyantları (`/Logo.png`, `/Favicon.ICO`, `/_NEXT/static/…`, `/_next/Image`) → proxy'ye (harfe duyarlı matcher) düşsün, nonce'lu CSP alsın.
2. Gerçek dosyalar (public/, `/_next/static/*`, `/_next/image`) proxy'siz + CSP'siz + önbellekli kalsın.
3. X2–X4 mutantlarını öldüren testler; cs-fb raporu R-2 + kod yorumu kapsamı düzeltmesi.
4. İNCELEME-99 Ö-1: `src/lib/agency/report.test.ts` durumlu-kapanış kör noktası testi.
