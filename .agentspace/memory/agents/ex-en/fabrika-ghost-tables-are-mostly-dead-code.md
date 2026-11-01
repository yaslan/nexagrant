---
name: fabrika-ghost-tables-are-mostly-dead-code
description: Dört "hayalet tablo"dan üçü (Participation/Collab/OrgTopicStat) canlı çağrısı olmayan ölü koddu; sınıfın gerçek kalıntısı hayalet ALAN/İLİŞKİ — sso.ts, calls/turkey, api/v1/calls, m2 actions, alerts-daily
metadata:
  type: project
  updatedAt: 2026-09-07
---

TASK-MTRKA25R5M3SY ölçümü (rapor: `docs/agent-results/TASK-MTRKA25R5M3SY-ex-en.md`).

**Hayalet tablo hikâyesi büyük ölçüde bitmişti.** Override silinince çıkan 144 hatanın yalnız
4'ü hayalet tablo (`prisma.organization`). `Participation`, `Collab`, `OrgTopicStat` için canlı
`prisma.*` çağrısı **kalmamış** — sadece yorum satırları ve `src/types/db-rows.ts`'teki
`Legacy*Row` tipleri. Hüküm: **ölü kod, veri modeli eksiği değil.** Şemadaki karşılıklar:
Organization→`CordisOrganization` (türev sayaçlar `CordisPartnerProfile`), Participation→
`CordisParticipation`, Collab→`CordisCoParticipation`, OrgTopicStat→tek tablo yok, sorgu zamanında
`CordisProjectTopic ⨝ CordisParticipation` ya da `CordisPartnerProfile.topTopics`.
Tuzak: şemadaki `TopicStat` `OrgTopicStat` DEĞİLDİR (topicPrefix×country×orgType, organizasyon
kırılımı yok). Karşılığı olmayan tek şey `LegacyOrganizationRow.eigenvector` — açık soru.

**Asıl yaşayan kalıntı hayalet ALAN/İLİŞKİ.** Aynı sınıf, tablo yerine sütun; 8 dosyada 11 canlı
çağrı ve dördünde try/catch bile yok: `sso.ts` `Tenant.domain` (catch var → sessiz başarısızlık,
yine `success:true`), `calls/turkey/page.tsx` `Call.country/isOpen/deadline`, `api/v1/calls/route.ts`
`Topic` select'inde 6 hayalet sütun (→ endpoint hep gömülü demo satırı dönüyor),
`m2/server/actions.ts` `Opportunity.topic` + `ConceptNote.opportunity` (catch YOK),
`api/concept-notes/[id]/export` aynı ilişki (catch YOK), `inngest/jobs/alerts-daily.ts`
`SavedSearch.tenant` (catch YOK → günlük cron ölüyor olmalı), `calendar/sync.ts` SystemAlert
alan adları (`severity/type/sourceModule/metadata` yerine `level/source/message/meta`).

Ders: bir "hayalet tablo" avında `prisma.<model>` grep'i YETMEZ — `where/select/include/orderBy/data`
anahtarlarını da şemaya karşı doğrula, yoksa sınıfın çoğunluğunu kaçırırsın.

İlgili: [[fabrika-prisma-generate-alone-changes-nothing]] · [[fabrika-typecheck-is-blind-to-db-calls]]
