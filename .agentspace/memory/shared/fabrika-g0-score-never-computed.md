---
name: fabrika-g0-score-never-computed
description: G0 puanı ARTIK hesaplanıyor (2026-09-07 düzeltildi) — asıl kalan sorun kanıt verisi yok; demo kiracıda her fırsat %18 kapsamla 18 puan alıyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

**DURUM DEĞİŞTİ — bu dosya artık "hesaplanmıyor" demiyor.**

2026-09-07 sabahı ölçülen bulgu (TASK-MTQ63RR8Z0G8E keşfi): `scoreG0()`/`decideG0()` üretimde hiç
çağrılmıyordu; `Opportunity.g0Score` ya seed sabitinden (75/82/85/88/92) ya da
`Math.floor(Math.random() * 15 + 80)`'den geliyordu ve kapı bu uydurma sayıyla karar veriyordu.

2026-09-07 öğleden sonra **kapatıldı** (aynı görevin 2. turu):
- `src/lib/scoring/g0-features.ts` — kayıt anlık görüntüsü → 7 özellik + 2 sert olgu + kaynak izi (saf)
- `src/lib/scoring/g0-compute.ts` — Prisma okuması + puanlama + kalıcılık; G0 puanı yazan **tek** yer
- çağrı noktaları: `gates/evaluate.ts` (G0 artık kendi puanlıyor), `pipeline/actions.ts::createOpportunity`,
  `prisma/seed-opportunities.ts`, `scripts/rescore-g0.ts` (`pnpm jobs:g0-rescore`)
- `src/lib/scoring/g0.ts` (4-faktör 0–10 ölü model) SİLİNDİ
- kanıt kaydı: `TopicMatch.g0Score` + `TopicMatch.breakdown` (katkılar, kaynak izi, coverage,
  `assessment: "internal-pre-assessment"`) ve `GateDecision.inputs.g0Evidence`

**ASIL KALAN SORUN — VERİ, KOD DEĞİL.** Demo kiracıda kanıt tablolarının hiçbiri seed edilmemiş:
`TopicStat` boş, `TopicMatch` yok, `TenantProfile.keywords` yok, `Tenant.pic` yok, CORDIS yok.
Sonuç: beş demo fırsatının hepsi **18 puan / %18 kanıt kapsamı** alıyor ve TÜM G0 kapıları düşüyor.
Panoda gördüğün düşük puan bir hesaplama hatası DEĞİL, veri yokluğunun dürüst raporu.
Kanıtı görmek için: `pnpm jobs:g0-rescore -- --tenant demo-tenant --verbose` (her özelliğin
kaynağını ve neden `missing` olduğunu satır satır basar).

Kapı karar semantiği kasıtlı değiştirilmedi — bkz. [[fabrika-g0-scoring-three-implementations]]
(Açık karar #8 hâlâ açık). Uygulama tuzağı için [[fabrika-g0-evidence-placeholder-laundering]].
