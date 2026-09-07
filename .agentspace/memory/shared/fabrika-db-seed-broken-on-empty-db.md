---
name: fabrika-db-seed-broken-on-empty-db
description: pnpm db:seed BOŞ bir veritabanında P2003 ile düşüyor — seedG0DemoEvidence, hiçbir seeder'ın üretmediği demo-topic-1..6 Topic id'lerine TopicMatch bağlıyor; düşünce sonraki tüm seed adımları (teklifler, M6 paneli, gate kararları) hiç koşmuyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

S10 çökme dalgasından sonra DB tamamen boştu (`Tenant`/`Opportunity`/`User` = 0) ve
`pnpm db:seed` onu geri getirmiyor:

```
prisma/seed.ts:79 → prisma.topicMatch.upsert
Foreign key constraint violated on the constraint: `TopicMatch_topicId_fkey`  (P2003)
```

`seedG0DemoEvidence()` `TopicMatch` satırlarını **`demo-topic-1..6`** `Topic` id'lerine
bağlıyor. Bu id'ler depoda hiçbir yerde ÜRETİLMİYOR — `grep -rn "demo-topic-1"` yalnız
`prisma/seed.ts`'in kendisini ve iki rapor dosyasını buluyor. Eski veritabanında gerçek
bir K1 içe aktarımından gelmişlerdi; `seedCalls()` `Topic`'leri cuid id'lerle üretiyor.

**Neden önemli:** `main()` sırası şu — `seedTenantWorkspace → seedCalls → seedOpportunities
→ seedG0DemoEvidence → seedGateDecisions → seedProposals → seedEfforts →
seedM6EvaluatorLens → seedE11Feedback`. Kırılma 4. adımda olduğu için **teklifler, M6
panel değerlendirmesi, gate kararları ve E11 geri bildirimi hiç yazılmıyor**. Yani
"seed koştum ama demo-proposal-3 yok" diyorsan veri eksik değil, seed yarıda ölmüş.

**Nasıl uygula:** Demo veriye ihtiyacın varsa `pnpm db:seed`'in yeşil bittiğini VARSAYMA,
çıktısının son satırına bak (`Seeding completed with E10 data.`). Düşerse geçici çözüm:
`seedG0DemoEvidence` dışındaki seeder'ları scratchpad script'inden sırayla çağır
(`seed-tenant-workspace`, `seed-calls`, `seed-opportunities`, `seed-gate-decisions`,
`seed-proposals` default export; `seedM6EvaluatorLens` `seed.ts` içinde yerel, kopyalaman
gerekir). Kalıcı çözüm 4 satırlık additive bir düzeltme: `seedOpportunities()`'in zaten
kullandığı "topic yoksa `console.warn` + `continue`" desenini `seedG0DemoEvidence`'a taşı.

Ayrıca demo kiracıda `ModuleState` satırı hiç yok → M6 dâhil her modül `OFF` ve modül
rotaları kilit ekranı gösteriyor; modül rotasını test edeceksen `ModuleState`'i elle
`ON` yazman gerekiyor (bkz. [[fabrika-module-gate-is-opt-in]]).

**İlgili:** [[fabrika-esr-calibration-fixture-lost-in-s10-rebuild]],
[[fabrika-rls-can-silently-disappear]], [[fabrika-local-dev-db]]
