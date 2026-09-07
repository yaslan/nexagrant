---
name: fabrika-esr-calibration-fixture-lost-in-s10-rebuild
description: '[✅ ÇÖZÜLDÜ 2026-09-07] S10 çökme dalgasında silinen esr-calibration kiracısı ve fixture yeniden üretildi'
metadata:
  type: project
  updatedAt: 2026-09-07
---

**✅ ÇÖZÜLDÜ (2026-09-07 — TASK-MTQ2KL3JO4MK2 tarafından)**

2026-09-07'de S10 kapanış dalgasında silinmiş olan `esr-calibration` kiracısı ve 20 örnek kalibrasyon fırsatı, `pnpm beta:esr-calibration --apply` ile veritabanına yeniden yazıldı. Fixture: 20/20 (Opportunity, Proposal, GateDecision, CordisProject). Rapor: `docs/CORDIS-SAMPLE-CALIBRATION.md` — doğruluk ölçümleri (A: 80%, B: 90%), ortak anketi hazırlandı.

**Neden önemli:** `TASK-MTQ2KL3JO4MK2` (E11.3, G0 ↔ ESR kalibrasyonu, 2026-09-20'yi bekliyor bloke)
bu veriye dayanıyor. O görev yeniden başladığında önce `pnpm tsx scripts/esr-calibration.ts --apply`
ile fixture yeniden yazılmalı (idempotent upsert, izole tenant, `--rollback --apply` ile geri
alınabilir — script kendi güvenlik modelini docstring'inde anlatıyor).

**Nasıl uygula:** `esr-calibration` kiracısıyla ilgili herhangi bir görev alırsan, önce DB'de var mı
diye kontrol et (`prisma.opportunity.count({where:{tenantId:'esr-calibration'}})`) — yoksa veriyi
"eksik/bozuk" sanma, S10 rebuild'i sildi, script'i çalıştırman gerekiyor olabilir.

**İlgili:** [[fabrika-rls-can-silently-disappear]], [[fabrika-agents-share-one-working-tree]]
