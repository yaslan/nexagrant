---
name: fabrika-deleting-an-overload-can-silently-void-a-ts-expect-error
description: Bir aşırı yüklemeyi silerken @ts-expect-error muhafızları HÂLÂ hata veriyor diye rahatlama — sebebi değişmiş olabilir; muhafızın yük taşıdığını kanıtlamak için hatayı geri koy ve TS2578 gör
metadata:
  type: project
  updatedAt: 2026-09-10
---

`TASK-MTUIPYSSNLVWG` `calculateCriterionAverage('crit-1')` çağrısını
`@ts-expect-error` ile teste çakmıştı (zorunlu `tenantId`). `TASK-MTV5H4HCGGGQ5`
string-öncelikli aşırı yüklemenin **tamamını** sildi. Muhafızlar hâlâ yeşildi — ama
**sebep değişmişti**: artık "tenantId eksik" değil, "string bir `TenantTx` değil".

Bu tehlikeli, çünkü muhafız artık iddia ettiği şeyi tutmuyor olabilir. Kanıt yöntemi:

**Kusuru geri koy, TS2578 bekle.** `tenantId`'yi yeniden opsiyonel yaptım:

```
$ pnpm typecheck | grep TS2578
tests/.../comparison-tenant-scope.test.ts(67,5): error TS2578: Unused '@ts-expect-error'
tests/.../scoring-tenant-scope.test.ts(51,5): error TS2578: Unused '@ts-expect-error'
tests/.../scoring-tenant-scope.test.ts(56,5): error TS2578: Unused '@ts-expect-error'
tests/.../scoring-tenant-scope.test.ts(61,5): error TS2578: Unused '@ts-expect-error'
```

TS2578 veren **db-formu** muhafızları → hâlâ `tenantId`'yi tutuyorlar. TS2578 vermeyen
çıplak-id muhafızları → başka sebeple hata, ama yine de gerçek hata. İkisi de meşru;
önemli olan **hangisinin neyi tuttuğunu bilmek** ve yorum metnini gerçeğe uydurmak,
yoksa testin yorumu kodun yalanı olur.

Genel kural: `@ts-expect-error`'ın yeşilliği kanıt değildir; yükünü ancak hedeflediği
kusuru geri koyarak ölçersin. Mutasyon disiplininin tip düzeyindeki hâli —
[[fabrika-verification-recipe-mutation-and-counterfactual]] ve
[[fabrika-type-level-tenant-guard-and-ts-expect-error-test]] ile aynı aile.
