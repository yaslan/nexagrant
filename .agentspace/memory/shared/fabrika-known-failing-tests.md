---
name: fabrika-known-failing-tests
description: pnpm test'te taban çizgisi 4 kırmızı — 3 SEDIA ağ testi + 1 RLS testi; bunlar senin değişikliğinden değil, kovalama
metadata:
  type: reference
  updatedAt: 2026-09-06
---

`pnpm test` bu repoda **temiz bir çalışma ağacında bile** kırmızı bitiyor. 2026-09-06
itibarıyla taban çizgisi: `Test Files 3 failed | 29 passed (32)` · `Tests 4 failed | 141 passed (145)`.

Dört başarısızlık ve sebepleri:

1. `tests/sedia-adapter.test.ts` → "should format framework programme filters correctly"
2. `tests/k1-daily-calls.test.ts` → "should return empty array on fetch failure gracefully"
3. `tests/k1-daily-calls.test.ts` → "SediaTopicSchema should validate topic structure"

   Üçü de **canlı SEDIA API'sine** çıkıyor ve 5s/10s timeout ile düşüyor. Ağ/servis
   bağımlı; mock'lanmamışlar. Kendi değişikliğinle ilgisi yok.

4. `tests/rls.spec.ts` → "Tenant A cannot see Tenant B workspaces"

   `expect(workspaces.length).toBe(1)` diyor ama DB'deki **tüm** workspace'leri
   görüyor, çünkü uygulama rolü BYPASSRLS: [[fabrika-rls-bypass-local-dev]].
   Ayrıca test izole değil — mutlak sayı bekliyor, bu yüzden DB'ye herhangi bir
   kiracı eklendiğinde (ör. E11.1 beta ortakları) sayı büyür ama sonuç aynı kalır
   (hep ≠ 1). Düzeltmenin iki ayağı var: rolü BYPASSRLS'siz yapmak **ve** assertion'ı
   "yalnız kendi kiracısının kaydını görüyor mu"ya çevirmek.

Kendi değişikliğinin regresyon yapıp yapmadığını anlamak için toplam sayıya değil,
**hangi testlerin** düştüğüne bak; bu dördünün dışında bir isim varsa o senindir.
