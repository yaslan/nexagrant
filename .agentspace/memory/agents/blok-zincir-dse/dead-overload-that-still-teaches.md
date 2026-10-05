---
name: dead-overload-that-still-teaches
description: Bir hata düzeltmesi "opsiyonel parametreyi zorunlu yaptım" diye kapandığında ölü aşırı yükleme geride kalır — silinmesi bedelsizdir ve @ts-expect-error negatif muhafızları silmeden sonra da tatmin olur; ama ikizi komşu dosyada hâlâ açık olabilir.
metadata:
  type: project
updatedAt: 2026-09-10
---

Fabrika M6'da (TASK-MTUIPYSSNLVWG) "kiracısız çağrıyı derlenemez yaptım" düzeltmesi doğruydu ama **string-öncelikli aşırı yüklemeyi yerinde bıraktı**. Ölçüm (TASK-MTV4ZJEECXNDE):

- `calculateCriterionAverage`, `calculateEvaluationScore`, `getScoreDistribution`, `compareM6ToESR` — dördünün string-öncelikli formunun **gerçek çağıranı 0**. Kalan tüm grep hitleri iki doküman yorumu + derlemenin *başarısız olmasını* bekleyen `@ts-expect-error` negatif testleri.
- Birini silme sondası: `pnpm typecheck` **0 hata**, `vitest tests/modules/m6/scoring-tenant-scope.test.ts` **15/15 yeşil**. Kritik nokta: tek argümanlı çağrı, kalan db-formuna karşı da tip hatası olduğu için `@ts-expect-error` **boşa düşmüyor** — yani ölü formu silmek negatif muhafızı sessizce çürütmüyor. Bu, silme kararının kanıtı; varsayım değil.

**Genel ders:** "opsiyonel → zorunlu" tipi bir düzeltmeyi kapatırken iki şeyi ayrıca ölç: (1) eski formun çağıranı kaldı mı (kalmadıysa formu da sil, yoksa bir sonraki geliştirici onu bulur), (2) **aynı modülün komşu dosyasında ikizi var mı**. Burada vardı: `src/modules/m6/server/comparison.ts`'de `compareM6ToESR`'ın string formu `tenantId?` opsiyonel ve tenant yoksa `prisma as unknown as TenantScopedDb` + `tenantId: undefined` ile çağırıyor; içerideki filtre `(tenantId && evaluation.tenantId !== tenantId)` olduğu için kiracı kontrolü **tümden düşüyor**. Çağıranı olmadığı için sömürülebilir değil — tetiği kurulmuş. Kapanan kartın kardeş dosyasını taramak, kartı kapatmanın parçası olmalı.

İlgili: [[branded-type-fails-where-as-unknown-as-already-lives]], [[fabrika-tenantid-ternary-fallback-bug-class]]
