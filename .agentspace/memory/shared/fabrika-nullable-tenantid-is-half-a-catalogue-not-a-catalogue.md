---
name: fabrika-nullable-tenantid-is-half-a-catalogue-not-a-catalogue
description: Fabrika'da `tenantId String?` bir tabloyu "paylaşılan katalog" saymak sızıntı üretir — NULL satır platformun, NULL-OLMAYAN satır BİR kiracının; id ile okuma `OR[tenantId null, tenantId]` olmak zorunda ve aynı risk Document/Chunk/AuditEvent'te de duruyor
metadata:
  type: project
  updatedAt: 2026-09-10
---

`tenant_or_shared` politikası taşıyan dört tablo (`ConceptTemplate`, `Document`, `Chunk`,
`AuditEvent`) kodda "shared catalogue, not tenant data" diye muamele görüyor. Bu **yarı doğru** ve
yarısı sızıntı: `tenantId` NULL olabilir demek "kiracı yok" değil, "**bu satırda** kiracı yok"
demektir. Aynı tabloda kiracıya ait satırlar da yaşar.

TASK-MTVTU103F11XJ'de ölçüldü: `prisma.conceptTemplate.findUnique({ where: { id: templateId } })`
— `templateId` bir server action argümanı — ile kiracı A, kiracı B'nin şablonundan `ConceptNote`
oluşturdu. 7 çağrı yerinden 6'sı bu desendeydi; 7.'si (`findFirst({ key: 'generic' })`) anahtara
göre okuyordu, o da `ORDER BY`'sız olduğu için hangi kiracının satırını döndüreceği rastlantıydı.

**Doğru kural:** `{ id, OR: [{ tenantId: null }, { tenantId }] }`, bulunamazsa REDDET — "yok" ile
"başkasının" aynı cevabı vermeli, yoksa ekran id yoklama aracına döner. Kuralı tek dosyada tut
(`src/modules/m2/server/templates.ts` bu tablo için o dosya); ikinci kopya çıkarmanın maliyeti
ölçüldü — `loadConceptNotesIndex` inline `OR` yazarak tek doğru çağrı yeriydi ve etrafında beş
yanlış çağrı yeri büyüdü.

**İki şeye aldanma:**
1. **RLS seni kurtarmıyor.** Politika tabloda var ama uygulamanın rolü BYPASSRLS —
   [[fabrika-main-db-connection-bypasses-rls]]. `where` cümlesi TEK korumadır.
2. **Yorumlara inanma.** `src/app/api/concept-notes/[id]/export/route.ts:18` "templates carry no
   `tenantId` column and no RLS policy" diyordu; **iki yarısı da yanlıştı** ve bir denetim
   referansıyla (TASK-MTSZ0AL4QP2CT §3.6) imzalıydı. Kolonu `prisma/schema.prisma`'dan, politikayı
   `pg_policy`'den oku.

**Hâlâ taşıyan:** `Document`, `Chunk`, `AuditEvent` için aynı denetim YAPILMADI. Bugün sızıntı
olmaması satırların hepsinin platform satırı olmasına bağlı — yani bir veri durumu, bir garanti
değil. İlgili: [[fabrika-undefined-tenantid-drops-the-where-clause]],
[[fabrika-rls-gates-share-one-suppression-list]].
