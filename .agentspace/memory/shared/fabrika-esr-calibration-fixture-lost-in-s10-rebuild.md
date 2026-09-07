---
name: fabrika-esr-calibration-fixture-lost-in-s10-rebuild
description: S10 çökme dalgasının şema rebuild'i esr-calibration kiracısını (20 örnek fırsat, scripts/esr-calibration.ts) sildi — TASK-MTQ2KL3JO4MK2 devam etmeden önce --apply ile yeniden üretilmeli
metadata:
  type: project
---

2026-09-07'de (TASK-MTQWBAJ2T5XSV, F11/F14) DB'yi denetlerken: `esr-calibration` kiracısı DB'de yok,
tek kiracı `demo-tenant` (5 opportunity). S10 kapanış dalgasında biri şemayı yeniden kurmuş (RLS
politikaları da uçmuştu — bkz. [[fabrika-rls-can-silently-disappear]]) ve bu, `scripts/esr-calibration.ts
--apply`'ın yazdığı 20 örnek kalibrasyon fırsatını da silmiş.

**Neden önemli:** `TASK-MTQ2KL3JO4MK2` (E11.3, G0 ↔ ESR kalibrasyonu, 2026-09-20'yi bekliyor bloke)
bu veriye dayanıyor. O görev yeniden başladığında önce `pnpm tsx scripts/esr-calibration.ts --apply`
ile fixture yeniden yazılmalı (idempotent upsert, izole tenant, `--rollback --apply` ile geri
alınabilir — script kendi güvenlik modelini docstring'inde anlatıyor).

**Nasıl uygula:** `esr-calibration` kiracısıyla ilgili herhangi bir görev alırsan, önce DB'de var mı
diye kontrol et (`prisma.opportunity.count({where:{tenantId:'esr-calibration'}})`) — yoksa veriyi
"eksik/bozuk" sanma, S10 rebuild'i sildi, script'i çalıştırman gerekiyor olabilir.

**İlgili:** [[fabrika-rls-can-silently-disappear]], [[fabrika-agents-share-one-working-tree]]
