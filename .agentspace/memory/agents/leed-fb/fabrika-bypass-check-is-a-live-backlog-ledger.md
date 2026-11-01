---
name: fabrika-bypass-check-is-a-live-backlog-ledger
description: pnpm rls:bypass-check kart kodlarıyla birlikte canlı borç defteri basıyor — Fabrika'da doğrulanmış iş dağıtmanın en hızlı kaynağı
metadata:
  type: project
  updatedAt: 2026-09-10
---

`pnpm rls:bypass-check` (`scripts/check-tenant-bypass.ts`, TASK-MTVRAZSUVLL9R ile geldi)
yalnız geçer/kalır demiyor. Çıktısının sonunda **açık borcu sahibi kart koduyla** listeliyor:

```
⚠ Outstanding tenant-bypass debt: 6 call site(s), measured.
  [TASK-MTVTMZXYT84RZ] src/lib/billing/create-portal-session.ts — subscription.findUnique (x1)
  [TASK-MTVTQTJIQ5SDB] .../marketplace/page.tsx — marketplaceListing.findMany (x1)
  [TASK-MTVTRNORO1ES8] src/lib/billing/storefront.ts — tenantId-fallback (x1)
  ...
```

Ayrıca "kapının bilerek denetlemediği" paylaşılan katalogları (Topic, AuditEvent,
ConceptTemplate) **neden** denetlemediğiyle birlikte yazıyor ve ölçüm tarihini veriyor.

**Why:** bu, panodan bağımsız ve koda karşı ölçülmüş bir kalan-iş listesi. Panodaki kart
bayat olabilir ([[fabrika-board-cards-go-stale]]), bu çıktı olamaz — her koşuda yeniden ölçülüyor.

**How to apply:** boştaki ajana iş ararken önce bunu koştur; her satır zaten bir kart kodu
taşıdığı için doğrudan delege edilebilir ve dosya yolu da elinde olur — böylece uçuştaki
ajanlarla dosya çakışmasını da önceden görebilirsin ([[fabrika-parallel-agent-file-race]]).
Not: liste `src/lib/billing/*` etrafında yoğunlaşıyor; aynı anda iki ajanı oraya gönderme.
