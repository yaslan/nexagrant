---
name: fabrika-loading-tsx-duplicates-the-whole-page
description: Fabrika'da (app) altında loading.tsx, sayfanın TAMAMININ gizli bir kopyasını DOM'da bırakır — Playwright strict mode ihlallerinin kök nedeni
metadata:
  type: project
  updatedAt: 2026-09-09
---

## Olgu (ölçüldü)

`src/app/[locale]/(app)/**/loading.tsx` bir Suspense sınırıdır. Sınır varken Next
sayfayı **sıra dışı (out-of-order) akıtır**: sunucu render edilmiş sayfanın
tamamını `<body>` sonunda bir `<div hidden id="S:0">` içine park eder, istemci ise
aynı alt ağacı yerinde render eder. Sonuç: birkaç yüz milisaniye boyunca belgede
**her id'den ve her başlıktan iki tane** bulunur.

Bu yüzden 7 e2e testi `strict mode violation: resolved to 2 elements` ile düşüyordu
(TASK-MTU4AYW5R9DGL). İkinci element GİZLİDİR (`hidden` ata düğüm), kullanıcı
görmez — ama `page.locator('#id')` ve `getByText()` gizli düğümleri de sayar.

## Testle beklemek ÇÖZMEZ

Ölçüm: `readyState=complete` ve `load` 568 ms'te geldi, ikinci kopya bundan
**156 ms SONRA** düştü. Yani `waitForLoadState('load')` bile pencerenin içinde
kalır. `networkidle` zaten bu depoda kaldırılmıştı (yarış, sinyal değil).

## Üretimde de var

`next build` + sunucu ile aynı hata yeniden üretildi — bu bir `next dev` artefaktı
DEĞİL.

## Yanlış hipotezler (tekrar deneme)

- **Tema commit'i (0d16788) değil.** Root layout'tan `cookies()`/`headers()`
  çıkarıldığında hata GEÇMEDİ, hatta 3 yerine 4 test düştü.
- **ThemeProvider'ın mount setState'i değil.** Efektteki `applyTheme()` çağrısı
  tamamen kaldırıldığında hata sürdü.
- Dashboard.tsx'e React import eklemek yalnız derleme önbelleğini geçersiz kılar.

Tema commit'i muhtemelen yalnız YARIŞI değiştirdi (parse-time engelleyici script
gidince hidrasyon erken başlıyor); nedeni o değil.

## Kural

`(app)` altında `loading.tsx` YOK. Bu daha önce `notFound()`'u 200 yapmıştı
(TASK-MTRNO3LBZB2Q7, sınır aşağı taşındı), şimdi de gizli kopya ürettiği için
tamamen kaldırıldı. Muhafız: `tests/app-shell-no-loading-boundary.test.ts`.
Yükleniyor göstergesi isteyen bölüm bunu kendi sayfasının içinde, istemci
tarafında render eder.

İlgili: [[fabrika-a-count-is-not-coverage]]
