---
name: fabrika-tenant-gate-model-set-exclusions-are-silent
description: Fabrika'da scripts/rls-models.ts'teki SYSTEM_WIDE / NULLABLE_TENANT üyeliği bir modeli HER kiracı kapısından birden çıkarır — ConceptTemplate orada olmasına rağmen tenantId sütunu TAŞIYOR; kapılar dışladıklarını gerekçesiyle BASMALI
metadata:
  type: project
  updatedAt: 2026-09-10
---

`scripts/rls-models.ts` üç kapının ortak kaynağı: `tenantScopedModels()` `prisma/schema.prisma`'yı okuyup `tenantId String` taşıyan modelleri döndürür, ama önce `SYSTEM_WIDE` ve `NULLABLE_TENANT` kümelerindekileri ÇIKARIR. Bu iki kümeye üyelik `pnpm rls:check`, `pnpm rls:verify` ve `pnpm rls:bypass-check`'ten **aynı anda** muafiyettir ve dosyanın kendi docstring'i bunu uyarıyor ("A table belongs here because it has no tenant, never because adding it makes the gate quiet").

Bunu yeniden kullanmak DOĞRU seçim (ikinci bir isim listesi açmak, kapıların "kapsanmış" tanımı üzerinde anlaşmasını sağlayan tek kaynağı böler) ama iki tuzağı var:

1. **Muafiyet SESSİZDİR.** Bir model kümede olduğu için hiçbir kapı ondan söz etmez; envanteri okuyan biri "eksik satır" sanır. TASK-MTVRAZSUVLL9R'de kapı bu yüzden bir **katalog notu** basıyor: dışlanan ama `src/**` içinde okunan her modeli, çağrı sayısıyla ve GEREKÇESİYLE listeliyor.
2. **`NULLABLE_TENANT` "kiracısız" DEMEK DEĞİLDİR.** `Document`, `Chunk`, `ConceptTemplate`, `AuditEvent` — dördü de `tenantId String?` taşır, yani NULL OLMAYAN bir kiracıya ait satır TUTABİLİRLER. Politikaları `tenant_isolation` değil `tenant_or_shared` (`tenantId IS NULL OR tenantId = current_setting('app.tenant_id', true)`) ve politika DOĞRU yazılmış — hatalı olan çağrı yerleri. `ConceptTemplate`'i istemciden gelen `templateId` ile kiracı kolu olmadan okuyan üç yer var (`concept-notes/actions.ts:28`, `m2/server/actions.ts:95`, `m2/page.tsx:69`). Ölçtüm: 7 satırın 7'si de platform satırı, kiracıya ait şablon 0 — yani bugün canlı sızıntı YOK, kusur GİZLİ. İlk kiracı şablonu yaratıldığı gün iki yönde birden bozulur: bugünün rolünde B, A'nınkini okur; `fabrika_app`'te A KENDİ şablonunu okuyamaz (kapsamsız çağrı `app.tenant_id` kurmaz, politika yalnız NULL satırlarla eşleşir). Kart: TASK-MTVTU103F11XJ.

**Why:** Bir kapının kapsamı, kapının kendisi kadar önemlidir ve kapsam dışı kalan şey hiçbir çıktıda görünmediği için denetlenmez. Bir kart bana "`conceptTemplate` ve `Topic`'i ada göre allowlist'e ekle, ikisinin de `tenantId` sütunu yok" dedi — `Topic` için doğruydu, `ConceptTemplate` için YANLIŞ (`schema.prisma:994`, `tenantId String? // null = platform`). Kart metnindeki şema iddiasını şemaya karşı doğrulamasaydım yanlış bir muafiyeti gerekçesiyle birlikte yazmış olurdum.

**How to apply:** Fabrika'da kiracı kapsamıyla ilgili bir kapı yazarken `tenantScopedModels()`'i yeniden kullan, ama (a) dışladığın modelleri çağrı sayısıyla ve gerekçesiyle BAS — muafiyet görünür olsun; (b) bir modelin "kiracısız" olduğunu kart metninden değil `prisma/schema.prisma`'dan doğrula; (c) `NULLABLE_TENANT` modelleri için ayrı bir kural gerektiğini bil — o kural KULLANILAN İSTEMCİYLE değil `where` cümlesinin şekliyle ilgilidir (yalnız `id` ile `findUnique`, kiracı kolu yok) ve `AuditEvent`'in 11 çağrısını da kapsayacağı için kendi baseline'ını ister. Bkz. [[fabrika-cross-tenant-calls-are-a-precondition-not-an-exception]], [[fabrika-a-shared-tree-ratchet-must-warn-on-improvement]].
