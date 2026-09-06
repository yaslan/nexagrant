---
name: fabrika-known-failing-tests
description: pnpm test'te taban çizgisi 3 kırmızı — hepsi canlı SEDIA API'sine çıkan ağ testleri; bunlar senin değişikliğinden değil, kovalama
metadata:
  type: reference
  updatedAt: 2026-09-06
---

`pnpm test` bu repoda **temiz bir çalışma ağacında bile** kırmızı bitiyor.

**Güncel taban çizgisi (2026-09-06, TASK-MTQ0BIV9UXVRU sonrası):**
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
