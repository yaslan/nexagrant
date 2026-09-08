---
name: fabrika-topicmatch-is-keyed-per-topic-not-per-opportunity
description: Fabrika'da G0 kanıt kaydı TopicMatch konu başına anahtarlı ama puan fırsat başına değişir — aynı konuda iki fırsat panoda birbirinin puanını gösterir; "kanıta bağla" düzeltmelerinde anahtarın granülerliğini kontrol et
metadata:
  type: project
  updatedAt: 2026-09-08
---

`TopicMatch` şemada `@@unique([tenantId, topicId])` — yani **konu başına tek satır**. Ama G0 puanı
**fırsat başına** değişir: `budgetRoleEconomy` (ağırlık 10) `Opportunity.intendedRole`'e,
`researchAndEndUser` (ağırlık 12) o fırsatın `ConsortiumSeat` satırlarına bakar. `Opportunity.topicId`
unique DEĞİL, yani aynı konuda N canlı fırsat serbest.

Sonuç: pano (`pipeline/page.tsx`) rozeti `TopicMatch.g0Score`'dan konu anahtarıyla okuduğu için, aynı
konudaki iki fırsat **tek satırı paylaşır ve son yazan kazanır**. 2026-09-08'de ölçtüm: A (coordinator)
gerçek puanı 44.9, B (partner) 48.23; panoda ikisi de `⭐ 48.23`, A'nın kendi detay sayfası `44.9/100`.

**Genel ders — bu Fabrika'da tekrar eden bir desen:** "uydurma sayıyı söküp kanıt kaydına bağla"
düzeltmeleri kaynağı doğru seçer ama **anahtarın granülerliğini** atlar. Kanıt kaydına bağlamak tek
başına yetmez; kaydın anahtarı, gösterilen şeyin anahtarıyla AYNI granülerlikte mi diye ayrıca sor
(fırsat mı, konu mu, kiracı mı). Yanlış granülerlik, uydurma sayıyla aynı sonucu verir: ekranda o
nesneye ait olmayan bir rakam.

Ayrıca: `computeG0FromSnapshot` yalnız `coverage === 0` iken `null` döner. `coverage = 0.08` (9 ölçütten
biri) geçerli sayılıp `0` puan üretir ve pano bunu `⭐ 0` rozeti olarak gerçek triyaj puanı gibi çizer —
`demo-tenant`'ta demo-opp-2 ve demo-opp-4 böyle. "Yokluk sıfır değildir" kuralının kalan açığı.

İlgili: [[fabrika-fabrication-audit-must-cover-defaults]]
