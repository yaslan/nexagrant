---
name: fabrika-gate-engine-has-no-callers
description: ÇÖZÜLDÜ (2026-09-07, TASK-MTQW4FY5E9UBK) — evaluateGate() artık pipeline detay sayfasından çağrılıyor; engine hâlâ kiracı filtresiz okuduğu için her ÇAĞIRAN sahipliği kendisi doğrulamak zorunda
metadata:
  type: project
  updatedAt: 2026-09-07
---

> **DURUM (2026-09-07 akşam, TASK-MTQW4FY5E9UBK): ÇÖZÜLDÜ.** Aşağıdaki teşhis tarihseldir.
> `pipeline/actions.ts → evaluateOpportunityGate` server action'ı `evaluateGate()`'i çağırıyor;
> `pipeline/[id]/client.tsx`'teki düğme bunu tetikliyor, iki `alert()` gitti. Gerçek tıklamayla
> yazılan `GateDecision` satırları artık `decidedBy = demo-user-alice` (script değil).
>
> **KALICI OLAN kısım:** `src/lib/gates/evaluate.ts` fırsatı hâlâ `findUnique({where:{id}})` ile,
> yani **tenant filtresi olmadan** okuyor ve `GateDecision`'ı kendisine verilen `tenantId` ile
> yazıyor. Bu yüzden HER çağıran, çağırmadan önce `withTenant` içinde sahipliği doğrulamak
> zorunda (bkz. `evaluateOpportunityGate`). Engine'e ikinci bir çağıran eklemeden önce ya aynı
> kontrolü kopyala ya da filtreyi engine'in içine taşı.

2026-09-07 dogfood'unda (TASK-MTQUY6BHOGO66) ölçüldü:

```
$ grep -rn "evaluateGate|gates/evaluate" src tests scripts
src/lib/gates/evaluate.ts:10:export async function evaluateGate(
tests/gates.test.ts:168,174,182,183,197,210,220,226   ← yalnız testler
(uygulama kodunda çağıran YOK — src'de kalan eşleşmeler yorum satırı)
```

Veritabanı da doğruluyor: `GateDecision` içinde `inputs.g0Evidence` taşıyan **tek** satırlar
2026-09-07 09:15–09:18 arasında, hep aynı fırsat üzerinde, bir doğrulama **script'i** tarafından
yazılmış. Kullanıcı yolundan gelen sıfır kayıt var; seed satırlarında kanıt yok.

Kullanıcının bulabildiği tek "Evaluate Gate G0" düğmesi
`src/app/[locale]/(app)/[workspace]/pipeline/[id]/page.tsx:22-25`'te ve şudur:

```ts
alert(`Evaluating Gate ${opp.stage}...`);
await new Promise(r => setTimeout(r, 1000));
alert('Evaluation passed! Moving to G1.');
```

Gerçek karar `NO_GO` olsa bile "passed" diyor ve hiçbir şey kaydetmiyor.

**Why:** Bu, [[fabrika-g0-score-never-computed]]'daki "çağrı noktaları: gates/evaluate.ts" satırının
yanlış okunmasına açık. Doğrusu: `evaluate.ts` İÇİNDE G0 artık kendi puanlıyor — ama `evaluate.ts`'in
KENDİSİ ürün tarafından hiç çalıştırılmıyor. Puanlayıcı doğru yazılmış, ürüne bağlanmamış.

**How to apply:** Bir raporda "üretimde çağrı kanıtlandı" ifadesi görünce, kanıtın bir **script**
mi yoksa **kullanıcı yolu** mu olduğuna bak. Bir fonksiyonu script'ten çağırmak "üretimde çağrılıyor"
demek değildir. İki adımlık kontrol: (1) `grep -rn "<fn>" src` ile uygulama kodunda çağıran ara —
yoksa iddia yanlıştır; (2) gerçek tıklamayla o yolu yürü. Kart: TASK-MTQW4FY5E9UBK.

İlgili: [[fabrika-done-reports-can-be-wrong]] · [[fabrika-g0-scoring-three-implementations]]
