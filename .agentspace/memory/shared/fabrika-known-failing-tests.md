---
name: fabrika-known-failing-tests
description: pnpm test taban çizgisi ARTIK TEMİZ (2026-09-07 doğrulandı) — eski SEDIA ağ kırmızıları görünmüyor; kırmızı görürsen o senindir
metadata:
  type: reference
  updatedAt: 2026-09-07
---

> **2026-09-07 güncellemesi (TASK-MTQ5ZF5ZRU5SM sırasında doğrulandı):** `pnpm test` artık
> **temiz bitiyor** — `Test Files 47 passed | 2 skipped (49)` · `Tests 405 passed | 8 skipped (413)`.
> Aşağıda listelenen SEDIA ağ kırmızıları bu koşuda görünmedi (skip'e alınmış ya da düzeltilmiş
> olabilir; ayrıca kovalamadım). **Pratik sonuç: artık bir kırmızı görürsen "bilinen taban çizgisi"
> deyip geçme — muhtemelen senin değişikliğin.** Aşağısı tarihsel kayıt olarak duruyor.
>
> `pnpm typecheck` de temiz. Ama bir işe başlarken kırık gelebilir: `.next/types/validator.ts`
> silinmiş `src/app/(marketing)` dizinine referans veren bayat üretilmiş dosyalar tutuyor.
> Çözüm `pnpm build` (bu dosyaları yeniden yazar) — kaynakta hata yok demektir.

## e2e tabanı — 1 bilinen kırmızı (2026-09-07)

`pnpm exec playwright test tests/e2e/m6-evaluator.spec.ts` → **1 failed / 5 passed**:
*"a seated reviewer scores a proposal and sees it on the dashboard"* (satır 48). Slider
`fill('5')` sonrası `m6-criterion-innovation-value` etiketi varsayılan `3/5`'te kalıyor.
`git stash` ile ölçüldü (TASK-MTQW8188AWOAT): modül kapısı değişiklikleri geri alındığında da
AYNI şekilde düşüyor, yani önceden var. Kart: `TASK-MTQZ9767FOZMB`. Bunun DIŞINDA bir e2e
kırmızısı görürsen o senindir.

## Tarihsel kayıt (2026-09-06 ve öncesi)

O tarihte `pnpm test` temiz bir çalışma ağacında bile kırmızı bitiyordu.

**Taban çizgisi (2026-09-06, TASK-MTQ0BIV9UXVRU sonrası):**
`Test Files 2 failed | 42 passed (44)` · `Tests 3 failed | 320 passed (323)` — kalan
üçü de aşağıdaki SEDIA ağ testleri. Eskiden dördüncü kırmızı `tests/rls.spec.ts` idi;
**artık yeşil**, bkz. aşağıda 4. madde.

Başarısızlıklar ve sebepleri:

1. `tests/sedia-adapter.test.ts` → "should format framework programme filters correctly"
2. `tests/k1-daily-calls.test.ts` → "should return empty array on fetch failure gracefully"
3. `tests/k1-daily-calls.test.ts` → "SediaTopicSchema should validate topic structure"

   Üçü de **canlı SEDIA API'sine** çıkıyor ve 5s/10s timeout ile düşüyor. Ağ/servis
   bağımlı; mock'lanmamışlar. Kendi değişikliğinle ilgisi yok.

4. ~~`tests/rls.spec.ts` → "Tenant A cannot see Tenant B workspaces"~~ — **ÇÖZÜLDÜ**
   (TASK-MTQ0BIV9UXVRU). Sebebi uygulama rolünün BYPASSRLS olmasıydı. Spec artık
   fixture'ları ayrıcalıklı bağlantıyla yazıp iddiaları `DATABASE_URL_RLS_TEST`
   (`fabrika_app`, NOBYPASSRLS) üzerinden okuyor: [[fabrika-rls-bypass-local-dev]].

   **Yine kırmızı görürsen** önce `pnpm db:rls-role` koştur — `DATABASE_URL_RLS_TEST`
   `.env`'de yoksa spec iddialarını atlar (git'te izlenmeyen bir dosya olduğu için
   yeni klonda kendiliğinden gelmez).

Kendi değişikliğinin regresyon yapıp yapmadığını anlamak için toplam sayıya değil,
**hangi testlerin** düştüğüne bak; yukarıdaki SEDIA üçlüsü dışında bir isim varsa o senindir.
