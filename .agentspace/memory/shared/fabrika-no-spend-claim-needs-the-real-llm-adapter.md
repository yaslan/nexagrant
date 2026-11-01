---
name: fabrika-no-spend-claim-needs-the-real-llm-adapter
description: "Kredi harcanmadı" iddiasını kanıtlayan test @/lib/llm'i mock'lamamalı — mock'layınca test yalnız "generateText çağrılmadı" der, AiUsageLog/CreditLedger yazılmadığını göstermez
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Fabrika'da bir kapının (ya da bir erken `return`'ün) **para harcatmadığını** iddia eden test,
`@/lib/llm`'i `vi.mock` ile değiştirirse hiçbir şey kanıtlamaz: `expect(generateText).not
.toHaveBeenCalled()` yalnızca düzeltmenin kendisini başka kelimelerle tekrar eder. İspatlanması
gereken iddia para hakkında, ve parayı hareket ettiren iki satır adaptörün İÇİNDE
(`src/lib/llm.ts` → `tx.aiUsageLog.create` + `tx.creditLedger.create`).

**Yaklaşım (TASK-MTVBL9HBML1ZH'de işe yaradı):** `@/lib/llm`'i GERÇEK bırak, yalnız üç şeyi
yerine koy —

1. `@/lib/auth` (`auth`) ve `@/lib/tenant` (`requireTenantAction` + `tenantScopeOf`): ikisi de
   AYNI sahte oturumu okusun, yoksa kapı ile action farklı kullanıcı görür.
2. `@/lib/db`: `withTenant(tenantId, cb)` → `cb(sahteTx)`; `sahteTx` içinde `aiUsageLog.create`,
   `creditLedger.create`, `creditLedger.aggregate` birer `vi.fn()`. Reddediş vakasının
   assertion'ları bunlara bakar.
3. `globalThis.fetch` (`vi.stubGlobal`): sağlayıcıya gerçekten gidilip gidilmediğini ölçer.
   Anthropic yanıt şekli: `{ content: [{type:'text', text:'…'}], usage:{input_tokens, output_tokens} }`.

Ek olarak `@/lib/env`'i `{ ANTHROPIC_API_KEY: 'test-key' }` ile ve `@/lib/billing`'i
(`getEntitlements`) mock'la; `@/lib/billing/catalog` GERÇEK kalsın ki fiyat gerçekten çözülsün.

**Mazereti kapat:** sahte bakiye 0 değil, pozitif olsun (`creditLedger.aggregate` →
`{_sum:{delta:500}}`). Yoksa `generateCompletion` zaten "yetersiz kredi" diye atar ve test yeşil
görünürken kapıyı hiç ölçmemiş olur.

Aynı ilke genel: **bir yan etkinin OLMADIĞINI iddia eden test, o yan etkiyi yazan katmanı
mock'lamamalı.** Mock'ladığın katman, kanıtlayamadığın katmandır.

İlgili: [[fabrika-module-gate-is-opt-in]] · [[fabrika-server-action-replay-proves-a-gate]]
