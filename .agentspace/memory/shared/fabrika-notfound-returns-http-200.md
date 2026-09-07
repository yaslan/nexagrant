---
name: fabrika-notfound-returns-http-200
description: ÇÖZÜLDÜ 2026-09-08 — notFound() artık 404 döner; sebep [workspace]/loading.tsx idi, bir Suspense sınırı 200'ü sayfa karar vermeden tele veriyordu; kural — lookup ile var/yok'a karar veren bir segmentin ÜSTÜNE loading.tsx koyma
metadata:
  type: project
  updatedAt: 2026-09-08
---

**DURUM: ÇÖZÜLDÜ** (2026-09-08, TASK-MTRNO3LBZB2Q7, commit `02e22be`). Aşağısı hem kapanış
kanıtı hem de aynı hatayı geri getirmemek için kural.

## Neydi
`(app)/[workspace]/...` altında `notFound()` çağıran sayfa doğru 404 ekranını gösteriyor ama
sunucu **HTTP 200** döndürüyordu. Oturumlu ölçümde 11/11 rota 200'dü.

## Kök neden (kontrollü deneyle kanıtlandı)
Tek dosya: `src/app/[locale]/(app)/[workspace]/loading.tsx`. Bir `loading.tsx`, o segmentin
altındaki HER rotanın üstüne bir Suspense sınırı koyar; Next kabuğu — ve **200 durum satırını** —
sayfa kaydın var olup olmadığına karar vermeden akışa verir. Sonradan atılan `notFound()` yalnız
gövdeyi değiştirebilir, durum kodunu değil. Birbirinin kopyası iki sonda rotasıyla ölçüldü:

```
/tr/zprobe-a/missing   404   <- loading.tsx YOK
/tr/zprobe-b/missing   200   <- loading.tsx VAR   (tek fark bu dosya)
```

Elenen iki "çözüm" — ikisi de 200'ü düzeltmiyor:
- segment-yerel `not-found.tsx` eklemek,
- `notFound()` kararını `generateMetadata` içine taşımak (metadata da sınırın içinde).

## KURAL (kalıcı)
**Var/yok kararı bir veritabanı bakışıyla verilen bir segmentin ÜSTÜNE `loading.tsx` koyma.**
Pratikte: dinamik (`[param]`) çocuğu olan bir bölüme `loading.tsx` ekleme. Eklersen o alt ağacın
404'ü sessizce 200'e döner ve hiçbir tip/lint kapısı bunu yakalamaz.

Bugünkü yerleşim: iskelet `src/components/WorkspaceLoadingSkeleton.tsx`'te tek kopya; onu
`[param]` çocuğu OLMAYAN 18 bölümün kendi `loading.tsx`'i yeniden dışa aktarıyor.
`opportunities · pipeline · partners · relationships · calls · cagrilar · concept-notes · firsatlar`
bilerek sınırsız — takas: o rotalarda yükleme iskeleti yok.

Nöbetçi: `tests/e2e/notfound-status.spec.ts` — 11 rotanın 404, 7 gerçek rotanın 200 olduğunu
iddia eder; ağaç geneli bir `loading.tsx` geri gelirse ANINDA kırmızı olur.

## Ölçerken (bunu bilmeyen iki kez yanlış sonuca varır)
1. **Oturumsuz ölçüm hiçbir şey kanıtlamaz.** `(app)` düzeni oturumsuz isteği `/giris`'e **307**
   ile atar, `notFound()` hiç çalışmaz. Bu kart bir kez tam da böyle "zaten 404" diye yanlışlıkla
   kapatılmıştı (TASK-MTQYY136Q3CGG). Giriş çerezi şart.
2. **Modül kapısı sayfanın kendi kontrolünden ÖNCE cevap verir.** Modülü `OFF` bir kiracıda
   `/opportunities/<yok>/briefs` kilit ekranını ve tamamen DOĞRU bir 200'ü döndürür —
   `notFound()`'a hiç ulaşmaz. Durum kodu ölçümü, modülleri `ON` bir kiracıda yapılmalı;
   hazır fixture: `tests/e2e/fixtures/notfound-tenant.ts` (11 modül `ON` + `ultra` plan).
3. Eşleşmeyen rota (`/tr/main/zzzz`) ve `(app)` dışı (`/blog/[slug]`, `/portal/partner/[token]`)
   hep doğruydu; onlarla ölçüm yapmak hatayı gizler.

**Hâlâ açık, ayrı iş:** kök `src/app/not-found.tsx` i18n'siz — `:11` "Sayfa Bulunamadı",
`:13` açıklama, `:20` "Ana Sayfaya Dön" gömülü Türkçe ve `:17` sabit `href="/tr"`
(CLAUDE.md §8 ihlali). Bu kartta kapsam dışıydı, dokunulmadı.

İlgili: [[fabrika-e2e-fixture-needs-modulestate]] · [[fabrika-module-gate-is-opt-in]] · [[fabrika-runtime-verification-recipe]] · [[fabrika-fabricated-fallback-antipattern]]
